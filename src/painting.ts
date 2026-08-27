import { LOCATION, PAINTING_RULES, RAIN_THRESHOLD_MM } from "./config.js";
import { sunTimesForRange, type SunTimes } from "./astronomy.js";
import type {
  HourEvaluation,
  PaintingAssessment,
  PaintingStatus,
  PaintingWindow,
  RainProbabilityBand,
  TerraceDryingEstimate,
  TerraceDryingStatus,
  WeatherPoint,
  WoodMoistureReading,
} from "./types.js";

type PaintingRules = typeof PAINTING_RULES;

export function sumPrecipInRange(points: WeatherPoint[], startMsExclusive: number, endMsInclusive: number): number {
  let sum = 0;
  for (const p of points) {
    if (p.ms > startMsExclusive && p.ms <= endMsInclusive && p.precipitationMm !== null) {
      sum += p.precipitationMm;
    }
  }
  return sum;
}

export function calculateRecentRain(points: WeatherPoint[], nowMs: number, hours: number): number {
  return sumPrecipInRange(points, nowMs - hours * 3600_000, nowMs);
}

export function upcomingRainMm(points: WeatherPoint[], nowMs: number, hours: number): number {
  return sumPrecipInRange(points, nowMs, nowMs + hours * 3600_000);
}

/** Hours until the next hour with precipitation above the threshold, or null if none is predicted
 * anywhere within the fetched forecast horizon (NOT the same as "zero probability of rain" -
 * it just means the deterministic model shows none within the data we have). */
export function findNextRain(points: WeatherPoint[], nowMs: number, thresholdMm = RAIN_THRESHOLD_MM): number | null {
  for (const p of points) {
    if (p.ms > nowMs && p.precipitationMm !== null && p.precipitationMm > thresholdMm) {
      return (p.ms - nowMs) / 3600_000;
    }
  }
  return null;
}

/**
 * Consecutive rain-free hours starting right after `startMs` (a candidate painting start time).
 * `limitedByHorizon: true` means we ran out of data (a gap or the end of the forecast) before
 * confirming the required window either way - genuinely unknown, NOT "confirmed dry". Only
 * `limitedByHorizon: false` (we found actual rain) is a definitive answer.
 */
export function calculateRainFreeWindow(
  points: WeatherPoint[],
  startMs: number,
  thresholdMm = RAIN_THRESHOLD_MM
): { hours: number; limitedByHorizon: boolean } {
  const future = points.filter((p) => p.ms > startMs).sort((a, b) => a.ms - b.ms);
  if (future.length === 0) return { hours: 0, limitedByHorizon: true };
  for (const p of future) {
    if (p.precipitationMm === null) {
      return { hours: (p.ms - startMs) / 3600_000, limitedByHorizon: true };
    }
    if (p.precipitationMm > thresholdMm) {
      return { hours: (p.ms - startMs) / 3600_000, limitedByHorizon: false };
    }
  }
  const lastMs = future[future.length - 1].ms;
  return { hours: (lastMs - startMs) / 3600_000, limitedByHorizon: true };
}

/** Weighting for calculateDryingScore - deliberately simple/explainable (linear ramps, fixed
 * point weights) rather than a fitted/black-box model. Sums to 100 before the recent-rain penalty. */
export const DRYING_SCORE_WEIGHTS = {
  temperature: 25,
  humidity: 25,
  radiation: 20,
  wind: 15,
  dewPointSpread: 15,
};

function clampedRamp(value: number, min: number, preferredMin: number, preferredMax: number, max: number): number {
  if (value < min || value > max) return 0;
  if (value < preferredMin) return (value - min) / (preferredMin - min);
  if (value > preferredMax) return (max - value) / (max - preferredMax);
  return 1;
}

function windDryingScore(kmh: number, wind: PaintingRules["wind"]): number {
  if (kmh >= wind.absoluteMaxKmh) return 0;
  if (kmh > wind.preferredMaxKmh) return 1 - (kmh - wind.preferredMaxKmh) / (wind.absoluteMaxKmh - wind.preferredMaxKmh);
  if (kmh < wind.preferredMinKmh) return wind.preferredMinKmh > 0 ? kmh / wind.preferredMinKmh : 1;
  return 1;
}

/**
 * calculateDryingScore(): 0-100 meteorological drying-condition indicator - explicitly NOT a
 * measurement of actual wood moisture, just how favorable the surrounding weather is for a coating
 * to dry/cure. Deterministic and explainable: each input contributes an independent 0..weight
 * points via a linear ramp between the configured thresholds, then a penalty is subtracted for
 * rain in the last 6h (the surface may still be wet even after rain has stopped). Currently-raining
 * hours always score 0 outright.
 */
