import { google } from 'googleapis';
import { getOAuth2Client, getAccessToken } from './googleAuth.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

let rootFolderIdPromise;
const dateFolderCache = new Map();

function drive() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

async function findFolder(name, parentId) {
  const parentClause = parentId ? `and '${parentId}' in parents` : '';
  const res = await drive().files.list({
    q: `name = '${name}' and mimeType = '${FOLDER_MIME}' and trashed = false ${parentClause}`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolder(name, parentId) {
  const res = await drive().files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  return res.data.id;
}

async function findOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
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
  if (dateFolderCache.has(dateStr)) return dateFolderCache.get(dateStr);

  const rootId = await ensureRootFolder();
  const folderId = await findOrCreateFolder(dateStr, rootId);
  dateFolderCache.set(dateStr, folderId);
  return folderId;
}

/**
 * Creates a Google Drive resumable upload session and returns its session URL.
 * The browser can then PUT file bytes directly to this URL in chunks.
 */
export async function createResumableSession({ folderId, filename, mimeType, size, origin }) {
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
    throw new Error(`Failed to create resumable session: ${res.status} ${text}`);
  }

  const sessionUrl = res.headers.get('location');
  if (!sessionUrl) {
    throw new Error('Drive did not return a resumable session URL');
  }

  return sessionUrl;
}

/** Builds a Drive "view" link for a file ID. */
export function fileViewLink(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
