# Photo Drop

A small app that lets anyone upload photos straight into a folder on **your** Google Drive,
organized into per-day folders based on each photo's "date taken" (EXIF), with a Google Sheet
in that Drive logging who uploaded what.

- **Frontend**: React + Vite + Tailwind (deploy to Vercel)
- **Backend**: Node/Express (deploy to Render) — only brokers Google Drive resumable upload
  sessions and logs rows to a Google Sheet. File bytes are streamed **directly from the
  browser to Google Drive** in chunks, so large uploads don't time out and many people can
  upload at once.

## How it works

1. Browser asks the backend for an upload session (`POST /api/upload-session`), sending the
   filename, size, mime type, the uploader's name, and the photo's EXIF date (extracted in the
   browser).
2. The backend (using a stored OAuth refresh token for **your** Google account) makes sure a
   `PhotoUploads/YYYY-MM-DD/` folder exists in your Drive, opens a Drive resumable upload
   session targeting that folder, and returns the session URL.
3. The browser uploads the file directly to that Google-provided URL in ~8MB chunks, with
   progress reporting and automatic retry/resume.
4. Once done, the browser calls `POST /api/upload-complete`, and the backend appends a row to
   an `UploadRecords` Google Sheet (also created inside `PhotoUploads/`) with the uploader's
   name, file name, photo date, size, and a link to the file. A `Summary` tab in that sheet
   shows per-person upload counts via a formula.

## 1. Google Cloud setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a
   project.
2. Enable the **Google Drive API** and **Google Sheets API** for that project
   (APIs & Services → Library).
3. Configure the **OAuth consent screen** (APIs & Services → OAuth consent screen):
   - User type: External (or Internal if you have a Workspace account)
   - Add your Google account as a test user if the app is in "Testing" mode
4. Create an **OAuth client ID** (APIs & Services → Credentials → Create credentials → OAuth
   client ID):
   - Application type: **Web application**
   - Add `http://localhost:53682/oauth2callback` to "Authorized redirect URIs"
   - Note the **Client ID** and **Client secret**

## 2. Get a refresh token (one-time, run locally)

```bash
cd backend
cp .env.example .env
# edit .env and fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
npm install
npm run get-refresh-token
```

This opens a browser window — sign in with **the Google account whose Drive you want photos
uploaded to** (the one with 5TB of space) and grant access. The script prints a
`GOOGLE_REFRESH_TOKEN=...` line — copy that value into `backend/.env`.

## 3. Run locally

Backend:

```bash
cd backend
npm run dev
```

On first request, it will create a `PhotoUploads` folder and an `UploadRecords` spreadsheet in
the authorized account's Drive.

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the printed local URL, enter a name, and drag in some photos.

## 4. Deploy

### Backend → Render

- New Web Service, root directory `backend`
- Build command: `npm install`
- Start command: `npm start`
- Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
  `CORS_ORIGIN` (your Vercel URL), `DRIVE_ROOT_FOLDER_NAME` (optional)

### Frontend → Vercel

- New Project, root directory `frontend`
- Framework preset: Vite
- Environment variable: `VITE_API_BASE_URL` = your Render backend URL (e.g.
  `https://photo-uploader-backend.onrender.com`)

After both are deployed, update the backend's `CORS_ORIGIN` to your Vercel domain and redeploy.

## Notes

- Photos are saved as `PhotoUploads/YYYY-MM-DD/HHmmss_<name>_<original-filename>` using the
  photo's EXIF "date taken" (or the file's last-modified date if no EXIF is present).
- The Drive OAuth scope used is `drive.file`, so the backend can only see/manage files and
  folders it creates — not your entire Drive.
- There's no login/access code — anyone with the frontend URL can upload. Only share the link
  with people you trust with your storage.