export function calculateDryingScore(
  point: Pick<WeatherPoint, "temperatureC" | "humidityPct" | "radiationWm2" | "windSpeedKmh" | "precipitationMm">,
  dewPointSpreadC: number | null,
  recentRainMm6h: number,
  rules: PaintingRules = PAINTING_RULES
): number {
  if (point.precipitationMm !== null && point.precipitationMm > RAIN_THRESHOLD_MM) return 0;

  let score = 0;

  if (point.temperatureC !== null) {
    score +=
      DRYING_SCORE_WEIGHTS.temperature *
      clampedRamp(point.temperatureC, rules.temperature.min, rules.temperature.preferredMin, rules.temperature.preferredMax, rules.temperature.max);
  }

  if (point.humidityPct !== null) {
    const rh = point.humidityPct;
    const rhScore =
      rh <= rules.humidity.preferredMax
        ? 1
        : rh >= rules.humidity.absoluteMax
          ? 0
          : 1 - (rh - rules.humidity.preferredMax) / (rules.humidity.absoluteMax - rules.humidity.preferredMax);
    score += DRYING_SCORE_WEIGHTS.humidity * rhScore;
  }

  if (point.radiationWm2 !== null) {
    // Drying benefit saturates well before a typical Alpine clear-sky midday max (~800-900 W/m²).
    score += DRYING_SCORE_WEIGHTS.radiation * Math.min(1, Math.max(0, point.radiationWm2 / 600));
  }

  if (point.windSpeedKmh !== null) {
    score += DRYING_SCORE_WEIGHTS.wind * windDryingScore(point.windSpeedKmh, rules.wind);
  }

  if (dewPointSpreadC !== null) {
    const spreadScore =
      dewPointSpreadC <= rules.dewPointSpread.minimum
        ? 0
        : dewPointSpreadC >= rules.dewPointSpread.preferred
          ? 1
          : (dewPointSpreadC - rules.dewPointSpread.minimum) / (rules.dewPointSpread.preferred - rules.dewPointSpread.minimum);
    score += DRYING_SCORE_WEIGHTS.dewPointSpread * spreadScore;
  }

  const rainPenalty = Math.min(20, recentRainMm6h * 10);
  score -= rainPenalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function dryingScoreLabel(score: number): string {
  if (score >= 80) return "Veľmi dobré";
  if (score >= 60) return "Dobré";
  if (score >= 35) return "Priemerné";
  return "Zlé";
}

/**
 * The core per-hour rule evaluator: a hard failure on any of temperature/humidity/dew-point-spread/
 * wind/current-rain/insufficient-curing-window makes the hour BAD; a soft (preferred-range) miss on
 * any of those makes it MARGINAL; otherwise GOOD. Always BAD outside daylight - painting in the
 * dark is excluded regardless of how good the meteorological numbers look (spec section 15).
 */
export function evaluateHourForPainting(
  points: WeatherPoint[],
  index: number,
  sunTimes: Map<string, SunTimes>,
  rules: PaintingRules = PAINTING_RULES
): HourEvaluation {
  const point = points[index];
  const localDateStr = point.time.slice(0, 10);
  const sun = sunTimes.get(localDateStr);
  const isDaylight =
    sun?.sunrise != null && sun?.sunset != null
      ? point.ms >= sun.sunrise.getTime() && point.ms < sun.sunset.getTime()
      : true;

  if (!isDaylight) {
    return { ms: point.ms, status: "BAD", isDaylight, reasons: ["Tma – maľovanie sa neodporúča mimo denného svetla."] };
  }

  if (point.temperatureC === null || point.humidityPct === null || point.precipitationMm === null) {
    return { ms: point.ms, status: "BAD", isDaylight, reasons: ["Chýbajúce dáta pre toto hodinové okno."] };
  }

  const reasons: string[] = [];
  let hardFail = false;
  let marginal = false;

  if (point.precipitationMm > rules.precipitation.maxDuringApplicationMm) {
    reasons.push("V tomto čase prší.");
    hardFail = true;
  }

  if (point.temperatureC < rules.temperature.min) {
    reasons.push(`Teplota ${point.temperatureC.toFixed(1)} °C je pod minimom ${rules.temperature.min} °C.`);
    hardFail = true;
  } else if (point.temperatureC > rules.temperature.max) {
    reasons.push(`Teplota ${point.temperatureC.toFixed(1)} °C je nad maximom ${rules.temperature.max} °C.`);
    hardFail = true;
  } else if (point.temperatureC < rules.temperature.preferredMin || point.temperatureC > rules.temperature.preferredMax) {
    reasons.push(`Teplota ${point.temperatureC.toFixed(1)} °C je mimo odporúčaného rozsahu.`);
    marginal = true;
  }

  if (point.humidityPct > rules.humidity.absoluteMax) {
    reasons.push(`Vlhkosť ${point.humidityPct.toFixed(0)} % je nad maximom ${rules.humidity.absoluteMax} %.`);
    hardFail = true;
  } else if (point.humidityPct > rules.humidity.preferredMax) {
    reasons.push(`Vlhkosť ${point.humidityPct.toFixed(0)} % je nad odporúčaným maximom ${rules.humidity.preferredMax} %.`);
    marginal = true;
  }

  const dewPointSpreadC = point.dewPointC !== null ? point.temperatureC - point.dewPointC : null;
  if (dewPointSpreadC !== null) {
    if (dewPointSpreadC < rules.dewPointSpread.minimum) {
      reasons.push(`Rozdiel teplota/rosný bod ${dewPointSpreadC.toFixed(1)} °C – riziko kondenzácie.`);
      hardFail = true;
    } else if (dewPointSpreadC < rules.dewPointSpread.preferred) {
      reasons.push(`Rozdiel teplota/rosný bod ${dewPointSpreadC.toFixed(1)} °C je tesný.`);
      marginal = true;
    }
  }

  if (point.windSpeedKmh !== null) {
    if (point.windSpeedKmh > rules.wind.absoluteMaxKmh) {
      reasons.push(`Vietor ${point.windSpeedKmh.toFixed(0)} km/h je nad maximom ${rules.wind.absoluteMaxKmh} km/h.`);
      hardFail = true;
    } else if (point.windSpeedKmh > rules.wind.preferredMaxKmh) {
      reasons.push(`Vietor ${point.windSpeedKmh.toFixed(0)} km/h je nad odporúčaným maximom.`);
      marginal = true;
    }
  }

  const recentRain = calculateRecentRain(points, point.ms, rules.precipitation.minDryHoursBeforePainting);
  if (recentRain > RAIN_THRESHOLD_MM) {
    reasons.push(
      `Zrážky ${recentRain.toFixed(1)} mm za posledných ${rules.precipitation.minDryHoursBeforePainting} h – povrch môže byť ešte mokrý.`
    );
    marginal = true;
  }

  const curing = calculateRainFreeWindow(points, point.ms, RAIN_THRESHOLD_MM);
  if (curing.hours < rules.precipitation.minRainFreeHoursAfterPainting) {
    if (!curing.limitedByHorizon) {
      reasons.push(
        `Dážď o ${curing.hours.toFixed(0)} h – nedostatočné bezdažďové okno na vyschnutie (potrebných ${rules.precipitation.minRainFreeHoursAfterPainting} h).`
      );
      hardFail = true;
    } else {
      reasons.push(
        `Dostupné dáta pokrývajú len ${curing.hours.toFixed(0)} h bez dažďa (potrebných ${rules.precipitation.minRainFreeHoursAfterPainting} h) – mimo horizontu predpovede.`
      );
      marginal = true;
    }
  }

  const status: PaintingStatus = hardFail ? "BAD" : marginal ? "MARGINAL" : "GOOD";
  return { ms: point.ms, status, isDaylight, reasons };
}

function longestRun(
  hourly: HourEvaluation[],
  predicate: (h: HourEvaluation) => boolean,
  stepMs: number
): { startIdx: number; endIdx: number } | null {
  const runs: { startIdx: number; endIdx: number }[] = [];
  let start: number | null = null;
  for (let i = 0; i < hourly.length; i++) {
    const gapFromPrev = i > 0 && hourly[i].ms - hourly[i - 1].ms > stepMs * 1.5;
    if (gapFromPrev && start !== null) {
      runs.push({ startIdx: start, endIdx: i - 1 });
      start = null;
    }
    if (predicate(hourly[i])) {
      if (start === null) start = i;
    } else if (start !== null) {
      runs.push({ startIdx: start, endIdx: i - 1 });
      start = null;
    }
  }
  if (start !== null) runs.push({ startIdx: start, endIdx: hourly.length - 1 });
  if (runs.length === 0) return null;
  return runs.reduce((a, b) => (b.endIdx - b.startIdx > a.endIdx - a.startIdx ? b : a));
}

/** Longest continuous GOOD run; falls back to the longest GOOD-or-MARGINAL run only if no GOOD
 * hour exists at all anywhere in the window. */
export function findBestPaintingWindow(hourly: HourEvaluation[], stepMs = 3600_000): PaintingWindow | null {
  if (hourly.length === 0) return null;
  const best = longestRun(hourly, (h) => h.status === "GOOD", stepMs) ?? longestRun(hourly, (h) => h.status !== "BAD", stepMs);
  if (!best) return null;
  const startMs = hourly[best.startIdx].ms;
  const endMs = hourly[best.endIdx].ms + stepMs;
  return { startMs, endMs, durationHours: Math.round(((endMs - startMs) / 3600_000) * 10) / 10 };
}

/**
 * Derives a rain-probability BAND (not a fabricated single percentage) from the ensemble's
 * tp_p10/p50/p90 amount percentiles: since p90<=threshold implies at most 10% of members produced
 * measurable rain, p50<=threshold implies at most 50%, and so on, the amount percentiles bound
 * (rather than equal) an exceedance probability - hence a band, never invented precision the
 * 3-percentile ensemble summary can't actually support. Returns null when no ensemble data covers
 * the requested window (e.g. request failed, or window is entirely in the past) rather than
 * assuming 0%.
 *
 * Note: summing hourly percentiles across the window to approximate the accumulated percentile is
 * a standard operational shortcut, not an exact statistical identity - documented here rather than
 * hidden.
 */
export function rainProbabilityBand(
  points: WeatherPoint[],
  nowMs: number,
  hours: number,
  thresholdMm = RAIN_THRESHOLD_MM
): RainProbabilityBand | null {
  const windowPoints = points.filter((p) => p.ms > nowMs && p.ms <= nowMs + hours * 3600_000 && p.precipEnsemble !== null);
  if (windowPoints.length === 0) return null;

  let p10Sum = 0;
  let p50Sum = 0;
  let p90Sum = 0;
  for (const p of windowPoints) {
    p10Sum += p.precipEnsemble!.p10;
    p50Sum += p.precipEnsemble!.p50;
    p90Sum += p.precipEnsemble!.p90;
  }

  if (p90Sum <= thresholdMm) return { minPct: 0, maxPct: 10, label: "< 10 %" };
  if (p50Sum <= thresholdMm) return { minPct: 10, maxPct: 50, label: "10 – 50 %" };
  if (p10Sum <= thresholdMm) return { minPct: 50, maxPct: 90, label: "50 – 90 %" };
  return { minPct: 90, maxPct: 100, label: "> 90 %" };
}

/**
 * A conservative, clearly-labeled ESTIMATE of terrace surface state from weather data alone - never
 * a claim of actually knowing the wood's moisture content (see the manual wood-moisture override in
 * evaluatePaintingConditions for that).
 */
export function estimateTerraceDryingStatus(
  points: WeatherPoint[],
  nowMs: number,
  rules: PaintingRules = PAINTING_RULES
): TerraceDryingEstimate {
  const past = [...points].filter((p) => p.ms <= nowMs).sort((a, b) => b.ms - a.ms);
  let lastRainMs: number | null = null;
  for (const p of past) {
    if (p.precipitationMm !== null && p.precipitationMm > RAIN_THRESHOLD_MM) {
      lastRainMs = p.ms;
      break;
    }
  }
  const lastRainHoursAgo = lastRainMs !== null ? (nowMs - lastRainMs) / 3600_000 : null;
  const rainSinceLastRainMm =
    lastRainMs !== null ? sumPrecipInRange(points, lastRainMs, nowMs) : sumPrecipInRange(points, nowMs - 24 * 3600_000, nowMs);

  const rangeStart = lastRainMs ?? points[0]?.ms ?? nowMs;
  let favorableDryingHours = 0;
  for (const p of points) {
    if (p.ms > rangeStart && p.ms <= nowMs) {
      const dewSpread = p.dewPointC !== null && p.temperatureC !== null ? p.temperatureC - p.dewPointC : null;
      if (calculateDryingScore(p, dewSpread, 0, rules) >= 60) favorableDryingHours++;
    }
  }

  let status: TerraceDryingStatus;
  if (lastRainHoursAgo === null) {
    status = past.length > 0 ? "LIKELY_DRY" : "DRYING";
  } else if (lastRainHoursAgo < rules.precipitation.minDryHoursBeforePainting / 2) {
    status = "LIKELY_WET";
  } else if (lastRainHoursAgo < rules.precipitation.minDryHoursBeforePainting) {
    status = "DRYING";
  } else {
    status = "LIKELY_DRY";
  }

  return { status, lastRainHoursAgo, rainSinceLastRainMm, favorableDryingHours };
}

function findNowIndex(points: WeatherPoint[], nowMs: number): number {
  let idx = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].ms <= nowMs) idx = i;
    else break;
  }
  return idx;
}

