import { Resvg } from "@resvg/resvg-js";
import type { HourEvaluation, PaintingAssessment, PaintingStatus, WeatherPoint } from "./types.js";
import { LOCATION, DEW_POINT_SPREAD_DISPLAY_THRESHOLDS, HUMIDITY_DISPLAY_THRESHOLDS } from "./config.js";
import { dryingScoreLabel } from "./painting.js";
import { sunTimesForRange } from "./astronomy.js";

/** Fixed hex palette used directly as inline SVG styles (not CSS vars), so the chart markup is
 * identical and self-contained whether it's embedded in the (theme-aware) dashboard page or
 * inlined into an e-mail with no shared stylesheet. */
const PALETTE = {
  precip: "#2a78d6",
  temp: "#d9622a",
  dewPoint: "#8a5fb0",
  radiation: "#e0b430",
  wind: "#4d8790",
  humidity: "#3f9e89",
  gridline: "#d8d6cd",
  axis: "#8a8880",
  critical: "#d03b3b",
  night: "#8a8880",
  statusGood: "#2f9e44",
  statusMarginal: "#d99a1f",
  statusBad: "#d03b3b",
};

export function statusColor(status: PaintingStatus): string {
  return status === "GOOD" ? PALETTE.statusGood : status === "MARGINAL" ? PALETTE.statusMarginal : PALETTE.statusBad;
}

function statusLabel(status: PaintingStatus): string {
  return status === "GOOD" ? "DOBRÉ NA MAĽOVANIE" : status === "MARGINAL" ? "HRANIČNÉ PODMIENKY" : "NEMAĽOVAŤ";
}

function statusIcon(status: PaintingStatus): string {
  return status === "GOOD" ? "🟢" : status === "MARGINAL" ? "🟡" : "🔴";
}

export const CHART_WIDTH = 900;
const CHART_HEIGHT = 210;
const MARGIN = { top: 22, right: 50, bottom: 32, left: 46 };
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const STRIP_H = 7;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatHm(ms: number): string {
  return new Intl.DateTimeFormat("sk-SK", { timeZone: LOCATION.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(ms)
  );
}

function formatDayHm(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCATION.timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}. ${get("hour")}:${get("minute")}`;
}

function formatLocal(t: string): { date: string; time: string } {
  const [datePart, timePart] = t.split("T");
  const [, m, d] = datePart.split("-");
  return { date: `${d}.${m}.`, time: timePart.slice(0, 5) };
}

function formatGeneratedAt(d: Date): string {
  const parts = new Intl.DateTimeFormat("sk-SK", {
    timeZone: LOCATION.timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(min + ((max - min) / count) * i);
  return ticks;
}

export function colorForHumidity(rh: number): string {
  if (rh > HUMIDITY_DISPLAY_THRESHOLDS.yellow) return PALETTE.statusBad;
  if (rh > HUMIDITY_DISPLAY_THRESHOLDS.green) return PALETTE.statusMarginal;
  return PALETTE.statusGood;
}

export function colorForDewPointSpread(spreadC: number): string {
  if (spreadC < DEW_POINT_SPREAD_DISPLAY_THRESHOLDS.red) return PALETTE.statusBad;
  if (spreadC < DEW_POINT_SPREAD_DISPLAY_THRESHOLDS.yellow) return PALETTE.statusMarginal;
  return PALETTE.statusGood;
}

export interface WeatherStats {
  totalPrecipMm: number;
  minTempC: number | null;
  maxTempC: number | null;
  avgHumidityPct: number | null;
}

export function computeStats(points: WeatherPoint[]): WeatherStats {
  let totalPrecipMm = 0;
  let minTempC: number | null = null;
  let maxTempC: number | null = null;
  let humiditySum = 0;
  let humidityCount = 0;
  for (const p of points) {
    if (p.precipitationMm !== null) totalPrecipMm += p.precipitationMm;
    if (p.temperatureC !== null) {
      minTempC = minTempC === null ? p.temperatureC : Math.min(minTempC, p.temperatureC);
      maxTempC = maxTempC === null ? p.temperatureC : Math.max(maxTempC, p.temperatureC);
    }
    if (p.humidityPct !== null) {
      humiditySum += p.humidityPct;
      humidityCount++;
    }
  }
  const avgHumidityPct = humidityCount > 0 ? humiditySum / humidityCount : null;
  return { totalPrecipMm, minTempC, maxTempC, avgHumidityPct };
}

// ---------------------------------------------------------------------------
// Shared chart scaffolding: every chart (precip / temp+dewpoint / humidity /
// radiation+wind) is built from the same layout primitives so the four stay
// visually consistent - same x-axis, same night shading, same suitability
// strip, same hover/tooltip wiring - without forcing them onto one shared
// (and therefore necessarily compromised) y-scale.
// ---------------------------------------------------------------------------

interface Layout {
  points: WeatherPoint[];
  windowStartMs: number;
  windowEndMs: number;
  xScale: (ms: number) => number;
}

function buildLayout(points: WeatherPoint[]): Layout {
  const windowStartMs = points[0]?.ms ?? 0;
  const windowEndMs = points[points.length - 1]?.ms ?? windowStartMs + 1;
  const span = Math.max(1, windowEndMs - windowStartMs);
  return { points, windowStartMs, windowEndMs, xScale: (ms) => MARGIN.left + ((ms - windowStartMs) / span) * PLOT_W };
}

/** Shades contiguous night runs (from the painting engine's own isDaylight per hour, so the chart
 * always agrees with the decision logic about what counts as "dark") across the full plot height. */
function renderNightShading(layout: Layout, hourly: HourEvaluation[]): string {
  if (hourly.length === 0) return "";
  const rects: string[] = [];
  let runStartMs: number | null = null;
  for (let i = 0; i < hourly.length; i++) {
    if (!hourly[i].isDaylight) {
      if (runStartMs === null) runStartMs = hourly[i].ms;
    } else if (runStartMs !== null) {
      rects.push(rect(runStartMs, hourly[i].ms));
      runStartMs = null;
    }
  }
  if (runStartMs !== null) rects.push(rect(runStartMs, layout.windowEndMs));
  return rects.join("");

  function rect(startMs: number, endMs: number): string {
    const x1 = layout.xScale(startMs);
    const x2 = layout.xScale(endMs);
    return `<rect x="${x1.toFixed(1)}" y="${MARGIN.top}" width="${Math.max(0, x2 - x1).toFixed(1)}" height="${PLOT_H}" style="fill:${PALETTE.night};opacity:0.10" />`;
  }
}

/** Thin colored strip just under the plot area encoding painting suitability per hour - the same
 * green/amber/red used everywhere else in the report, so every chart carries the decision, not just
 * the dedicated timeline. */
function renderSuitabilityStrip(layout: Layout, hourly: HourEvaluation[]): string {
  if (hourly.length < 2) return "";
  const y = MARGIN.top + PLOT_H + 4;
  const segments: string[] = [];
  for (let i = 0; i < hourly.length - 1; i++) {
    const x1 = layout.xScale(hourly[i].ms);
    const x2 = layout.xScale(hourly[i + 1].ms);
    segments.push(
      `<rect x="${x1.toFixed(1)}" y="${y}" width="${Math.max(0, x2 - x1).toFixed(1)}" height="${STRIP_H}" style="fill:${statusColor(hourly[i].status)};opacity:0.85" />`
    );
  }
  return segments.join("");
}

function renderNowMarker(layout: Layout, nowMs: number): string {
  const x = layout.xScale(nowMs);
  return `
    <line x1="${x.toFixed(1)}" y1="${MARGIN.top}" x2="${x.toFixed(1)}" y2="${MARGIN.top + PLOT_H}" style="stroke:${PALETTE.critical};stroke-width:1.5;stroke-dasharray:3 3;opacity:0.85" />
    <text x="${x.toFixed(1)}" y="${MARGIN.top - 6}" style="fill:${PALETTE.critical};font-size:10px;font-weight:600" text-anchor="middle">teraz</text>
  `;
}

const MIN_LABEL_GAP_PX = 60;

function renderXAxisLabels(layout: Layout): string {
  const xLabels: string[] = [];
  let lastLabelX = -Infinity;
  for (const p of layout.points) {
    const { date, time } = formatLocal(p.time);
    if (time === "00:00" || time === "12:00" || p.ms === layout.windowStartMs) {
      const x = layout.xScale(p.ms);
      if (x - lastLabelX < MIN_LABEL_GAP_PX) continue;
      xLabels.push(
        `<text x="${x.toFixed(1)}" y="${CHART_HEIGHT - MARGIN.bottom + 24}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="middle">${esc(date)} ${esc(time)}</text>`
      );
      lastLabelX = x;
    }
  }
  return xLabels.join("");
}

