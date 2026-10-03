/**
 * Disk-cached HTTP for the offline scripts (history downloads, backtests). Raw responses live
 * outside git in ~/.cache/ztlzdrf (override with ZTLZDRF_CACHE), keyed by the URL, so a re-run
 * costs no requests and the whole pipeline can be repeated from the cache alone.
 *
 * Requests go out one at a time with a pause between them: Open-Meteo answers bursts with an
 * error body under HTTP 200, GeoSphere allows 240 requests an hour. Such error bodies are never
 * cached.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CACHE_DIR = process.env.ZTLZDRF_CACHE ? process.env.ZTLZDRF_CACHE : join(homedir(), ".cache", "ztlzdrf");

export function cachePath(...parts: string[]): string {
  const p = join(CACHE_DIR, ...parts);
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface FetchCachedOptions {
  /** Re-download when the cached copy is older than this (rolling sources). Default: never. */
  maxAgeMs?: number;
  /** Minimum spacing between two network requests, per host. */
  minIntervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  /** Extra request headers (e.g. Accept). Not part of the cache key. */
  headers?: Record<string, string>;
  /** Called with the body before caching; throw to reject (and retry) a response. */
  validate?: (body: Buffer) => void;
  /** Reported in the progress line. */
  label?: string;
  /** Prints one line per network request. Default: true. */
  verbose?: boolean;
}

const lastRequestAt = new Map<string, number>();
export const stats = { network: 0, cached: 0, bytes: 0 };

function keyFor(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/** The raw body for a URL, from the cache when present. */
export async function fetchCached(url: string, opts: FetchCachedOptions = {}): Promise<{ body: Buffer; fromCache: boolean; path: string }> {
  const host = new URL(url).host;
  const key = keyFor(url);
  const path = cachePath("http", host, key.slice(0, 2), `${key}.body`);
  if (existsSync(path)) {
    const age = Date.now() - statSync(path).mtimeMs;
    if (opts.maxAgeMs === undefined || age < opts.maxAgeMs) {
      stats.cached++;
      return { body: readFileSync(path), fromCache: true, path };
    }
  }
  const retries = opts.retries ?? 3;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = (lastRequestAt.get(host) ?? 0) + (opts.minIntervalMs ?? 1200) - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000), headers: opts.headers });
      const body = Buffer.from(await res.arrayBuffer());
      if (!res.ok) {
        const err = new Error(`${res.status} ${res.statusText} for ${url}: ${body.toString("utf8").slice(0, 200)}`);
        if (res.status !== 429 && res.status < 500) throw err;
        lastError = err;
      } else {
        rejectApiError(body, url);
        opts.validate?.(body);
        writeFileSync(path, body);
        writeFileSync(`${path}.json`, JSON.stringify({ url, fetchedAt: new Date().toISOString(), bytes: body.length }));
        stats.network++;
        stats.bytes += body.length;
        if (opts.verbose !== false) console.log(`  ↓ ${opts.label ?? host} ${(body.length / 1024).toFixed(0)} kB`);
        return { body, fromCache: false, path };
      }
    } catch (err) {
      if (err instanceof Error && /^4\d\d /.test(err.message) && !err.message.startsWith("429")) throw err;
      lastError = err;
    }
    if (attempt < retries) await sleep(2000 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Open-Meteo reports problems as `{"error":true,"reason":...}` under HTTP 200; that is a failure. */
function rejectApiError(body: Buffer, url: string): void {
  const head = body.subarray(0, 300).toString("utf8").trimStart();
  if (head.startsWith("{") && /"error"\s*:\s*true/.test(head)) {
    const reason = /"reason"\s*:\s*"([^"]*)"/.exec(head)?.[1] ?? "neznáma chyba";
    throw new Error(`API error for ${url}: ${reason}`);
  }
}

export async function fetchJsonCached<T>(url: string, opts: FetchCachedOptions = {}): Promise<T> {
  const { body } = await fetchCached(url, opts);
  return JSON.parse(body.toString("utf8")) as T;
}

export async function fetchTextCached(url: string, opts: FetchCachedOptions & { encoding?: BufferEncoding | "cp1252" } = {}): Promise<string> {
  const { body } = await fetchCached(url, opts);
  if (opts.encoding === "cp1252") return new TextDecoder("windows-1252").decode(body);
  return body.toString(opts.encoding ?? "utf8");
}

/** A small derived result (JSON) kept next to the raw cache, e.g. parsed daily series. */
export function writeDerived(name: string, data: unknown): string {
  const p = cachePath("derived", name);
  writeFileSync(p, `${JSON.stringify(data)}\n`);
  return p;
}

export function readDerived<T>(name: string): T | null {
  const p = join(CACHE_DIR, "derived", name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
}
