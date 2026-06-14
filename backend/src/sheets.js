import { google } from 'googleapis';
import { getOAuth2Client } from './googleAuth.js';
import { ensureRootFolder } from './drive.js';
import { withRetry } from './util/retry.js';

const SPREADSHEET_NAME = 'UploadRecords';
const UPLOADS_TAB = 'Uploads';
const SUMMARY_TAB = 'Summary';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const UPLOADS_HEADER = ['Timestamp', 'Name', 'File Name', 'Photo Date', 'File Size (bytes)', 'Drive Link'];

const SUMMARY_FORMULA =
  '=QUERY(Uploads!B2:B, "select B, count(B) where B is not null group by B order by count(B) desc ' +
  "label B 'Name', count(B) 'Files Uploaded'\", 0)";

let spreadsheetIdPromise;

function sheets() {
  return google.sheets({ version: 'v4', auth: getOAuth2Client() });
}

function drive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

async function findExistingSpreadsheet(rootFolderId) {
  const res = await withRetry(() =>
    drive().files.list({
      q: `name = '${SPREADSHEET_NAME}' and mimeType = '${SPREADSHEET_MIME}' and trashed = false and '${rootFolderId}' in parents`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime',
      spaces: 'drive',
      pageSize: 10,
    })
  );
  // Pick the oldest if duplicates exist, so things converge on one canonical sheet.
  return res.data.files?.[0]?.id ?? null;
}

async function createRecordSpreadsheet(rootFolderId) {
  const createRes = await sheets().spreadsheets.create({
    requestBody: {
      properties: { title: SPREADSHEET_NAME },
      sheets: [{ properties: { title: UPLOADS_TAB } }, { properties: { title: SUMMARY_TAB } }],
    },
    fields: 'spreadsheetId',
  });

  const spreadsheetId = createRes.data.spreadsheetId;

  // Move the new spreadsheet from "My Drive" root into the app's root folder.
  await drive().files.update({
    fileId: spreadsheetId,
    addParents: rootFolderId,
    removeParents: 'root',
    fields: 'id, parents',
  });

  // Seed header row and summary formula.
  await sheets().spreadsheets.values.update({
    spreadsheetId,
    range: `${UPLOADS_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [UPLOADS_HEADER] },
  });

  await sheets().spreadsheets.values.update({
    spreadsheetId,
    range: `${SUMMARY_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[SUMMARY_FORMULA]] },
  });

  return spreadsheetId;
}

/** Returns (and caches) the spreadsheet ID for the upload record sheet, creating it if needed. */
export async function ensureRecordSheet() {
  if (!spreadsheetIdPromise) {
    spreadsheetIdPromise = (async () => {
      const rootFolderId = await ensureRootFolder();
      const existing = await findExistingSpreadsheet(rootFolderId);
      if (existing) return existing;
      return createRecordSpreadsheet(rootFolderId);
    })();
  }
  return spreadsheetIdPromise;
}

// Sheets enforces a per-user "write requests per minute" quota. When many
// uploads complete around the same time, appending one row per upload can
// blow through that quota (429 rateLimitExceeded). Instead, queue rows and
// flush them in a single batched `append` call every FLUSH_DELAY_MS.
const FLUSH_DELAY_MS = 2000;
const MAX_BATCH_SIZE = 200;

let pendingRows = [];
let flushTimer = null;

function rowToValues(row) {
  return [row.timestamp, row.name, row.fileName, row.photoDate, row.sizeBytes, row.driveLink];
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPendingRows();
  }, FLUSH_DELAY_MS);
}

async function flushPendingRows() {
  if (pendingRows.length === 0) return;

  const batch = pendingRows.splice(0, MAX_BATCH_SIZE);
  if (pendingRows.length > 0) scheduleFlush();

  try {
    const spreadsheetId = await ensureRecordSheet();

    await withRetry(() =>
      sheets().spreadsheets.values.append({
        spreadsheetId,
        range: `${UPLOADS_TAB}!A:F`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: batch.map(({ row }) => rowToValues(row)),
        },
      })
    );

    batch.forEach(({ resolve }) => resolve());
  } catch (err) {
    batch.forEach(({ reject }) => reject(err));
  }
}

/**
 * Appends one row to the Uploads tab. Rows are queued and written to Sheets
 * in small batches to stay within the Sheets API's write-requests-per-minute
 * quota under concurrent uploads.
 * @param {{ timestamp: string, name: string, fileName: string, photoDate: string, sizeBytes: number, driveLink: string }} row
 */
export function appendUploadRow(row) {
  return new Promise((resolve, reject) => {
    pendingRows.push({ row, resolve, reject });
    scheduleFlush();
  });
}

/** Reads the Summary tab and returns per-name upload counts. */
export async function getSummary() {
  const spreadsheetId = await ensureRecordSheet();

  const res = await withRetry(() =>
    sheets().spreadsheets.values.get({
      spreadsheetId,
      range: `${SUMMARY_TAB}!A1:B100`,
    })
  );

  const rows = res.data.values ?? [];
  const [header, ...data] = rows;
  if (!header) return [];

  return data
    .filter((r) => r[0])
    .map((r) => ({ name: r[0], count: Number(r[1] ?? 0) }));
}
