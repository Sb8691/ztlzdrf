/**
 * Time-zone helpers shared by every data source and renderer. All "local" strings are wall-clock in
 * the given IANA zone; all arithmetic happens on UTC epoch milliseconds - never re-parse a local
 * string to get an instant back.
 */

const DAY_MS = 86_400_000;

function localParts(ms: number, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

/** Local wall-clock label "YYYY-MM-DDTHH:mm" for an instant (epoch ms, Date, or ISO string). */
export function toLocalWallClock(input: number | string | Date, timeZone: string): string {
  const ms = typeof input === "number" ? input : new Date(input).getTime();
  const p = localParts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Local calendar date "YYYY-MM-DD" of an instant. */
export function localDateOf(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Pure calendar arithmetic on an ISO date (no time zone involved). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** UTC instant of local midnight starting the given local calendar date. Solved iteratively via
 * Intl (no offset tables): interpret the wall-clock label as UTC, measure how far that is from the
 * target, and correct - converges in one or two steps, including across DST changes. */
export function localMidnightMs(isoDate: string, timeZone: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  let ms = target;
  for (let i = 0; i < 4; i++) {
    const asUtc = Date.parse(`${toLocalWallClock(ms, timeZone)}:00Z`);
    const diff = asUtc - target;
    if (diff === 0) break;
    ms -= diff;
  }
  return ms;
}

/** Whole days between two ISO dates (b - a), sign preserved. */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS);
}

/** Model-run label: cycles are UTC-anchored, so show the UTC hour plus the local equivalent,
 * e.g. "22.9. 12 UTC (14:00)". */
export function formatRunLabel(runMs: number, timeZone: string): string {
  const d = new Date(runMs);
  const local = localParts(runMs, timeZone);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}. ${String(d.getUTCHours()).padStart(2, "0")} UTC (${local.hour}:${local.minute})`;
}

/** Short run label for chart axes: "22.9." for a 00 UTC run, "22.9. 12Z" otherwise. */
export function formatRunTick(runMs: number): string {
  const d = new Date(runMs);
  const base = `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
  const h = d.getUTCHours();
  return h === 0 ? base : `${base} ${String(h).padStart(2, "0")}Z`;
}

/** "št 1.10." - Slovak short weekday + day.month for an ISO date. */
export function formatDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("sk-SK", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${weekday} ${d}.${m}.`;
}