interface TooltipRow {
  label: string;
  value: string;
  color: string;
}

interface ChartResult {
  svg: string;
  script: string;
}

function backgroundRect(interactive: boolean): string {
  return !interactive ? `<rect x="0" y="0" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" style="fill:#ffffff" />` : "";
}

function interactiveLayer(chartId: string, interactive: boolean): string {
  return interactive
    ? `
      <line class="crosshair" x1="0" y1="${MARGIN.top}" x2="0" y2="${MARGIN.top + PLOT_H}" data-chart="${chartId}" />
      <rect class="hover-capture" x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_W}" height="${PLOT_H}" data-chart="${chartId}" />
    `
    : "";
}

function buildTooltipScript(
  chartId: string,
  points: WeatherPoint[],
  layout: Layout,
  rowsFor: (p: WeatherPoint) => TooltipRow[]
): string {
  const dataset = {
    points: points.map((p) => ({
      x: Number(layout.xScale(p.ms).toFixed(1)),
      label: `${formatLocal(p.time).date} ${formatLocal(p.time).time}`,
      rows: rowsFor(p),
    })),
  };
  return `CHART_DATA[${JSON.stringify(chartId)}] = ${JSON.stringify(dataset)};`;
}

/** Precipitation chart: bars, its own left axis in mm. The one series never sharing a panel with
 * anything else, so it's never mistaken for a line or confused with another quantity. */
