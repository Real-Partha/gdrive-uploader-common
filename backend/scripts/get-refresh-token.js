import { google } from 'googleapis';
import http from 'node:http';
import { exec } from 'node:child_process';
import { SCOPES } from '../src/googleAuth.js';

// One-time setup script: run with `npm run get-refresh-token` from backend/.
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment (or a .env file).
import 'dotenv/config';

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\nAuthorize this app by visiting (with the Google account that owns the Drive):\n');
console.log(authUrl);
console.log(`\nWaiting for redirect on ${REDIRECT_URI} ...\n`);

// Best-effort: open the URL in the default browser.
const openCmd =
  process.platform === 'win32' ? `start "" "${authUrl}"` : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
exec(openCmd, () => {});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) {
    res.writeHead(404).end();
    return;
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
    console.error('Authorization failed:', error);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Success!</h1><p>You can close this tab and return to the terminal.</p>');

    console.log('\nRefresh token obtained. Add this to backend/.env (and Render env vars):\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

    if (!tokens.refresh_token) {
      console.warn(
        'No refresh token was returned. If you have authorized this app before, revoke access at ' +
          'https://myaccount.google.com/permissions and re-run this script.'
      );
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h1>Token exchange failed</h1>');
    console.error('Token exchange failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT);
