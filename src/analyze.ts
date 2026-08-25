import type {
  HourlyByModel,
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
