/**
 * Calendar conventions shared by the truth, backtest and calibration scripts.
 *
 * A "season" is named after the winter it spans: 2024/25 runs from August 2024 to July 2025, so
 * every snow day of one winter falls into one season whatever the month. The operating window is
 * the part of it the resorts normally run lifts in; it is an assumption recorded in METODIKA.md.
 *
 * A measurement day D is the 24 h ending at the morning observation of D (06 UTC = 07:00 CET):
 * eHYD and GeoSphere manual new snow, and the LWD snow-depth difference, are all read that way.
 */

export const OPERATING_FROM = "12-01";
export const OPERATING_TO = "04-15";

/** "2024/25" for any date from 2024-08-01 to 2025-07-31. */
export function seasonOf(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The lift season (OPERATING_FROM .. OPERATING_TO, inclusive) as month-day comparison. */
export function inOperatingWindow(isoDate: string, from = OPERATING_FROM, to = OPERATING_TO): boolean {
  const md = isoDate.slice(5);
  return md >= from || md <= to;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Every ISO date from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The winter seasons (start years) that overlap `fromYear-08-01 .. toYear-07-31`. */
export function seasonStartYears(firstStart: number, lastStart: number): number[] {
  const out: number[] = [];
  for (let y = firstStart; y <= lastStart; y++) out.push(y);
  return out;
}