function buildPrecipChart(
  points: WeatherPoint[],
  nowMs: number,
  hourly: HourEvaluation[],
  opts: { interactive: boolean }
): ChartResult {
  const chartId = "precip";
  const layout = buildLayout(points);
  const values = points.map((p) => p.precipitationMm).filter((v): v is number => v !== null);
  const max = Math.max(1, ...values, 0) * 1.25;
  const y = (mm: number) => MARGIN.top + PLOT_H - (mm / max) * PLOT_H;

  const stepMs = points.length > 1 ? points[1].ms - points[0].ms : 3600_000;
  const barW = Math.max(2, (stepMs / Math.max(1, layout.windowEndMs - layout.windowStartMs)) * PLOT_W * 0.7);

  const bars = points
    .filter((p) => p.precipitationMm !== null && p.precipitationMm > 0)
    .map((p) => {
      const isPast = p.ms <= nowMs;
      const x = layout.xScale(p.ms) - barW / 2;
      const yTop = y(p.precipitationMm!);
      const h = MARGIN.top + PLOT_H - yTop;
      return `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" style="fill:${PALETTE.precip};opacity:${isPast ? 0.9 : 0.55}" />`;
    })
    .join("");

  const ticks = niceTicks(0, max, 3);
  const grid = ticks
    .map(
      (v) => `
        <line x1="${MARGIN.left}" y1="${y(v).toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y(v).toFixed(1)}" style="stroke:${PALETTE.gridline};stroke-width:1" />
        <text x="${MARGIN.left - 8}" y="${(y(v) + 3).toFixed(1)}" style="fill:${PALETTE.precip};font-size:10px" text-anchor="end">${v.toFixed(1)}</text>
      `
    )
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="Graf zrážok">
      ${backgroundRect(opts.interactive)}
      ${renderNightShading(layout, hourly)}
      ${grid}
      ${renderXAxisLabels(layout)}
      ${bars}
      ${renderSuitabilityStrip(layout, hourly)}
      ${renderNowMarker(layout, nowMs)}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${opts.interactive ? `<div class="tooltip" data-chart-tooltip="${chartId}" style="display:none"></div>` : ""}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, (p) => [
    { label: "Zrážky", value: p.precipitationMm !== null ? `${p.precipitationMm.toFixed(1)} mm` : "–", color: PALETTE.precip },
  ]);
  return { svg, script };
}

/** Temperature + dew point: the one legitimate shared-axis pair in this report, since both are °C
 * on the same physical scale - not a dual-axis chart, just two lines on one real axis. */
function buildTempDewPointChart(
  points: WeatherPoint[],
  nowMs: number,
  hourly: HourEvaluation[],
  opts: { interactive: boolean }
): ChartResult {
  const chartId = "temp";
  const layout = buildLayout(points);
  const allValues = points.flatMap((p) => [p.temperatureC, p.dewPointC]).filter((v): v is number => v !== null);
  const min = allValues.length > 0 ? Math.min(...allValues) - 2 : 0;
  const max = allValues.length > 0 ? Math.max(...allValues) + 2 : 1;
  const y = (c: number) => MARGIN.top + PLOT_H - ((c - min) / (max - min)) * PLOT_H;

  const linePath = (key: "temperatureC" | "dewPointC") =>
    points
      .filter((p) => p[key] !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${layout.xScale(p.ms).toFixed(1)} ${y(p[key] as number).toFixed(1)}`)
      .join(" ");

  const tempPath = linePath("temperatureC");
  const dewPath = linePath("dewPointC");
  const tempLine = tempPath ? `<path d="${tempPath}" style="fill:none;stroke:${PALETTE.temp};stroke-width:2;stroke-linecap:round;stroke-linejoin:round" />` : "";
  const dewLine = dewPath
    ? `<path d="${dewPath}" style="fill:none;stroke:${PALETTE.dewPoint};stroke-width:1.5;stroke-dasharray:4 3;stroke-linecap:round;stroke-linejoin:round" />`
    : "";

  const ticks = niceTicks(min, max, 4);
  const axis = ticks
    .map((v) => `<text x="${MARGIN.left - 8}" y="${(y(v) + 3).toFixed(1)}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="end">${v.toFixed(0)}°</text>`)
    .join("");
  const grid = ticks
    .map((v) => `<line x1="${MARGIN.left}" y1="${y(v).toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y(v).toFixed(1)}" style="stroke:${PALETTE.gridline};stroke-width:1" />`)
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="Graf teploty a rosného bodu">
      ${backgroundRect(opts.interactive)}
      ${renderNightShading(layout, hourly)}
      ${grid}
      ${axis}
      ${renderXAxisLabels(layout)}
      ${dewLine}
      ${tempLine}
      ${renderSuitabilityStrip(layout, hourly)}
      ${renderNowMarker(layout, nowMs)}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${opts.interactive ? `<div class="tooltip" data-chart-tooltip="${chartId}" style="display:none"></div>` : ""}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, (p) => [
    { label: "Teplota", value: p.temperatureC !== null ? `${p.temperatureC.toFixed(1)} °C` : "–", color: PALETTE.temp },
    { label: "Rosný bod", value: p.dewPointC !== null ? `${p.dewPointC.toFixed(1)} °C` : "–", color: PALETTE.dewPoint },
  ]);
  return { svg, script };
}

/** Humidity: its own chart with a real 0-100% axis - previously humidity was folded into the
 * combined chart with no numbered scale at all, which made it impossible to read precisely. */
