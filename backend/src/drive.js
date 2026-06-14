import { google } from 'googleapis';
import { getOAuth2Client, getAccessToken } from './googleAuth.js';
import { withRetry } from './util/retry.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

let rootFolderIdPromise;
// Maps dateStr -> in-flight/resolved promise for that date's folder ID. Using a
// promise (not the resolved value) means concurrent requests for the same date
// await the same lookup/creation instead of racing each other and each
// creating their own duplicate folder.
const dateFolderPromises = new Map();

function drive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

/** Lists all non-trashed folders with the given name/parent, oldest first. */
async function findFolders(name, parentId) {
  const parentClause = parentId ? `and '${parentId}' in parents` : '';
  const res = await withRetry(() =>
    drive().files.list({
      q: `name = '${name}' and mimeType = '${FOLDER_MIME}' and trashed = false ${parentClause}`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime',
      spaces: 'drive',
      pageSize: 10,
    })
  );
  return res.data.files ?? [];
}

async function createFolder(name, parentId) {
  const res = await withRetry(() =>
    drive().files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: 'id',
    })
  );
  return res.data.id;
}

/**
 * Finds the (oldest, i.e. canonical) folder with this name/parent, or creates
 * one if none exists. If duplicates already exist in Drive, the oldest is
 * always picked so new uploads converge onto a single folder going forward —
 * use `backend/scripts/merge-duplicate-folders.js` to clean up existing
 * duplicates and their contents.
 */
async function findOrCreateFolder(name, parentId) {
  const existing = await findFolders(name, parentId);
  if (existing.length > 0) return existing[0].id;
  return createFolder(name, parentId);
}

/** Returns (and caches) the Drive folder ID for the app's root folder, creating it if needed. */
export async function ensureRootFolder() {
  if (!rootFolderIdPromise) {
    const name = process.env.DRIVE_ROOT_FOLDER_NAME || 'PhotoUploads';
    rootFolderIdPromise = findOrCreateFolder(name, null);
  }
  return rootFolderIdPromise;
}

/** Returns (and caches) the Drive folder ID for a given YYYY-MM-DD date, under the root folder. */
export async function ensureDateFolder(dateStr) {
  if (dateFolderPromises.has(dateStr)) return dateFolderPromises.get(dateStr);

  const promise = (async () => {
    const rootId = await ensureRootFolder();
    return findOrCreateFolder(dateStr, rootId);
  })();

  dateFolderPromises.set(dateStr, promise);

  try {
    return await promise;
  } catch (err) {
    // Don't poison the cache with a failed lookup — allow retries.
    dateFolderPromises.delete(dateStr);
    throw err;
  }
}

/**
 * Creates a Google Drive resumable upload session and returns its session URL.
 * The browser can then PUT file bytes directly to this URL in chunks.
 */
export async function createResumableSession({ folderId, filename, mimeType, size, origin }) {
  return withRetry(async () => {
    const accessToken = await getAccessToken();

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType || 'application/octet-stream',
        'X-Upload-Content-Length': String(size),
        // Google only allows CORS on the resulting session URI for the origin that was
        // present when the session was created, so forward the browser's origin here.
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({
        name: filename,
        parents: [folderId],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Failed to create resumable session: ${res.status} ${text}`);
      err.code = res.status;
      throw err;
    }

    const sessionUrl = res.headers.get('location');
    if (!sessionUrl) {
      throw new Error('Drive did not return a resumable session URL');
    }

    return sessionUrl;
  });
}

/** Builds a Drive "view" link for a file ID. */
export function fileViewLink(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
