import { LOCATION, PAINTING_RULES, type OutlookConfig, type OutlookModel } from "./config.js";
import { sunTimesForRange, type SunTimes } from "./astronomy.js";
import { evaluateHourForPainting, longestRun } from "./painting.js";
import { addDays, daysBetween, isIsoDate, localDateOf } from "./time.js";
import type {
  HourEvaluation,
  OutlookDaySummary,
  OutlookDigest,
  OutlookDigestDay,
  OutlookHistory,
  OutlookRunEntry,
  OutlookTrend,
  PaintingStatus,
  Quantiles,
  WeatherPoint,
} from "./types.js";

/*
 * Pure outlook engine: turns per-member hourly series into per-day member statistics, aggregates
 * them into probabilities/quantiles, maintains the run history and derives the digest the
 * dashboard/e-mail show. No I/O here - everything is unit-testable with synthetic series.
 */

const HOUR_MS = 3600_000;

export interface OutlookWindow {
  start: string;
  end: string;
}

/** Config window, overridable by OUTLOOK_START / OUTLOOK_END (both ISO dates, end >= start). */
export function resolveOutlookWindow(cfg: OutlookConfig, env: Record<string, string | undefined> = {}): OutlookWindow {
  const start = env.OUTLOOK_START?.trim() || cfg.window.start;
  const end = env.OUTLOOK_END?.trim() || cfg.window.end;
  if (!isIsoDate(start) || !isIsoDate(end)) throw new Error(`Neplatné okno výhľadu: ${start} – ${end} (očakávam YYYY-MM-DD)`);
  if (daysBetween(start, end) < 0) throw new Error(`Okno výhľadu končí pred začiatkom: ${start} – ${end}`);
  return { start, end };
}

