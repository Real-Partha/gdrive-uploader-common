import { google } from 'googleapis';
import { getOAuth2Client } from './googleAuth.js';
import { ensureRootFolder } from './drive.js';

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
  const res = await drive().files.list({
    q: `name = '${SPREADSHEET_NAME}' and mimeType = '${SPREADSHEET_MIME}' and trashed = false and '${rootFolderId}' in parents`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });
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

/**
 * Appends one row to the Uploads tab.
 * @param {{ timestamp: string, name: string, fileName: string, photoDate: string, sizeBytes: number, driveLink: string }} row
 */
export async function appendUploadRow(row) {
  const spreadsheetId = await ensureRecordSheet();

  await sheets().spreadsheets.values.append({
    spreadsheetId,
    range: `${UPLOADS_TAB}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[row.timestamp, row.name, row.fileName, row.photoDate, row.sizeBytes, row.driveLink]],
    },
  });
}

/** Reads the Summary tab and returns per-name upload counts. */
export async function getSummary() {
  const spreadsheetId = await ensureRecordSheet();

  const res = await sheets().spreadsheets.values.get({
    spreadsheetId,
    range: `${SUMMARY_TAB}!A1:B100`,
  });

  const rows = res.data.values ?? [];
  const [header, ...data] = rows;
  if (!header) return [];

  return data
    .filter((r) => r[0])
    .map((r) => ({ name: r[0], count: Number(r[1] ?? 0) }));
}