function buildHumidityChart(
  points: WeatherPoint[],
  nowMs: number,
  hourly: HourEvaluation[],
  opts: { interactive: boolean }
): ChartResult {
  const chartId = "humidity";
  const layout = buildLayout(points);
  const y = (pct: number) => MARGIN.top + PLOT_H - (pct / 100) * PLOT_H;

  const path = points
    .filter((p) => p.humidityPct !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${layout.xScale(p.ms).toFixed(1)} ${y(p.humidityPct!).toFixed(1)}`)
    .join(" ");
  const floorY = MARGIN.top + PLOT_H;
  const area = path
    ? `<path d="${path} L ${layout.xScale(points[points.length - 1].ms).toFixed(1)} ${floorY} L ${layout.xScale(points[0].ms).toFixed(1)} ${floorY} Z" style="fill:${PALETTE.humidity};opacity:0.18" />`
    : "";
  const line = path ? `<path d="${path}" style="fill:none;stroke:${PALETTE.humidity};stroke-width:2;stroke-linecap:round" />` : "";

  const ticks = [0, 25, 50, 75, 100];
  const axis = ticks
    .map((v) => `<text x="${MARGIN.left - 8}" y="${(y(v) + 3).toFixed(1)}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="end">${v}%</text>`)
    .join("");
  const grid = ticks
    .map((v) => `<line x1="${MARGIN.left}" y1="${y(v).toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y(v).toFixed(1)}" style="stroke:${PALETTE.gridline};stroke-width:1" />`)
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="Graf relatívnej vlhkosti">
      ${backgroundRect(opts.interactive)}
      ${renderNightShading(layout, hourly)}
      ${grid}
      ${axis}
      ${renderXAxisLabels(layout)}
      ${area}
      ${line}
      ${renderSuitabilityStrip(layout, hourly)}
      ${renderNowMarker(layout, nowMs)}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${opts.interactive ? `<div class="tooltip" data-chart-tooltip="${chartId}" style="display:none"></div>` : ""}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, (p) => [
    { label: "Vlhkosť", value: p.humidityPct !== null ? `${p.humidityPct.toFixed(0)} %` : "–", color: PALETTE.humidity },
  ]);
  return { svg, script };
}

/** Solar radiation (real axis, W/m²) + wind speed as a secondary line on its own internal 0->max
 * scale (no numbered axis, avoiding a dual-axis chart) - the real value is always in the tooltip. */
function buildRadiationWindChart(
  points: WeatherPoint[],
  nowMs: number,
  hourly: HourEvaluation[],
  opts: { interactive: boolean }
): ChartResult {
  const chartId = "radiation";
  const layout = buildLayout(points);
  const radiationValues = points.map((p) => p.radiationWm2).filter((v): v is number => v !== null);
  const radiationMax = Math.max(50, ...radiationValues, 0);
  const yRadiation = (w: number) => MARGIN.top + PLOT_H - (w / radiationMax) * PLOT_H;

  const windValues = points.map((p) => p.windSpeedKmh).filter((v): v is number => v !== null);
  const windMax = Math.max(5, ...windValues, 0) * 1.2;
  const yWind = (kmh: number) => MARGIN.top + PLOT_H - (kmh / windMax) * PLOT_H;

  const radiationPath = points
    .filter((p) => p.radiationWm2 !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${layout.xScale(p.ms).toFixed(1)} ${yRadiation(p.radiationWm2!).toFixed(1)}`)
    .join(" ");
  const floorY = MARGIN.top + PLOT_H;
  const radiationArea = radiationPath
    ? `<path d="${radiationPath} L ${layout.xScale(points[points.length - 1].ms).toFixed(1)} ${floorY} L ${layout.xScale(points[0].ms).toFixed(1)} ${floorY} Z" style="fill:${PALETTE.radiation};opacity:0.15" />`
    : "";
  const radiationLine = radiationPath ? `<path d="${radiationPath}" style="fill:none;stroke:${PALETTE.radiation};stroke-width:1.5;stroke-linecap:round" />` : "";

  const windPath = points
    .filter((p) => p.windSpeedKmh !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${layout.xScale(p.ms).toFixed(1)} ${yWind(p.windSpeedKmh!).toFixed(1)}`)
    .join(" ");
  const windLine = windPath ? `<path d="${windPath}" style="fill:none;stroke:${PALETTE.wind};stroke-width:1.5;stroke-dasharray:2 2;stroke-linecap:round" />` : "";

  const ticks = niceTicks(0, radiationMax, 3);
  const axis = ticks
    .map((v) => `<text x="${MARGIN.left - 8}" y="${(yRadiation(v) + 3).toFixed(1)}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="end">${v.toFixed(0)}</text>`)
    .join("");
  const grid = ticks
    .map((v) => `<line x1="${MARGIN.left}" y1="${yRadiation(v).toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${yRadiation(v).toFixed(1)}" style="stroke:${PALETTE.gridline};stroke-width:1" />`)
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="Graf slnečného žiarenia a vetra">
      ${backgroundRect(opts.interactive)}
      ${renderNightShading(layout, hourly)}
      ${grid}
      ${axis}
      ${renderXAxisLabels(layout)}
      ${radiationArea}
      ${radiationLine}
      ${windLine}
      ${renderSuitabilityStrip(layout, hourly)}
      ${renderNowMarker(layout, nowMs)}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${opts.interactive ? `<div class="tooltip" data-chart-tooltip="${chartId}" style="display:none"></div>` : ""}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, (p) => [
    { label: "Slnko", value: p.radiationWm2 !== null ? `${p.radiationWm2.toFixed(0)} W/m²` : "–", color: PALETTE.radiation },
    { label: "Vietor", value: p.windSpeedKmh !== null ? `${p.windSpeedKmh.toFixed(0)} km/h` : "–", color: PALETTE.wind },
  ]);
  return { svg, script };
}