export function windowDates(window: OutlookWindow): string[] {
  const dates: string[] = [];
  for (let d = window.start; daysBetween(d, window.end) >= 0; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export function primaryModel(cfg: OutlookConfig): OutlookModel {
  const m = cfg.models.find((x) => x.primary);
  if (!m) throw new Error("OUTLOOK.models nemá primárny model");
  return m;
}

// ---------------------------------------------------------------------------
// Per-member evaluation - the existing hourly rule engine, applied to every member
// ---------------------------------------------------------------------------

export function sunTimesFor(points: WeatherPoint[]): Map<string, SunTimes> {
  const first = points[0]?.ms ?? 0;
  const last = points[points.length - 1]?.ms ?? first;
  return sunTimesForRange(first, last, LOCATION.latitude, LOCATION.longitude, LOCATION.timezone);
}

export function evaluateMemberHours(points: WeatherPoint[], sun: Map<string, SunTimes>, rules = PAINTING_RULES): HourEvaluation[] {
  return points.map((_, i) => evaluateHourForPainting(points, i, sun, rules));
}

export interface MemberDayStats {
  date: string;
  /** All 24 local hours present with the core fields (precip/temp/humidity) non-null. */
  complete: boolean;
  goodHours: number;
  longestGoodRunH: number;
  longestOkRunH: number;
  precipMm: number;
  tMax: number;
  tMin: number;
  rhMin: number | null;
  windMax: number | null;
  paintable: boolean;
  possible: boolean;
}

function runLength(hourly: HourEvaluation[], predicate: (h: HourEvaluation) => boolean): number {
  const run = longestRun(hourly, predicate, HOUR_MS);
  return run ? run.endIdx - run.startIdx + 1 : 0;
}

/** Day statistics of one member for each target date. `hourly` must be evaluateMemberHours(points). */
export function evaluateMemberDays(
  points: WeatherPoint[],
  hourly: HourEvaluation[],
  targetDates: string[],
  minGoodHours: number
): MemberDayStats[] {
  return targetDates.map((date) => {
    const idx: number[] = [];
    for (let i = 0; i < points.length; i++) if (points[i].time.slice(0, 10) === date) idx.push(i);
    const dayPoints = idx.map((i) => points[i]);
    const dayHours = idx.map((i) => hourly[i]);
    const complete =
      idx.length >= 23 && dayPoints.every((p) => p.precipitationMm !== null && p.temperatureC !== null && p.humidityPct !== null);
    if (!complete) {
      return {
        date,
        complete: false,
        goodHours: 0,
        longestGoodRunH: 0,
        longestOkRunH: 0,
        precipMm: 0,
        tMax: NaN,
        tMin: NaN,
        rhMin: null,
        windMax: null,
        paintable: false,
        possible: false,
      };
    }
    const temps = dayPoints.map((p) => p.temperatureC as number);
    const afternoon = dayPoints.filter((p) => {
      const h = Number(p.time.slice(11, 13));
      return h >= 12 && h <= 17 && p.humidityPct !== null;
    });
    const winds = dayPoints.map((p) => p.windSpeedKmh).filter((v): v is number => v !== null);
    const longestGoodRunH = runLength(dayHours, (h) => h.status === "GOOD");
    const longestOkRunH = runLength(dayHours, (h) => h.status !== "BAD");
    return {
      date,
      complete: true,
      goodHours: dayHours.filter((h) => h.status === "GOOD").length,
      longestGoodRunH,
      longestOkRunH,
      precipMm: dayPoints.reduce((s, p) => s + (p.precipitationMm ?? 0), 0),
      tMax: Math.max(...temps),
      tMin: Math.min(...temps),
      rhMin: afternoon.length > 0 ? Math.min(...afternoon.map((p) => p.humidityPct as number)) : null,
      windMax: winds.length > 0 ? Math.max(...winds) : null,
      paintable: longestGoodRunH >= minGoodHours,
      possible: longestOkRunH >= minGoodHours,
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregation across members
// ---------------------------------------------------------------------------

/** Linear-interpolation quantile of an ascending-sorted array (p in 0..1). */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export function quantiles(values: number[], dp = 1): Quantiles | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return {
    p10: round(quantile(sorted, 0.1), dp),
    p25: round(quantile(sorted, 0.25), dp),
    p50: round(quantile(sorted, 0.5), dp),
    p75: round(quantile(sorted, 0.75), dp),
    p90: round(quantile(sorted, 0.9), dp),
  };
}

const ZERO_Q: Quantiles = { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };

/** Member shares + spreads for one date; null when no member has complete data for it. */
export function summarizeDay(date: string, stats: MemberDayStats[], rainDayThresholdMm: number): OutlookDaySummary | null {
  const complete = stats.filter((s) => s.date === date && s.complete);
  const n = complete.length;
  if (n === 0) return null;
  const share = (pred: (s: MemberDayStats) => boolean) => round(complete.filter(pred).length / n, 3);
  return {
    date,
    n,
    pPaintable: share((s) => s.paintable),
    pPossible: share((s) => s.possible),
    pRain: share((s) => s.precipMm >= rainDayThresholdMm),
    precip: quantiles(complete.map((s) => s.precipMm)) ?? ZERO_Q,
    tMax: quantiles(complete.map((s) => s.tMax)) ?? ZERO_Q,
    tMin: quantiles(complete.map((s) => s.tMin)) ?? ZERO_Q,
    goodRun: quantiles(complete.map((s) => s.longestGoodRunH)) ?? ZERO_Q,
    rhMin: quantiles(complete.map((s) => s.rhMin).filter((v): v is number => v !== null), 0) ?? ZERO_Q,
    windMax: quantiles(complete.map((s) => s.windMax).filter((v): v is number => v !== null), 0) ?? ZERO_Q,
  };
}

/** Per-hour member consensus expressed as an ordinary HourEvaluation series, so the existing
 * suitability strip and timeline can draw it unchanged: GOOD when >= good share of members are
 * GOOD, MARGINAL when >= marginal share are at least MARGINAL, BAD otherwise. */
export function consensusHourly(hourlyPerMember: HourEvaluation[][], thresholds: { good: number; marginal: number }): HourEvaluation[] {
  const n = hourlyPerMember.length;
  if (n === 0) return [];
  const len = Math.min(...hourlyPerMember.map((h) => h.length));
  const out: HourEvaluation[] = [];
  for (let i = 0; i < len; i++) {
    let good = 0;
    let ok = 0;
    let daylight = 0;
    for (const member of hourlyPerMember) {
      const h = member[i];
      if (h.status === "GOOD") good++;
      if (h.status !== "BAD") ok++;
      if (h.isDaylight) daylight++;
    }
    const pGood = good / n;
    const pOk = ok / n;
    const status: PaintingStatus = pGood >= thresholds.good ? "GOOD" : pOk >= thresholds.marginal ? "MARGINAL" : "BAD";
    const isDaylight = daylight * 2 >= n;
    out.push({
      ms: hourlyPerMember[0][i].ms,
      status,
      isDaylight,
      reasons: isDaylight ? [`GOOD u ${Math.round(pGood * 100)} % členov, aspoň hraničné u ${Math.round(pOk * 100)} %.`] : ["Tma."],
    });
  }
  return out;
}

function medianOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  return v.length ? quantile(v, 0.5) : null;
}

/** The "median scenario" series for the meteogram: per hour the member median of every field,
 * precipitation as the member MEAN (a median of mostly-dry members is ~0 and would hide the risk)
 * with the p10/p50/p90 amount spread attached as precipEnsemble. */
export function medianSeries(members: WeatherPoint[][]): WeatherPoint[] {
  if (members.length === 0) return [];
  const len = Math.min(...members.map((m) => m.length));
  const out: WeatherPoint[] = [];
  for (let i = 0; i < len; i++) {
    const col = (key: keyof WeatherPoint) => members.map((m) => m[i][key] as number | null);
    const precips = col("precipitationMm").filter((x): x is number => x !== null).sort((a, b) => a - b);
    const mean = precips.length ? precips.reduce((s, x) => s + x, 0) / precips.length : null;
    out.push({
      time: members[0][i].time,
      ms: members[0][i].ms,
      precipitationMm: mean !== null ? round(mean, 2) : null,
      temperatureC: medianOf(col("temperatureC")),
      radiationWm2: medianOf(col("radiationWm2")),
      humidityPct: medianOf(col("humidityPct")),
      dewPointC: medianOf(col("dewPointC")),
      windSpeedKmh: medianOf(col("windSpeedKmh")),
      windGustKmh: medianOf(col("windGustKmh")),
      precipEnsemble: precips.length
        ? { p10: round(quantile(precips, 0.1), 2), p50: round(quantile(precips, 0.5), 2), p90: round(quantile(precips, 0.9), 2) }
        : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verdicts, trends, history
// ---------------------------------------------------------------------------

export function dayStatus(day: { pPaintable: number; pPossible: number }, cfg: OutlookConfig["dayStatus"]): PaintingStatus {
  if (day.pPaintable >= cfg.good) return "GOOD";
  if (day.pPaintable >= cfg.marginal || day.pPossible >= cfg.possibleMarginal) return "MARGINAL";
  return "BAD";
}

export function runsOf(history: OutlookHistory, model: string): OutlookRunEntry[] {
  return history.runs.filter((r) => r.model === model).sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt));
}

export function latestRunFor(history: OutlookHistory, model: string): OutlookRunEntry | null {
  const runs = runsOf(history, model);
  return runs.length ? runs[runs.length - 1] : null;
}

/** P(paintable) change versus the newest run at least `minAgeHours` older than `latestRunAt`. */
export function trendFor(
  history: OutlookHistory,
  model: string,
  date: string,
  latestRunAt: string,
  cfg: OutlookConfig["trend"]
): OutlookTrend | null {
  const latestMs = Date.parse(latestRunAt);
  const latest = runsOf(history, model).find((r) => r.runAt === latestRunAt);
  const latestDay = latest?.days.find((d) => d.date === date);
  if (!latestDay) return null;
  const reference = runsOf(history, model)
    .filter((r) => latestMs - Date.parse(r.runAt) >= cfg.minAgeHours * HOUR_MS && r.days.some((d) => d.date === date))
    .pop();
  if (!reference) return null;
  const refDay = reference.days.find((d) => d.date === date)!;
  const deltaPct = Math.round((latestDay.pPaintable - refDay.pPaintable) * 100);
  const direction = deltaPct >= cfg.minDeltaPct ? "up" : deltaPct <= -cfg.minDeltaPct ? "down" : "flat";
  return { deltaPct, direction, vsRunAt: reference.runAt };
}

export function emptyHistory(cfg: OutlookConfig, window: OutlookWindow): OutlookHistory {
  return {
    schemaVersion: 1,
    location: { latitude: LOCATION.latitude, longitude: LOCATION.longitude, timezone: LOCATION.timezone },
    window: { ...window },
    rules: { minGoodHours: cfg.minGoodHours, rainDayThresholdMm: cfg.rainDayThresholdMm },
    runs: [],
  };
}

function sameDays(a: OutlookDaySummary[], b: OutlookDaySummary[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Appends new run entries: an entry is skipped when the same (model, runAt) already exists, or when
 * its numbers are identical to that model's newest stored entry (a run labelled by fetch time, or a
 * short cycle that did not touch the window, would otherwise create duplicates). Runs are kept
 * sorted by run time. Never mutates its inputs.
 */
export function mergeHistory(history: OutlookHistory, entries: OutlookRunEntry[]): { history: OutlookHistory; added: number } {
  const runs = [...history.runs];
  let added = 0;
  for (const entry of entries) {
    if (runs.some((r) => r.model === entry.model && r.runAt === entry.runAt)) continue;
    const newest = runs
      .filter((r) => r.model === entry.model)
      .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt))
      .pop();
    if (newest && sameDays(newest.days, entry.days)) continue;
    runs.push(entry);
    added++;
  }
  runs.sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt) || a.model.localeCompare(b.model));
  return { history: { ...history, runs }, added };
}

/** Everything the dashboard card and e-mail block show; null before the first snapshot or once
 * the window is over (the day after `window.end`). */
export function buildDigest(history: OutlookHistory, cfg: OutlookConfig, nowMs: number): OutlookDigest | null {
  const today = localDateOf(nowMs, LOCATION.timezone);
  if (daysBetween(today, history.window.end) < 0) return null;
  const primary = primaryModel(cfg);
  const latest = latestRunFor(history, primary.id);
  if (!latest) return null;

  const days: OutlookDigestDay[] = [];
  for (const date of windowDates(history.window)) {
    const day = latest.days.find((d) => d.date === date);
    if (!day) continue;
    const byModel: OutlookDigestDay["byModel"] = [];
    for (const model of cfg.models) {
      const run = latestRunFor(history, model.id);
      const modelDay = run?.days.find((d) => d.date === date);
      if (run && modelDay) byModel.push({ model: model.id, label: model.label, pPaintable: modelDay.pPaintable, runAt: run.runAt });
    }
    days.push({
      date,
      status: dayStatus(day, cfg.dayStatus),
      pPaintable: day.pPaintable,
      pPossible: day.pPossible,
      pRain: day.pRain,
      precipP50: day.precip.p50,
      precipP90: day.precip.p90,
      tMaxP50: day.tMax.p50,
      tMinP50: day.tMin.p50,
      goodRunP50: day.goodRun.p50,
      trend: trendFor(history, primary.id, date, latest.runAt, cfg.trend),
      byModel,
    });
  }
  if (days.length === 0) return null;
  return {
    window: { ...history.window },
    primaryModel: primary.id,
    primaryLabel: primary.label,
    latestRunAt: latest.runAt,
    runCount: runsOf(history, primary.id).length,
    days,
  };
}

export function statusLabelSk(status: PaintingStatus): string {
  return status === "GOOD" ? "Pravdepodobne áno" : status === "MARGINAL" ? "Neisté" : "Skôr nie";
}

export function statusIcon(status: PaintingStatus): string {
  return status === "GOOD" ? "🟢" : status === "MARGINAL" ? "🟡" : "🔴";
}

export function trendArrow(trend: OutlookTrend | null): string {
  if (!trend) return "";
  return trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
}

export function pct(v: number): string {
  return `${Math.round(v * 100)} %`;
}
