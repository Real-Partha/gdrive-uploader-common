const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);

function getStatusCode(err) {
  return Number(err?.code ?? err?.response?.status ?? err?.status);
}

/**
 * Retries `fn` with exponential backoff (+ jitter) when it fails with a
 * rate-limit (429) or transient server (5xx) error. Rethrows immediately
 * for any other error.
 */
export async function withRetry(fn, { retries = 5, baseDelayMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !RETRYABLE_STATUS_CODES.has(getStatusCode(err))) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