/**
 * The single entry point for "is it OK to paint" - everything else in this module is a building
 * block this function composes. Nothing outside painting.ts should reimplement these rules.
 */
export function evaluatePaintingConditions(
  points: WeatherPoint[],
  nowMs: number,
  rules: PaintingRules = PAINTING_RULES,
  opts: { manualWoodMoisture?: WoodMoistureReading | null } = {}
): PaintingAssessment {
  if (points.length === 0) {
    return {
      status: "BAD",
      score: 0,
      reasons: ["Žiadne dáta z GeoSphere pre toto okno."],
      warnings: [],
      bestWindow: null,
      hourly: [],
      terraceDrying: { status: "DRYING", lastRainHoursAgo: null, rainSinceLastRainMm: 0, favorableDryingHours: 0 },
      manualWoodMoisture: opts.manualWoodMoisture ?? null,
      metrics: {
        recentRainMm6h: 0,
        recentRainMm12h: 0,
        recentRainMm24h: 0,
        upcomingRainMm6h: 0,
        upcomingRainMm12h: 0,
        upcomingRainMm24h: 0,
        hoursUntilRain: null,
        temperatureC: null,
        relativeHumidity: null,
        dewPointC: null,
        dewPointSpreadC: null,
        windSpeedKmh: null,
        windGustKmh: null,
        solarRadiationWm2: null,
        dryingScore: 0,
        rainProbability12h: null,
        rainProbability24h: null,
      },
    };
  }

  const sun = sunTimesForRange(points[0].ms, points[points.length - 1].ms, LOCATION.latitude, LOCATION.longitude, LOCATION.timezone);
  const hourly = points.map((_, i) => evaluateHourForPainting(points, i, sun, rules));
  const bestWindow = findBestPaintingWindow(hourly);

  const nowIdx = findNowIndex(points, nowMs);
  const nowPoint = points[nowIdx];
  const dewPointSpreadC =
    nowPoint.dewPointC !== null && nowPoint.temperatureC !== null ? nowPoint.temperatureC - nowPoint.dewPointC : null;
  const recentRainMm6h = calculateRecentRain(points, nowMs, 6);
  const dryingScore = calculateDryingScore(nowPoint, dewPointSpreadC, recentRainMm6h, rules);

  const nowEval = hourly[nowIdx];
  let status: PaintingStatus = nowEval.status;
  const reasons = [...nowEval.reasons];
  const warnings: string[] = [];

  const terraceDrying = estimateTerraceDryingStatus(points, nowMs, rules);
  if (opts.manualWoodMoisture) {
    const measured = opts.manualWoodMoisture;
    warnings.push(`Ručne zadaná vlhkosť dreva: ${measured.percent.toFixed(0)} %.`);
    if (measured.percent > rules.woodMoisture.maxPercent) {
      status = "BAD";
      reasons.push(`Nameraná vlhkosť dreva ${measured.percent.toFixed(0)} % prekračuje limit ${rules.woodMoisture.maxPercent} %.`);
    }
  } else if (terraceDrying.status === "LIKELY_WET" && status !== "BAD") {
    status = "BAD";
    reasons.push("Odhad: terasa je pravdepodobne ešte mokrá z nedávnych zrážok.");
  }

  const hoursUntilRain = findNextRain(points, nowMs);
  if (hoursUntilRain === null) {
    warnings.push("V rámci dostupného horizontu predpovede sa nepredpokladajú žiadne zrážky.");
  }

  return {
    status,
    score: dryingScore,
    reasons,
    warnings,
    bestWindow,
    hourly,
    terraceDrying,
    manualWoodMoisture: opts.manualWoodMoisture ?? null,
    metrics: {
      recentRainMm6h,
      recentRainMm12h: calculateRecentRain(points, nowMs, 12),
      recentRainMm24h: calculateRecentRain(points, nowMs, 24),
      upcomingRainMm6h: upcomingRainMm(points, nowMs, 6),
      upcomingRainMm12h: upcomingRainMm(points, nowMs, 12),
      upcomingRainMm24h: upcomingRainMm(points, nowMs, 24),
      hoursUntilRain,
      temperatureC: nowPoint.temperatureC,
      relativeHumidity: nowPoint.humidityPct,
      dewPointC: nowPoint.dewPointC,
      dewPointSpreadC,
      windSpeedKmh: nowPoint.windSpeedKmh,
      windGustKmh: nowPoint.windGustKmh,
      solarRadiationWm2: nowPoint.radiationWm2,
      dryingScore,
      rainProbability12h: rainProbabilityBand(points, nowMs, 12),
      rainProbability24h: rainProbabilityBand(points, nowMs, 24),
    },
  };
}
