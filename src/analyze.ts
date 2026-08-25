import type {
  HourlyByModel,
  HourlySeries,
  ModelId,
  ModelWindowSummary,
  WindowFailure,
  WindowPhase,
  WindowResult,
} from "./types.js";
import { CANDIDATE_STARTS, WINDOW } from "./config.js";

interface AnalyzeOptions {
  preDryHours: number;
  paintHours: number;
  postDryHours: number;
  rainThresholdMm: number;
}

function classifyPhase(hourMs: number, startMs: number, opts: AnalyzeOptions): WindowPhase {
  if (hourMs < startMs) return "pred-schnutie";
  if (hourMs < startMs + opts.paintHours * 3600_000) return "malovanie";
  return "schnutie";
}

/**
 * For each candidate painting-start timestamp, checks whether the full
 * [start - preDryHours, start + paintHours + postDryHours) window is dry
 * (precipitation below rainThresholdMm) across every model, requiring the
 * forecast to fully cover the window. This is a conservative intersection
 * across models, not an average.
 */
export function findPaintWindows(
  hourlyByModel: HourlyByModel,
  candidateStarts: string[],
  opts: AnalyzeOptions = WINDOW
): WindowResult[] {
  const models = Object.keys(hourlyByModel) as ModelId[];

  return candidateStarts.map((candidateStart) => {
    const startMs = new Date(candidateStart).getTime();
    const windowStartMs = startMs - opts.preDryHours * 3600_000;
    const windowEndMs = startMs + (opts.paintHours + opts.postDryHours) * 3600_000;
    const expectedHours = Math.round((windowEndMs - windowStartMs) / 3600_000);

    const perModel: ModelWindowSummary[] = [];
    const failures: WindowFailure[] = [];
    let ok = models.length > 0;

    for (const model of models) {
      const series = hourlyByModel[model];
      let maxHourlyMm = 0;
      let totalMm = 0;
      let hoursSeen = 0;
      let modelDry = true;

      for (let i = 0; i < series.time.length; i++) {
        const t = new Date(series.time[i]).getTime();
        if (t < windowStartMs || t >= windowEndMs) continue;
        const raw = series.precipitation[i];
        if (raw === null) continue; // no data at this hour - doesn't count as covered
        hoursSeen++;
        const mm = raw;
        maxHourlyMm = Math.max(maxHourlyMm, mm);
        totalMm += mm;
        if (mm >= opts.rainThresholdMm) {
          modelDry = false;
          failures.push({
            model,
            time: series.time[i],
            phase: classifyPhase(t, startMs, opts),
            precipitationMm: mm,
          });
        }
      }

      // Forecast doesn't fully cover the window: can't confirm it's dry.
      if (hoursSeen < expectedHours) modelDry = false;
      if (!modelDry) ok = false;

      perModel.push({
        model,
        maxHourlyMm,
        totalMm,
        hoursCovered: hoursSeen,
        hoursExpected: expectedHours,
        dry: modelDry,
      });
    }

    return {
      candidateStart,
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: new Date(windowEndMs).toISOString(),
      ok,
      perModel,
      failures,
    };
  });
}

/**
 * Filters a model's raw hourly timestamps down to the configured candidate
 * painting-start slots (e.g. Saturday/Sunday 08:00). Weekday is derived from
 * the date component via Date.UTC so the result doesn't depend on the
 * runtime's local timezone.
 */
export function pickCandidateStarts(times: string[]): string[] {
  return times.filter((t) => {
    const [datePart, timePart] = t.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const hour = Number(timePart.split(":")[0]);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return CANDIDATE_STARTS.some((c) => c.weekday === weekday && c.hour === hour);
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface AggregatedPoint {
  time: string;
  ms: number;
  min: number;
  median: number;
  max: number;
}

/**
 * Buckets hours into `intervalHours`-wide chunks anchored to windowStartMs, summing each
 * model's value within a bucket (so a 3h bucket holds "total over that chunk", not a rate),
 * then collapses across models into one min/median/max per bucket - this is what lets the
 * dashboard show a single envelope+median line instead of 5 raw series, at whatever time
 * resolution the chart wants. `intervalHours: 1` reduces to one bucket per hour (today's
 * per-hour behavior, since summing a single value is a no-op). A bucket with zero reporting
 * models is omitted (never emitted as NaN). Bucket labels reuse the earliest raw `time`
 * string seen in that bucket (never reconstructed via Date), preserving the naive local
 * wall-clock timestamps Open-Meteo returns.
 */
export function aggregateInterval(
  hourlyByModel: HourlyByModel,
  windowStartMs: number,
  windowEndMs: number,
  intervalHours: number,
  valueOf: (series: HourlySeries, i: number) => number | null
): AggregatedPoint[] {
  const models = Object.keys(hourlyByModel) as ModelId[];
  const intervalMs = intervalHours * 3600_000;
  const buckets = new Map<number, { time: string; values: Map<ModelId, number> }>();

  for (const model of models) {
    const series = hourlyByModel[model];
    for (let i = 0; i < series.time.length; i++) {
      const t = series.time[i];
      const ms = new Date(t).getTime();
      if (ms < windowStartMs || ms >= windowEndMs) continue;
      const value = valueOf(series, i);
      if (value === null) continue;
      const bucketMs = windowStartMs + Math.floor((ms - windowStartMs) / intervalMs) * intervalMs;
      if (!buckets.has(bucketMs)) buckets.set(bucketMs, { time: t, values: new Map() });
      const bucket = buckets.get(bucketMs)!;
      if (ms < new Date(bucket.time).getTime()) bucket.time = t;
      bucket.values.set(model, (bucket.values.get(model) ?? 0) + value);
    }
  }

  return [...buckets.entries()]
    .map(([ms, { time, values }]) => ({
      time,
      ms,
      min: Math.min(...values.values()),
      median: median([...values.values()]),
      max: Math.max(...values.values()),
    }))
    .sort((a, b) => a.ms - b.ms);
}

