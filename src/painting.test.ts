import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateDryingScore,
  calculateRainFreeWindow,
  calculateRecentRain,
  evaluatePaintingConditions,
  findBestPaintingWindow,
  findNextRain,
  rainProbabilityBand,
  sumPrecipInRange,
} from "./painting.js";
import { calculateDewPoint } from "./geosphere.js";
import { sunTimesForRange } from "./astronomy.js";
import { PAINTING_RULES } from "./config.js";
import type { HourEvaluation, WeatherPoint } from "./types.js";

const TIMEZONE = "Europe/Vienna";

function localTimeStr(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

interface PointOverrides {
  precipitationMm?: number | null;
  temperatureC?: number | null;
  humidityPct?: number | null;
  dewPointC?: number | null;
  windSpeedKmh?: number | null;
  radiationWm2?: number | null;
}

/** Defaults to an "ideal painting weather" point - tests override only what's relevant. */
function mkPoint(ms: number, overrides: PointOverrides = {}): WeatherPoint {
  return {
    time: localTimeStr(ms),
    ms,
    precipitationMm: overrides.precipitationMm ?? 0,
    temperatureC: overrides.temperatureC ?? 22,
    humidityPct: overrides.humidityPct ?? 55,
    dewPointC: overrides.dewPointC ?? 15,
    windSpeedKmh: overrides.windSpeedKmh ?? 10,
    windGustKmh: null,
    radiationWm2: overrides.radiationWm2 ?? 400,
    precipEnsemble: null,
  };
}

function buildIdealSeries(startMs: number, endMs: number): WeatherPoint[] {
  const points: WeatherPoint[] = [];
  for (let ms = startMs; ms <= endMs; ms += 3600_000) points.push(mkPoint(ms));
  return points;
}

const DAY_START = Date.UTC(2026, 6, 14, 0, 0, 0);
const DAY_END = Date.UTC(2026, 6, 17, 0, 0, 0);
const NOW_MS = Date.UTC(2026, 6, 15, 10, 0, 0);

function overridePoint(points: WeatherPoint[], ms: number, overrides: PointOverrides): void {
  const idx = points.findIndex((p) => p.ms === ms);
  points[idx] = mkPoint(ms, overrides);
}

test("Scenario A: ideal conditions -> GOOD", () => {
  const points = buildIdealSeries(DAY_START, DAY_END);
  const assessment = evaluatePaintingConditions(points, NOW_MS, PAINTING_RULES);
  assert.equal(assessment.status, "GOOD");
});

test("Scenario B: high humidity -> BAD", () => {
  const points = buildIdealSeries(DAY_START, DAY_END);
  overridePoint(points, NOW_MS, { temperatureC: 15, humidityPct: 92, dewPointC: 13.5 });
  const assessment = evaluatePaintingConditions(points, NOW_MS, PAINTING_RULES);
  assert.equal(assessment.status, "BAD");
});

test("Scenario C: rain in 4h, needs 12h curing -> BAD", () => {
  const points = buildIdealSeries(DAY_START, DAY_END);
  overridePoint(points, NOW_MS + 4 * 3600_000, { precipitationMm: 2 });
  const assessment = evaluatePaintingConditions(points, NOW_MS, PAINTING_RULES);
  assert.equal(assessment.status, "BAD");
});

test("Scenario D: rain 2h ago, clear future -> not GOOD", () => {
  const points = buildIdealSeries(DAY_START, DAY_END);
  overridePoint(points, NOW_MS - 2 * 3600_000, { precipitationMm: 5 });
  const assessment = evaluatePaintingConditions(points, NOW_MS, PAINTING_RULES);
  assert.notEqual(assessment.status, "GOOD");
});

test("Scenario E: morning dew, temperature near dew point -> not GOOD", () => {
  const points = buildIdealSeries(DAY_START, DAY_END);
  overridePoint(points, NOW_MS, { temperatureC: 12, dewPointC: 11.2, humidityPct: 95 });
  const assessment = evaluatePaintingConditions(points, NOW_MS, PAINTING_RULES);
  assert.notEqual(assessment.status, "GOOD");
});

test("Scenario F: humid morning becomes favorable afternoon -> best window is the midday hours", () => {
  const points: WeatherPoint[] = [];
  for (let ms = DAY_START; ms <= DAY_END; ms += 3600_000) {
    const localHour = Number(localTimeStr(ms).slice(11, 13));
    points.push(
      localHour >= 10 && localHour <= 18
        ? mkPoint(ms, { humidityPct: 55, dewPointC: 15, temperatureC: 22 })
        : mkPoint(ms, { humidityPct: 92, dewPointC: 21.3, temperatureC: 22 })
    );
  }
  const assessment = evaluatePaintingConditions(points, NOW_MS, PAINTING_RULES);
  assert.ok(assessment.bestWindow, "expected a best window to be found");
  assert.equal(localTimeStr(assessment.bestWindow!.startMs).slice(11), "10:00");
  assert.equal(localTimeStr(assessment.bestWindow!.endMs).slice(11), "19:00");
  assert.equal(assessment.bestWindow!.durationHours, 9);
});

test("calculateDewPoint matches the standard Magnus-Tetens reference value", () => {
  // 20°C / 50% RH -> ~9.3°C is the commonly tabulated reference value for this approximation.
  const td = calculateDewPoint(20, 50);
  assert.ok(Math.abs(td - 9.3) < 0.5, `expected ~9.3, got ${td}`);
});

test("sumPrecipInRange / calculateRecentRain sum only within range and ignore nulls", () => {
  const points = [
    mkPoint(0, { precipitationMm: 1 }),
    mkPoint(3600_000, { precipitationMm: null }),
    mkPoint(7200_000, { precipitationMm: 2 }),
    mkPoint(10800_000, { precipitationMm: 4 }), // outside range below
  ];
  assert.equal(sumPrecipInRange(points, 0, 7200_000), 2);
  assert.equal(calculateRecentRain(points, 7200_000, 2), 2);
});

test("findNextRain returns hours to the next rain, or null when none predicted", () => {
  const points = [mkPoint(0), mkPoint(3600_000), mkPoint(7200_000, { precipitationMm: 3 })];
  assert.equal(findNextRain(points, 0), 2);
  assert.equal(findNextRain(points, 7200_000), null);
});

test("calculateRainFreeWindow distinguishes confirmed-dry from ran-out-of-data", () => {
  const rainy = [mkPoint(0), mkPoint(3600_000), mkPoint(7200_000, { precipitationMm: 5 })];
  const confirmed = calculateRainFreeWindow(rainy, 0);
  assert.equal(confirmed.hours, 2);
  assert.equal(confirmed.limitedByHorizon, false);

  const allDry = [mkPoint(0), mkPoint(3600_000), mkPoint(7200_000)];
  const unconfirmed = calculateRainFreeWindow(allDry, 0);
  assert.equal(unconfirmed.hours, 2);
  assert.equal(unconfirmed.limitedByHorizon, true);
});

test("calculateDryingScore: ideal point scores high, raining scores 0", () => {
  const ideal = mkPoint(0);
  assert.ok(calculateDryingScore(ideal, 7, 0, PAINTING_RULES) >= 80);

  const raining = mkPoint(0, { precipitationMm: 3 });
  assert.equal(calculateDryingScore(raining, 7, 0, PAINTING_RULES), 0);
});

test("rainProbabilityBand derives a band from ensemble percentiles, and null without ensemble data", () => {
  const dry: WeatherPoint = { ...mkPoint(3600_000), precipEnsemble: { p10: 0, p50: 0, p90: 0 } };
  const uncertain: WeatherPoint = { ...mkPoint(3600_000), precipEnsemble: { p10: 0, p50: 0, p90: 1.5 } };
  const likely: WeatherPoint = { ...mkPoint(3600_000), precipEnsemble: { p10: 0, p50: 1, p90: 3 } };
  const veryLikely: WeatherPoint = { ...mkPoint(3600_000), precipEnsemble: { p10: 2, p50: 4, p90: 6 } };

  assert.equal(rainProbabilityBand([dry], 0, 12)?.label, "< 10 %");
  assert.equal(rainProbabilityBand([uncertain], 0, 12)?.label, "10 – 50 %");
  assert.equal(rainProbabilityBand([likely], 0, 12)?.label, "50 – 90 %");
  assert.equal(rainProbabilityBand([veryLikely], 0, 12)?.label, "> 90 %");

  const noEnsemble = mkPoint(3600_000);
  assert.equal(rainProbabilityBand([noEnsemble], 0, 12), null);
});

test("findBestPaintingWindow does not merge runs across a data gap", () => {
  const hourly: HourEvaluation[] = [
    { ms: 0, status: "GOOD", isDaylight: true, reasons: [] },
    { ms: 3600_000, status: "GOOD", isDaylight: true, reasons: [] },
    // gap: next point is 3h later instead of 1h
    { ms: 4 * 3600_000, status: "GOOD", isDaylight: true, reasons: [] },
    { ms: 5 * 3600_000, status: "GOOD", isDaylight: true, reasons: [] },
    { ms: 6 * 3600_000, status: "GOOD", isDaylight: true, reasons: [] },
  ];
  const best = findBestPaintingWindow(hourly);
  assert.ok(best);
  // The 3-hour run (4h,5h,6h) is longer than the 2-hour run (0h,1h) despite coming second.
  assert.equal(best!.startMs, 4 * 3600_000);
  assert.equal(best!.durationHours, 3);
});

test("sunTimesForRange gives plausible sunrise/sunset for an Austrian summer day", () => {
  const noonUtc = Date.UTC(2026, 6, 15, 12, 0, 0);
  const times = sunTimesForRange(noonUtc, noonUtc, 46.8, 13.92, TIMEZONE);
  const today = times.get("2026-07-15");
  assert.ok(today?.sunrise && today?.sunset);
  const sunriseLocal = localTimeStr(today!.sunrise!.getTime()).slice(11);
  const sunsetLocal = localTimeStr(today!.sunset!.getTime()).slice(11);
  assert.ok(sunriseLocal > "04:30" && sunriseLocal < "06:30", `unexpected sunrise ${sunriseLocal}`);
  assert.ok(sunsetLocal > "19:30" && sunsetLocal < "21:30", `unexpected sunset ${sunsetLocal}`);
});
