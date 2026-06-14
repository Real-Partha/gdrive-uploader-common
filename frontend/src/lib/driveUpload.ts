const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB, must be a multiple of 256KB per Drive's resumable upload protocol
const MAX_RETRIES = 5;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses the next byte offset to resume from out of a 308 response's Range header (e.g. "bytes=0-8388607"). */
function nextOffsetFromRange(range: string | null, fallback: number): number {
  if (!range) return fallback;
  const match = range.match(/bytes=\d+-(\d+)/);
  return match ? Number(match[1]) + 1 : fallback;
}

/** Asks Drive how many bytes of the session it has received so far, or whether it's already complete. */
async function queryStatus(
  sessionUrl: string,
  total: number
): Promise<{ done: true; fileId: string } | { done: false; offset: number }> {
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}` },
  });

  if (res.status === 200 || res.status === 201) {
    const body = await res.json();
    return { done: true, fileId: body.id };
  }
  if (res.status === 308) {
    return { done: false, offset: nextOffsetFromRange(res.headers.get('Range'), 0) };
  }
  throw new Error(`Status check failed with ${res.status}`);
}

/**
 * Uploads a file to a Google Drive resumable session URL in chunks, directly from the browser.
 * Reports cumulative bytes uploaded via onProgress, and retries transient failures with backoff,
 * resuming from the server-reported offset.
 */
export async function uploadFileResumable(
  file: File,
  sessionUrl: string,
  onProgress: (uploaded: number, total: number) => void
): Promise<string> {
  const total = file.size;
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await fetch(sessionUrl, {
          method: 'PUT',
          headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
          body: chunk,
        });

        if (res.status === 200 || res.status === 201) {
          onProgress(total, total);
          const body = await res.json();
          return body.id as string;
        }
        if (res.status === 308) {
          offset = nextOffsetFromRange(res.headers.get('Range'), end);
          onProgress(offset, total);
          break;
        }
        throw new Error(`Upload chunk failed with status ${res.status}`);
      } catch (err) {
        attempt += 1;
        if (attempt > MAX_RETRIES) throw err;

        try {
          const status = await queryStatus(sessionUrl, total);
          if (status.done) {
            onProgress(total, total);
            return status.fileId;
          }
          offset = status.offset;
          onProgress(offset, total);
        } catch {
          // Couldn't even check status - retry from the same offset after backing off.
        }

        await delay(Math.min(2 ** attempt * 500, 8000));
      }
    }
  }

  throw new Error('Upload completed without returning a file ID');
}
