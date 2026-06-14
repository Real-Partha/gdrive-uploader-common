// One-time recon script: run with `npm run merge-duplicates` from backend/.
//
// Earlier versions of the backend had a race condition where concurrent
// uploads for the same date (or concurrent cold starts) could each create
// their own "PhotoUploads/YYYY-MM-DD" folder (or even their own
// "PhotoUploads" root folder / "UploadRecords" spreadsheet), splitting files
// across duplicates. This script finds those duplicates, moves every file
// from the newer duplicate(s) into the oldest ("canonical") folder, and
// deletes the now-empty duplicates. It is safe to re-run.
import 'dotenv/config';
import { google } from 'googleapis';
import { getOAuth2Client } from '../src/googleAuth.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROOT_NAME = process.env.DRIVE_ROOT_FOLDER_NAME || 'PhotoUploads';
const SPREADSHEET_NAME = 'UploadRecords';

function drive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

async function listAll(params) {
  let files = [];
  let pageToken;
  do {
    const res = await drive().files.list({ ...params, pageToken, pageSize: 1000 });
    files = files.concat(res.data.files ?? []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

/** Moves every child of `dupeId` into `canonicalId`, then deletes `dupeId`. */
async function mergeFolderInto(canonicalId, dupeId, label) {
  const children = await listAll({
    q: `trashed = false and '${dupeId}' in parents`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  for (const child of children) {
    console.log(`    moving ${child.name}`);
    await drive().files.update({
      fileId: child.id,
      addParents: canonicalId,
      removeParents: dupeId,
      fields: 'id, parents',
    });
  }

  console.log(`  deleting empty duplicate ${label} (${dupeId})`);
  await drive().files.delete({ fileId: dupeId });
}

async function main() {
  // 1. Find all "PhotoUploads" root folders; merge duplicates into the oldest.
  const roots = await listAll({
    q: `name = '${ROOT_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name, createdTime)',
    spaces: 'drive',
    orderBy: 'createdTime',
  });

  if (roots.length === 0) {
    console.log(`No "${ROOT_NAME}" folder found — nothing to do.`);
    return;
  }

  const [canonicalRoot, ...dupeRoots] = roots;
  if (dupeRoots.length > 0) {
    console.log(`Found ${roots.length} "${ROOT_NAME}" root folders; merging into ${canonicalRoot.id}`);
    for (const dupe of dupeRoots) {
      await mergeFolderInto(canonicalRoot.id, dupe.id, `root folder "${ROOT_NAME}"`);
    }
  }

  const rootId = canonicalRoot.id;

  // 2. Find all YYYY-MM-DD date folders directly under the canonical root; merge duplicates.
  const children = await listAll({
    q: `mimeType = '${FOLDER_MIME}' and trashed = false and '${rootId}' in parents`,
    fields: 'files(id, name, createdTime)',
    spaces: 'drive',
    orderBy: 'createdTime',
  });

  const byDate = new Map();
  for (const folder of children) {
    if (!DATE_RE.test(folder.name)) continue;
    if (!byDate.has(folder.name)) byDate.set(folder.name, []);
    byDate.get(folder.name).push(folder);
  }

  let mergedDates = 0;
  for (const [date, folders] of byDate) {
    if (folders.length <= 1) continue;
    mergedDates += 1;
    const [canonical, ...dupes] = folders;
    console.log(`\n${date}: merging ${dupes.length} duplicate folder(s) into ${canonical.id}`);
    for (const dupe of dupes) {
      await mergeFolderInto(canonical.id, dupe.id, `folder "${date}"`);
    }
  }

  if (mergedDates === 0) {
    console.log('\nNo duplicate date folders found.');
  }

  // 3. Warn (don't auto-merge) if there are multiple "UploadRecords" spreadsheets.
  const sheets = await listAll({
    q: `name = '${SPREADSHEET_NAME}' and mimeType = '${SPREADSHEET_MIME}' and trashed = false and '${rootId}' in parents`,
    fields: 'files(id, name, createdTime)',
    spaces: 'drive',
    orderBy: 'createdTime',
  });
  if (sheets.length > 1) {
    console.log(
      `\nWarning: found ${sheets.length} "${SPREADSHEET_NAME}" spreadsheets. The backend will use the ` +
        `oldest (${sheets[0].id}). The others contain separate logs that won't be merged automatically — ` +
        'review them manually:'
    );
    for (const s of sheets.slice(1)) {
      console.log(`  https://docs.google.com/spreadsheets/d/${s.id}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