export interface WeatherCharts {
  precip: ChartResult;
  temp: ChartResult;
  humidity: ChartResult;
  radiation: ChartResult;
}

export function buildWeatherCharts(
  points: WeatherPoint[],
  nowMs: number,
  hourly: HourEvaluation[],
  opts: { interactive?: boolean } = {}
): WeatherCharts {
  const o = { interactive: opts.interactive ?? true };
  return {
    precip: buildPrecipChart(points, nowMs, hourly, o),
    temp: buildTempDewPointChart(points, nowMs, hourly, o),
    humidity: buildHumidityChart(points, nowMs, hourly, o),
    radiation: buildRadiationWindChart(points, nowMs, hourly, o),
  };
}

/** Continuous painting-suitability timeline: a single colored bar across the whole fetched window
 * (not per-hour emoji), with the best window bracketed and labeled - the visual the spec asks for
 * under "PAINTING WINDOW". */
export function buildPaintingTimeline(hourly: HourEvaluation[], nowMs: number, bestWindow: { startMs: number; endMs: number } | null): string {
  if (hourly.length === 0) return "";
  const height = 74;
  const barY = 30;
  const barH = 22;
  const layout = buildLayout(hourly.map((h) => ({ ms: h.ms }) as WeatherPoint));

  const segments = hourly
    .slice(0, -1)
    .map((h, i) => {
      const x1 = layout.xScale(h.ms);
      const x2 = layout.xScale(hourly[i + 1].ms);
      return `<rect x="${x1.toFixed(1)}" y="${barY}" width="${Math.max(0, x2 - x1).toFixed(1)}" height="${barH}" style="fill:${statusColor(h.status)}" />`;
    })
    .join("");

  const xLabels: string[] = [];
  let lastLabelX = -Infinity;
  for (const h of hourly) {
    const time = formatHm(h.ms);
    if (time.endsWith(":00") && Number(time.slice(0, 2)) % 3 === 0) {
      const x = layout.xScale(h.ms);
      if (x - lastLabelX < 40) continue;
      xLabels.push(`<text x="${x.toFixed(1)}" y="${barY - 8}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="middle">${time}</text>`);
      lastLabelX = x;
    }
  }

  const nowX = layout.xScale(nowMs);
  const nowMarker = `<line x1="${nowX.toFixed(1)}" y1="${barY - 4}" x2="${nowX.toFixed(1)}" y2="${barY + barH + 4}" style="stroke:${PALETTE.critical};stroke-width:2" />`;

  let bracket = "";
  if (bestWindow) {
    const x1 = layout.xScale(bestWindow.startMs);
    const x2 = layout.xScale(bestWindow.endMs);
    const y = barY + barH + 14;
    bracket = `
      <line x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" style="stroke:${PALETTE.statusGood};stroke-width:2" />
      <line x1="${x1.toFixed(1)}" y1="${y - 4}" x2="${x1.toFixed(1)}" y2="${y + 4}" style="stroke:${PALETTE.statusGood};stroke-width:2" />
      <line x1="${x2.toFixed(1)}" y1="${y - 4}" x2="${x2.toFixed(1)}" y2="${y + 4}" style="stroke:${PALETTE.statusGood};stroke-width:2" />
      <text x="${((x1 + x2) / 2).toFixed(1)}" y="${y + 16}" style="fill:${PALETTE.statusGood};font-size:11px;font-weight:600" text-anchor="middle">${formatHm(bestWindow.startMs)} – ${formatHm(bestWindow.endMs)}</text>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${height}" width="${CHART_WIDTH}" height="${height}" class="chart-svg" role="img" aria-label="Časová os vhodnosti na maľovanie">
      <rect x="${MARGIN.left}" y="${barY}" width="${PLOT_W}" height="${barH}" rx="4" style="fill:${PALETTE.gridline}" />
      ${segments}
      ${xLabels.join("")}
      ${nowMarker}
      ${bracket}
    </svg>
  `;
}

/**
 * Rasterizes all four charts stacked into one tall PNG for e-mail/docs publishing - Gmail and most
 * mail clients strip inline <svg> and refuse `data:` image URIs, so a single hosted image is the
 * only reliable way to show charts in the e-mail. Charts stay visually split (own scales/titles)
 * even though they ship as one file.
 */
export function renderChartPng(points: WeatherPoint[], nowMs: number, hourly: HourEvaluation[]): Buffer {
  const charts = buildWeatherCharts(points, nowMs, hourly, { interactive: false });
  const titles = {
    precip: "Zrážky (mm)",
    temp: "Teplota a rosný bod (°C)",
    humidity: "Relatívna vlhkosť (%)",
    radiation: "Slnečné žiarenie (W/m²) a vietor (km/h)",
  };
  const titleH = 22;
  const panelH = titleH + CHART_HEIGHT;
  const order: (keyof WeatherCharts)[] = ["precip", "temp", "humidity", "radiation"];
  const totalHeight = panelH * order.length;

  const panels = order
    .map((key, i) => {
      const y = i * panelH;
      return `
        <g transform="translate(0, ${y})">
          <text x="${MARGIN.left}" y="16" style="fill:#22201b;font-size:13px;font-weight:600">${esc(titles[key])}</text>
          <g transform="translate(0, ${titleH})">${charts[key].svg}</g>
        </g>
      `;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${totalHeight}" width="${CHART_WIDTH}" height="${totalHeight}">
      <rect x="0" y="0" width="${CHART_WIDTH}" height="${totalHeight}" style="fill:#ffffff" />
      ${panels}
    </svg>
  `;
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CHART_WIDTH * 2 } });
  return resvg.render().asPng();
}

function renderLegend(): string {
  return `
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch legend-swatch-precip"></span>Zrážky (mm)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-temp"></span>Teplota (°C)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-dewpoint"></span>Rosný bod (°C)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-humidity"></span>Vlhkosť (%)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-radiation"></span>Slnečné žiarenie (W/m²)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-wind"></span>Vietor (km/h)</span>
    </div>
  `;
}

const HOVER_SCRIPT = `
    document.querySelectorAll(".hover-capture").forEach((rect) => {
      const chartId = rect.getAttribute("data-chart");
      const svg = rect.closest("svg");
      const crosshair = svg.querySelector(\`.crosshair[data-chart="\${chartId}"]\`);
      const tooltip = document.querySelector(\`[data-chart-tooltip="\${chartId}"]\`);
      const chart = CHART_DATA[chartId];
      if (!chart) return;
      const data = chart.points;

      function nearestPoint(mouseX) {
        let best = data[0];
        let bestDist = Infinity;
        for (const p of data) {
          const dist = Math.abs(p.x - mouseX);
          if (dist < bestDist) { bestDist = dist; best = p; }
        }
        return best;
      }

      rect.addEventListener("pointermove", (evt) => {
        const box = svg.getBoundingClientRect();
        const scale = ${CHART_WIDTH} / box.width;
        const mouseX = (evt.clientX - box.left) * scale;
        const point = nearestPoint(mouseX);
        if (!point) return;

        crosshair.setAttribute("x1", point.x);
        crosshair.setAttribute("x2", point.x);
        crosshair.style.opacity = "1";

        tooltip.replaceChildren();
        const timeEl = document.createElement("div");
        timeEl.className = "tooltip-time";
        timeEl.textContent = point.label;
        tooltip.appendChild(timeEl);
        for (const rowData of point.rows) {
          const row = document.createElement("div");
          row.className = "tooltip-row";
          const key = document.createElement("span");
          key.className = "tooltip-key";
          const swatch = document.createElement("span");
          swatch.className = "legend-swatch";
          swatch.style.background = rowData.color;
          key.appendChild(swatch);
          key.appendChild(document.createTextNode(rowData.label));
          const value = document.createElement("span");
          value.className = "tooltip-value";
          value.textContent = rowData.value;
          row.appendChild(key);
          row.appendChild(value);
          tooltip.appendChild(row);
        }

        const container = rect.closest(".card") || document.body;
        const containerBox = container.getBoundingClientRect();
        tooltip.style.display = "block";
        tooltip.style.left = (evt.clientX - containerBox.left + 12) + "px";
        tooltip.style.top = (evt.clientY - containerBox.top + 12) + "px";
      });

      rect.addEventListener("pointerleave", () => {
        crosshair.style.opacity = "0";
        tooltip.style.display = "none";
      });
    });
`;

const CHART_STYLES = `
  .chart-svg { width: 100%; height: auto; overflow: visible; }
  .chart-title { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin: 0 0 4px; }
  .crosshair { stroke: var(--baseline); stroke-width: 1; opacity: 0; pointer-events: none; }
  .hover-capture { fill: transparent; cursor: crosshair; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0 4px; font-size: 0.85rem; color: var(--text-secondary); }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .legend-swatch-precip { background: var(--series-precip); }
  .legend-swatch-temp { background: var(--series-temp); }
  .legend-swatch-dewpoint { background: var(--series-dewpoint); }
  .legend-swatch-radiation { background: var(--series-radiation); }
  .legend-swatch-humidity { background: var(--series-humidity); }
  .legend-swatch-wind { background: var(--series-wind); }
  .tooltip {
    position: absolute;
    display: none;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.78rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    pointer-events: none;
    z-index: 10;
    max-width: 220px;
  }
  .tooltip-time { color: var(--text-secondary); margin-bottom: 4px; }
  .tooltip-row { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
  .tooltip-key { display: inline-flex; align-items: center; gap: 5px; color: var(--text-secondary); }
  .tooltip-value { font-weight: 600; }
`;

// ---------------------------------------------------------------------------
// Decision-first presentation components (status card, timeline, stat panels)
// ---------------------------------------------------------------------------

function windowLabel(assessment: PaintingAssessment): string {
  if (!assessment.bestWindow) return "Momentálne sa nenašlo žiadne vhodné okno na maľovanie.";
  const { startMs, endMs, durationHours } = assessment.bestWindow;
  return `${formatHm(startMs)} – ${formatHm(endMs)} <span class="muted">(${durationHours} h)</span>`;
}

function curingLabel(assessment: PaintingAssessment): string {
  if (!assessment.bestWindow) return "–";
  const curingHours = Math.max(0, (assessment.bestWindow.endMs - assessment.bestWindow.startMs) / 3600_000);
  return `${curingHours.toFixed(0)} h`;
}

function renderStatusCard(assessment: PaintingAssessment): string {
  const color = statusColor(assessment.status);
  const reasonsList =
    assessment.reasons.length > 0 ? `<ul class="reason-list">${assessment.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "";
  const warningsList =
    assessment.warnings.length > 0 ? `<ul class="reason-list muted">${assessment.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "";

  return `
    <section class="card status-card" style="--status-color:${color}">
      <div class="status-header">
        <span class="status-icon">${statusIcon(assessment.status)}</span>
        <span class="status-label">${statusLabel(assessment.status)}</span>
      </div>
      <div class="status-grid">
        <div>
          <div class="status-metric-label">Najlepšie okno</div>
          <div class="status-metric-value">${windowLabel(assessment)}</div>
        </div>
        <div>
          <div class="status-metric-label">Bezdažďový čas na vyschnutie</div>
          <div class="status-metric-value">${curingLabel(assessment)}</div>
        </div>
      </div>
      ${reasonsList}
      ${warningsList}
    </section>
  `;
}

function renderRainPanel(assessment: PaintingAssessment): string {
  const m = assessment.metrics;
  const row = (label: string, value: string) => `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  const nextRain = m.hoursUntilRain !== null ? `o ${m.hoursUntilRain.toFixed(0)} h` : "nepredpokladá sa v rámci horizontu";
  const prob12 = m.rainProbability12h ? m.rainProbability12h.label : "nedostupné (bez ensemble dát)";
  const prob24 = m.rainProbability24h ? m.rainProbability24h.label : "nedostupné (bez ensemble dát)";

  return `
    <section class="card">
      <h2 class="panel-title">Zrážky</h2>
      ${row("Posledných 6 h", `${m.recentRainMm6h.toFixed(1)} mm`)}
      ${row("Posledných 12 h", `${m.recentRainMm12h.toFixed(1)} mm`)}
      ${row("Posledných 24 h", `${m.recentRainMm24h.toFixed(1)} mm`)}
      ${row("Ďalších 6 h", `${m.upcomingRainMm6h.toFixed(1)} mm`)}
      ${row("Ďalších 12 h", `${m.upcomingRainMm12h.toFixed(1)} mm`)}
      ${row("Ďalších 24 h", `${m.upcomingRainMm24h.toFixed(1)} mm`)}
      ${row("Ďalší očakávaný dážď", nextRain)}
      ${row("Pravdepodobnosť zrážok (12 h)", prob12)}
      ${row("Pravdepodobnosť zrážok (24 h)", prob24)}
    </section>
  `;
}

function renderConditionsPanel(assessment: PaintingAssessment): string {
  const m = assessment.metrics;
  const row = (label: string, value: string, color?: string) =>
    `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value"${color ? ` style="color:${color}"` : ""}>${value}</span></div>`;

  const dewSpreadColor = m.dewPointSpreadC !== null ? colorForDewPointSpread(m.dewPointSpreadC) : undefined;
  const humidityColor = m.relativeHumidity !== null ? colorForHumidity(m.relativeHumidity) : undefined;

  const woodMoistureRow = assessment.manualWoodMoisture
    ? row("Vlhkosť dreva (nameraná)", `${assessment.manualWoodMoisture.percent.toFixed(0)} %`)
    : row("Vlhkosť dreva", "nemeraná");

  const terraceLabel =
    assessment.terraceDrying.status === "LIKELY_DRY"
      ? "Pravdepodobne suchá"
      : assessment.terraceDrying.status === "DRYING"
        ? "Vysychá"
        : "Pravdepodobne mokrá";

  return `
    <section class="card">
      <h2 class="panel-title">Aktuálne podmienky</h2>
      ${row("Teplota", m.temperatureC !== null ? `${m.temperatureC.toFixed(1)} °C` : "–")}
      ${row("Vlhkosť", m.relativeHumidity !== null ? `${m.relativeHumidity.toFixed(0)} %` : "–", humidityColor)}
      ${row("Rosný bod", m.dewPointC !== null ? `${m.dewPointC.toFixed(1)} °C` : "–")}
      ${row("T − Td", m.dewPointSpreadC !== null ? `${m.dewPointSpreadC >= 0 ? "+" : ""}${m.dewPointSpreadC.toFixed(1)} °C` : "–", dewSpreadColor)}
      ${row("Vietor", m.windSpeedKmh !== null ? `${m.windSpeedKmh.toFixed(0)} km/h` : "–")}
      ${row("Nárazy vetra", m.windGustKmh !== null ? `${m.windGustKmh.toFixed(0)} km/h` : "–")}
      <div class="drying-score">
        <div class="stat-row"><span class="stat-label">Potenciál vysychania</span><span class="stat-value">${m.dryingScore} / 100 — ${dryingScoreLabel(m.dryingScore)}</span></div>
        <div class="score-bar"><div class="score-bar-fill" style="width:${m.dryingScore}%;background:${statusColor(m.dryingScore >= 60 ? "GOOD" : m.dryingScore >= 35 ? "MARGINAL" : "BAD")}"></div></div>
      </div>
      ${row("Odhadovaný stav terasy", terraceLabel)}
      ${woodMoistureRow}
    </section>
  `;
}

function renderSunPanel(points: WeatherPoint[], nowMs: number): string {
  if (points.length === 0) return "";
  const sun = sunTimesForRange(nowMs, nowMs, LOCATION.latitude, LOCATION.longitude, LOCATION.timezone);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: LOCATION.timezone }).format(new Date(nowMs));
  const today = sun.get(todayKey);
  if (!today?.sunrise || !today?.sunset) return "";
  return `<p class="muted sun-line">🌅 Východ slnka ${formatHm(today.sunrise.getTime())} &nbsp;&nbsp; 🌇 Západ slnka ${formatHm(today.sunset.getTime())}</p>`;
}

function renderDisclaimer(): string {
  return `<p class="disclaimer">Ide len o odhad na základe meteorologických dát. Pred aplikáciou vždy overte, že je povrch dreva skutočne suchý - podľa možnosti meračom vlhkosti dreva. Presná akceptovateľná vlhkosť dreva závisí od konkrétneho náteru/moridla.</p>`;
}

function chartPanel(title: string, chart: ChartResult): string {
  return `
    <section class="card">
      <h2 class="chart-title">${esc(title)}</h2>
      ${chart.svg}
    </section>
  `;
}

export function renderDashboardHtml(points: WeatherPoint[], generatedAt: Date, assessment: PaintingAssessment): string {
  const stats = computeStats(points);
  const nowMs = generatedAt.getTime();
  const charts = buildWeatherCharts(points, nowMs, assessment.hourly, { interactive: true });
  const timeline = buildPaintingTimeline(assessment.hourly, nowMs, assessment.bestWindow);
  const script = [charts.precip.script, charts.temp.script, charts.humidity.script, charts.radiation.script].join("\n");

  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Zedlitzdorf 74 – maľovanie terasy</title>
<style>
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --muted: #898781;
    --gridline: #e1e0d9;
    --baseline: #c3c2b7;
    --critical: #d03b3b;
    --border: rgba(11,11,11,0.10);
    --series-precip: #2a78d6;
    --series-temp: #d9622a;
    --series-dewpoint: #8a5fb0;
    --series-radiation: #e0b430;
    --series-wind: #4d8790;
    --series-humidity: #3f9e89;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page: #0d0d0d;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --muted: #898781;
      --gridline: #2c2c2a;
      --baseline: #383835;
      --critical: #e66767;
      --border: rgba(255,255,255,0.10);
      --series-precip: #5b9be0;
      --series-temp: #e58a54;
      --series-dewpoint: #a983cf;
      --series-radiation: #e0b430;
      --series-wind: #6ea9b2;
      --series-humidity: #59baa4;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px 16px 64px;
  }
  .wrap { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  .muted { color: var(--text-secondary); font-size: 0.85rem; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin: 16px 0;
    position: relative;
  }
  .panel-title { font-size: 0.95rem; margin: 0 0 10px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .two-col { grid-template-columns: 1fr; } }
  .status-card { border: 2px solid var(--status-color); }
  .status-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .status-icon { font-size: 1.6rem; }
  .status-label { font-size: 1.25rem; font-weight: 700; color: var(--status-color); }
  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 8px; }
  .status-metric-label { font-size: 0.78rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
  .status-metric-value { font-size: 1.15rem; font-weight: 600; margin-top: 2px; }
  .reason-list { margin: 8px 0 0; padding-left: 20px; font-size: 0.88rem; }
  .reason-list li { margin: 3px 0; }
  .stat-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 0.9rem; border-bottom: 1px solid var(--border); }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { color: var(--text-secondary); }
  .stat-value { font-weight: 600; font-variant-numeric: tabular-nums; }
  .drying-score { margin-top: 8px; }
  .score-bar { height: 8px; border-radius: 4px; background: var(--gridline); overflow: hidden; margin-top: 4px; }
  .score-bar-fill { height: 100%; }
  .sun-line { margin: 4px 0 0; }
  .disclaimer { font-size: 0.78rem; color: var(--muted); margin-top: 20px; line-height: 1.4; }
  ${CHART_STYLES}
</style>
</head>
<body>
  <div class="wrap">
    <h1>Zedlitzdorf 74 – maľovanie terasy</h1>
    <p class="muted">${esc(LOCATION.name)} &middot; vygenerované ${esc(formatGeneratedAt(generatedAt))}</p>

    ${renderStatusCard(assessment)}

    <section class="card">
      <h2 class="panel-title">Časová os vhodnosti na maľovanie</h2>
      ${timeline}
    </section>

    <div class="two-col">
      ${renderRainPanel(assessment)}
      ${renderConditionsPanel(assessment)}
    </div>
    ${renderSunPanel(points, nowMs)}

    <h1 style="margin-top:32px;font-size:1.05rem;">Podrobná predpoveď počasia</h1>
    ${renderLegend()}
    ${chartPanel("Zrážky (mm)", charts.precip)}
    ${chartPanel("Teplota a rosný bod (°C)", charts.temp)}
    ${chartPanel("Relatívna vlhkosť (%)", charts.humidity)}
    ${chartPanel("Slnečné žiarenie (W/m²) a vietor (km/h)", charts.radiation)}
    <p class="muted">Súčet zrážok za celé okno: ${stats.totalPrecipMm.toFixed(1)} mm.</p>
    ${renderDisclaimer()}
  </div>
  <script>
    const CHART_DATA = {};
    ${script}
${HOVER_SCRIPT}
  </script>
</body>
</html>`;
}
