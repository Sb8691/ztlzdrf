/**
 * fetch + JSON for the generator. The browser has its own small twin in src/ski-ui.js (getJson);
 * the generator retries harder because a CI run has no reader who could press the button again.
 */

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/** fetch + JSON with a per-attempt timeout and exponential backoff. Retries network errors,
 * timeouts, 429 and 5xx; any other 4xx is a caller bug and fails immediately. */
export async function fetchJson<T>(url: string | URL, opts: FetchOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 1500;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.text()).slice(0, 200);
      const err = new Error(`${res.status} ${res.statusText} for ${url}: ${body}`);
      if (res.status !== 429 && res.status < 500) throw err;
      lastError = err;
    } catch (err) {
      if (err instanceof Error && /^\d{3} /.test(err.message) && !err.message.startsWith("429") && !/^5\d\d /.test(err.message)) throw err;
      lastError = err;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
