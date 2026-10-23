/**
 * fetch + JSON for the generator. The browser has its own small twin in src/ski-ui.js (getJson);
 * the generator retries harder because a CI run has no reader who could press the button again.
 */

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  /** The least wait after a 429: Open-Meteo's limits count per minute (tests pass a few ms). */
  rateLimitWaitMs?: number;
}

/**
 * fetch + JSON with a per-attempt timeout and exponential backoff. Retries network errors, timeouts,
 * 5xx, 429 (after at least rateLimitWaitMs, or longer if Retry-After asks) and Open-Meteo's error
 * bodies under HTTP 200 (`{"error": true, "reason": …}`, e.g. "Too many concurrent requests" - one
 * such answer used to cost the whole run); any other 4xx is a caller bug and fails immediately.
 */
export async function fetchJson<T>(url: string | URL, opts: FetchOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 1500;
  const rateLimitWaitMs = opts.rateLimitWaitMs ?? 60_000;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let waitMs = backoffMs * 2 ** attempt;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        const json = (await res.json()) as T;
        const reason = errorReason(json);
        if (reason === null) return json;
        lastError = new Error(`Open-Meteo: ${reason} (${url})`);
      } else {
        const body = (await res.text()).slice(0, 200);
        const err = new Error(`${res.status} ${res.statusText} for ${url}: ${body}`);
        if (res.status !== 429 && res.status < 500) throw err;
        if (res.status === 429) waitMs = Math.max(rateLimitWaitMs, retryAfterMs(res.headers.get("retry-after")));
        lastError = err;
      }
    } catch (err) {
      if (err instanceof Error && /^\d{3} /.test(err.message) && !err.message.startsWith("429") && !/^5\d\d /.test(err.message)) throw err;
      lastError = err;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, waitMs));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** The reason of an Open-Meteo error body (`{"error": true, "reason": "…"}`), else null. */
function errorReason(json: unknown): string | null {
  if (!json || typeof json !== "object" || (json as { error?: unknown }).error !== true) return null;
  const reason = (json as { reason?: unknown }).reason;
  return typeof reason === "string" && reason ? reason : "chyba bez udaného dôvodu";
}

/** Retry-After in milliseconds (seconds or an HTTP date); 0 when absent or unreadable. */
function retryAfterMs(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}
