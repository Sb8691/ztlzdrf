import type { HourEvaluation, PaintingAssessment, PaintingStatus, WeatherPoint } from "./types.js";
import { LOCATION, DEW_POINT_SPREAD_DISPLAY_THRESHOLDS, HUMIDITY_DISPLAY_THRESHOLDS } from "./config.js";
import { dryingScoreLabel } from "./painting.js";
import { sunTimesForRange } from "./astronomy.js";
import {
  PALETTE,
  statusColor,
  CHART_WIDTH,
  CHART_HEIGHT,
  MARGIN,
  PLOT_H,
  PLOT_W,
  esc,
  niceTicks,
  buildLayout,
  renderNightShading,
  renderSuitabilityStrip,
  renderNowMarker,
  renderXAxisLabels,
  backgroundRect,
  interactiveLayer,
  buildTooltipScript,
  weatherPointLabel,
  tooltipDiv,
  chartPanel,
  stackChartsToPng,
  type ChartResult,
  type TooltipRow,
} from "./charts.js";
import { renderPageShell } from "./page.js";

// Kept as re-exports so the e-mail renderer (and anything else) keeps one presentation entry point.
export { statusColor, CHART_WIDTH, esc } from "./charts.js";

function statusLabel(status: PaintingStatus): string {
  return status === "GOOD" ? "DOBRÉ NA MAĽOVANIE" : status === "MARGINAL" ? "HRANIČNÉ PODMIENKY" : "NEMAĽOVAŤ";
}

function statusIcon(status: PaintingStatus): string {
  return status === "GOOD" ? "🟢" : status === "MARGINAL" ? "🟡" : "🔴";
}

function formatHm(ms: number): string {
  return new Intl.DateTimeFormat("sk-SK", { timeZone: LOCATION.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(ms)
  );
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
// The four weather charts (precip / temp+dewpoint / humidity / radiation+wind),
// each with its own real y-axis, all built from the shared primitives in
// charts.ts so they stay visually consistent.
// ---------------------------------------------------------------------------

interface ChartOptions {
  interactive: boolean;
  /** The dashed "teraz" marker; switched off when the whole window lies in the future (outlook). */
  showNow: boolean;
}

/** Precipitation chart: bars, its own left axis in mm. The one series never sharing a panel with
 * anything else, so it's never mistaken for a line or confused with another quantity. */
function buildPrecipChart(points: WeatherPoint[], nowMs: number, hourly: HourEvaluation[], opts: ChartOptions): ChartResult {
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
      ${renderXAxisLabels(layout, points)}
      ${bars}
      ${renderSuitabilityStrip(layout, hourly)}
      ${opts.showNow ? renderNowMarker(layout, nowMs) : ""}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${tooltipDiv(chartId, opts.interactive)}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, weatherPointLabel, (p) => {
    const rows: TooltipRow[] = [
      { label: "Zrážky", value: p.precipitationMm !== null ? `${p.precipitationMm.toFixed(1)} mm` : "–", color: PALETTE.precip },
    ];
    if (p.precipEnsemble) {
      rows.push({
        label: "Ensemble p50 / p90",
        value: `${p.precipEnsemble.p50.toFixed(1)} / ${p.precipEnsemble.p90.toFixed(1)} mm`,
        color: PALETTE.precip,
      });
    }
    return rows;
  });
  return { svg, script };
}

/** Temperature + dew point: the one legitimate shared-axis pair in this report, since both are °C
 * on the same physical scale - not a dual-axis chart, just two lines on one real axis. */
function buildTempDewPointChart(points: WeatherPoint[], nowMs: number, hourly: HourEvaluation[], opts: ChartOptions): ChartResult {
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
      ${renderXAxisLabels(layout, points)}
      ${dewLine}
      ${tempLine}
      ${renderSuitabilityStrip(layout, hourly)}
      ${opts.showNow ? renderNowMarker(layout, nowMs) : ""}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${tooltipDiv(chartId, opts.interactive)}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, weatherPointLabel, (p) => [
    { label: "Teplota", value: p.temperatureC !== null ? `${p.temperatureC.toFixed(1)} °C` : "–", color: PALETTE.temp },
    { label: "Rosný bod", value: p.dewPointC !== null ? `${p.dewPointC.toFixed(1)} °C` : "–", color: PALETTE.dewPoint },
  ]);
  return { svg, script };
}

/** Humidity: its own chart with a real 0-100% axis - previously humidity was folded into the
 * combined chart with no numbered scale at all, which made it impossible to read precisely. */
function buildHumidityChart(points: WeatherPoint[], nowMs: number, hourly: HourEvaluation[], opts: ChartOptions): ChartResult {
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
      ${renderXAxisLabels(layout, points)}
      ${area}
      ${line}
      ${renderSuitabilityStrip(layout, hourly)}
      ${opts.showNow ? renderNowMarker(layout, nowMs) : ""}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${tooltipDiv(chartId, opts.interactive)}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, weatherPointLabel, (p) => [
    { label: "Vlhkosť", value: p.humidityPct !== null ? `${p.humidityPct.toFixed(0)} %` : "–", color: PALETTE.humidity },
  ]);
  return { svg, script };
}

/** Solar radiation (real axis, W/m²) + wind speed as a secondary line on its own internal 0->max
 * scale (no numbered axis, avoiding a dual-axis chart) - the real value is always in the tooltip. */
function buildRadiationWindChart(points: WeatherPoint[], nowMs: number, hourly: HourEvaluation[], opts: ChartOptions): ChartResult {
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
      ${renderXAxisLabels(layout, points)}
      ${radiationArea}
      ${radiationLine}
      ${windLine}
      ${renderSuitabilityStrip(layout, hourly)}
      ${opts.showNow ? renderNowMarker(layout, nowMs) : ""}
      ${interactiveLayer(chartId, opts.interactive)}
    </svg>
    ${tooltipDiv(chartId, opts.interactive)}
  `;

  if (!opts.interactive) return { svg, script: "" };
  const script = buildTooltipScript(chartId, points, layout, weatherPointLabel, (p) => [
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

export const WEATHER_CHART_TITLES: Record<keyof WeatherCharts, string> = {
  precip: "Zrážky (mm)",
  temp: "Teplota a rosný bod (°C)",
  humidity: "Relatívna vlhkosť (%)",
  radiation: "Slnečné žiarenie (W/m²) a vietor (km/h)",
};

export const WEATHER_CHART_ORDER: (keyof WeatherCharts)[] = ["precip", "temp", "humidity", "radiation"];

export function buildWeatherCharts(
  points: WeatherPoint[],
  nowMs: number,
  hourly: HourEvaluation[],
  opts: { interactive?: boolean; showNow?: boolean } = {}
): WeatherCharts {
  const o: ChartOptions = { interactive: opts.interactive ?? true, showNow: opts.showNow ?? true };
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
export function buildPaintingTimeline(
  hourly: HourEvaluation[],
  nowMs: number,
  bestWindow: { startMs: number; endMs: number } | null,
  opts: { showNow?: boolean } = {}
): string {
  if (hourly.length === 0) return "";
  const height = 74;
  const barY = 30;
  const barH = 22;
  const layout = buildLayout(hourly);

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
  const nowMarker =
    opts.showNow === false
      ? ""
      : `<line x1="${nowX.toFixed(1)}" y1="${barY - 4}" x2="${nowX.toFixed(1)}" y2="${barY + barH + 4}" style="stroke:${PALETTE.critical};stroke-width:2" />`;

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

/** All four weather charts stacked into one PNG (see stackChartsToPng for why a hosted image). */
export function renderChartPng(points: WeatherPoint[], nowMs: number, hourly: HourEvaluation[]): Buffer {
  const charts = buildWeatherCharts(points, nowMs, hourly, { interactive: false });
  return stackChartsToPng(WEATHER_CHART_ORDER.map((key) => ({ title: WEATHER_CHART_TITLES[key], svg: charts[key].svg })));
}

export function renderLegend(): string {
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

export function renderDisclaimer(): string {
  return `<p class="disclaimer">Ide len o odhad na základe meteorologických dát. Pred aplikáciou vždy overte, že je povrch dreva skutočne suchý - podľa možnosti meračom vlhkosti dreva. Presná akceptovateľná vlhkosť dreva závisí od konkrétneho náteru/moridla.</p>`;
}

export function renderDashboardHtml(
  points: WeatherPoint[],
  generatedAt: Date,
  assessment: PaintingAssessment,
  opts: { outlookCardHtml?: string } = {}
): string {
  const stats = computeStats(points);
  const nowMs = generatedAt.getTime();
  const charts = buildWeatherCharts(points, nowMs, assessment.hourly, { interactive: true });
  const timeline = buildPaintingTimeline(assessment.hourly, nowMs, assessment.bestWindow);
  const scripts = [charts.precip.script, charts.temp.script, charts.humidity.script, charts.radiation.script];

  const body = `
    ${renderStatusCard(assessment)}
    ${opts.outlookCardHtml ?? ""}

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
    ${chartPanel(WEATHER_CHART_TITLES.precip, charts.precip)}
    ${chartPanel(WEATHER_CHART_TITLES.temp, charts.temp)}
    ${chartPanel(WEATHER_CHART_TITLES.humidity, charts.humidity)}
    ${chartPanel(WEATHER_CHART_TITLES.radiation, charts.radiation)}
    <p class="muted">Súčet zrážok za celé okno: ${stats.totalPrecipMm.toFixed(1)} mm.</p>
    ${renderDisclaimer()}
  `;

  return renderPageShell({
    title: "Zedlitzdorf 74 – maľovanie terasy",
    heading: "Zedlitzdorf 74 – maľovanie terasy",
    subtitle: `${esc(LOCATION.name)} &middot; vygenerované ${esc(formatGeneratedAt(generatedAt))}`,
    body,
    scripts,
  });
}
