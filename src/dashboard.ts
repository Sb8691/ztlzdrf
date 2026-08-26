import type { WeatherPoint } from "./types.js";
import { LOCATION } from "./config.js";

/** Fixed hex palette used directly as inline SVG styles (not CSS vars), so the chart markup is
 * identical and self-contained whether it's embedded in the (theme-aware) dashboard page or
 * inlined into an e-mail with no shared stylesheet. */
const PALETTE = {
  precip: "#2a78d6",
  temp: "#d9622a",
  radiation: "#e0b430",
  humidity: "#1f9e89",
  gridline: "#d8d6cd",
  axis: "#8a8880",
  critical: "#d03b3b",
};

const CHART_WIDTH = 900;
const CHART_HEIGHT = 320;
const MARGIN = { top: 30, right: 44, bottom: 34, left: 44 };
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatLocal(t: string): { date: string; time: string } {
  const [datePart, timePart] = t.split("T");
  const [, m, d] = datePart.split("-");
  return { date: `${d}.${m}.`, time: timePart.slice(0, 5) };
}

/** Formats an absolute instant in LOCATION.timezone (Europe/Vienna). */
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

/**
 * One combined chart: precipitation bars (left axis, mm), temperature line (right axis, °C), and
 * two more series without their own numbered axis (to avoid a 4-axis chart) - radiation/"sunlight"
 * as a soft filled area on its own internal 0->max(W/m²) scale, and humidity as a dashed line on a
 * fixed 0-100% scale (both mapped to the same plot height). Real values for both are still always
 * available via the hover tooltip.
 */
export function buildWeatherChart(
  points: WeatherPoint[],
  nowMs: number,
  opts: { interactive?: boolean } = {}
): { svg: string; script: string } {
  const interactive = opts.interactive ?? true;
  const chartId = "weather";
  if (points.length === 0) {
    return { svg: `<p class="muted">Žiadne dáta na zobrazenie.</p>`, script: "" };
  }

  const windowStartMs = points[0].ms;
  const windowEndMs = points[points.length - 1].ms;
  const span = Math.max(1, windowEndMs - windowStartMs);

  const xScale = (ms: number) => MARGIN.left + ((ms - windowStartMs) / span) * PLOT_W;

  const precipValues = points.map((p) => p.precipitationMm).filter((v): v is number => v !== null);
  const precipMax = Math.max(1, ...precipValues, 0) * 1.25;
  const yPrecip = (mm: number) => MARGIN.top + PLOT_H - (mm / precipMax) * PLOT_H;

  const tempValues = points.map((p) => p.temperatureC).filter((v): v is number => v !== null);
  const tempMin = tempValues.length > 0 ? Math.min(...tempValues) - 2 : 0;
  const tempMax = tempValues.length > 0 ? Math.max(...tempValues) + 2 : 1;
  const yTemp = (c: number) => MARGIN.top + PLOT_H - ((c - tempMin) / (tempMax - tempMin)) * PLOT_H;

  const radiationValues = points.map((p) => p.radiationWm2).filter((v): v is number => v !== null);
  const radiationMax = Math.max(50, ...radiationValues, 0);
  const yRadiation = (w: number) => MARGIN.top + PLOT_H - (w / radiationMax) * PLOT_H;

  // Humidity is always 0-100%, so it maps directly to the plot height with no observed-max lookup.
  const yHumidity = (pct: number) => MARGIN.top + PLOT_H - (pct / 100) * PLOT_H;

  // Bar width: span between consecutive points (fall back to 1h) so gaps in data don't widen bars.
  const stepMs = points.length > 1 ? points[1].ms - points[0].ms : 3600_000;
  const barW = Math.max(2, (stepMs / span) * PLOT_W * 0.7);

  const bars = points
    .filter((p) => p.precipitationMm !== null && p.precipitationMm > 0)
    .map((p) => {
      const x = xScale(p.ms) - barW / 2;
      const y = yPrecip(p.precipitationMm!);
      const h = MARGIN.top + PLOT_H - y;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" style="fill:${PALETTE.precip};opacity:0.85" />`;
    })
    .join("");

  const radiationPath = points
    .filter((p) => p.radiationWm2 !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.ms).toFixed(1)} ${yRadiation(p.radiationWm2!).toFixed(1)}`)
    .join(" ");
  const radiationFloorY = MARGIN.top + PLOT_H;
  const radiationArea = radiationPath
    ? `<path d="${radiationPath} L ${xScale(points[points.length - 1].ms).toFixed(1)} ${radiationFloorY} L ${xScale(points[0].ms).toFixed(1)} ${radiationFloorY} Z" style="fill:${PALETTE.radiation};opacity:0.12" />`
    : "";
  const radiationLine = radiationPath
    ? `<path d="${radiationPath}" style="fill:none;stroke:${PALETTE.radiation};stroke-width:1.5;stroke-linecap:round" />`
    : "";

  const tempPath = points
    .filter((p) => p.temperatureC !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.ms).toFixed(1)} ${yTemp(p.temperatureC!).toFixed(1)}`)
    .join(" ");
  const tempLine = tempPath
    ? `<path d="${tempPath}" style="fill:none;stroke:${PALETTE.temp};stroke-width:2;stroke-linecap:round;stroke-linejoin:round" />`
    : "";

  const humidityPath = points
    .filter((p) => p.humidityPct !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.ms).toFixed(1)} ${yHumidity(p.humidityPct!).toFixed(1)}`)
    .join(" ");
  const humidityLine = humidityPath
    ? `<path d="${humidityPath}" style="fill:none;stroke:${PALETTE.humidity};stroke-width:1.5;stroke-dasharray:4 3;stroke-linecap:round" />`
    : "";

  const precipTicks = niceTicks(0, precipMax, 4);
  const precipGrid = precipTicks
    .map((v) => {
      const y = yPrecip(v);
      return `
        <line x1="${MARGIN.left}" y1="${y.toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y.toFixed(1)}" style="stroke:${PALETTE.gridline};stroke-width:1" />
        <text x="${MARGIN.left - 8}" y="${(y + 3).toFixed(1)}" style="fill:${PALETTE.precip};font-size:10px" text-anchor="end">${v.toFixed(1)}</text>
      `;
    })
    .join("");

  const tempTicks = niceTicks(tempMin, tempMax, 4);
  const tempAxis = tempTicks
    .map((v) => {
      const y = yTemp(v);
      return `<text x="${CHART_WIDTH - MARGIN.right + 8}" y="${(y + 3).toFixed(1)}" style="fill:${PALETTE.temp};font-size:10px" text-anchor="start">${v.toFixed(0)}°</text>`;
    })
    .join("");

  // Greedily skip any candidate tick whose label would sit too close to the previous one
  // (e.g. the window's start point landing right next to a 00:00 tick) to avoid overlap.
  const MIN_LABEL_GAP_PX = 60;
  const xLabels: string[] = [];
  let lastLabelX = -Infinity;
  for (const p of points) {
    const { date, time } = formatLocal(p.time);
    if (time === "00:00" || time === "12:00" || p.ms === windowStartMs) {
      const x = xScale(p.ms);
      if (x - lastLabelX < MIN_LABEL_GAP_PX) continue;
      xLabels.push(
        `<text x="${x.toFixed(1)}" y="${CHART_HEIGHT - MARGIN.bottom + 16}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="middle">${esc(date)} ${esc(time)}</text>`
      );
      lastLabelX = x;
    }
  }

  const nowX = xScale(nowMs);
  const nowMarker = `
    <line x1="${nowX.toFixed(1)}" y1="${MARGIN.top}" x2="${nowX.toFixed(1)}" y2="${MARGIN.top + PLOT_H}" style="stroke:${PALETTE.critical};stroke-width:1.5;stroke-dasharray:3 3;opacity:0.85" />
    <text x="${nowX.toFixed(1)}" y="${MARGIN.top + 12}" style="fill:${PALETTE.critical};font-size:10px;font-weight:600" text-anchor="middle">teraz</text>
  `;

  const interactiveLayer = interactive
    ? `
      <line class="crosshair" x1="0" y1="${MARGIN.top}" x2="0" y2="${MARGIN.top + PLOT_H}" data-chart="${chartId}" />
      <rect class="hover-capture" x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_W}" height="${PLOT_H}" data-chart="${chartId}" />
    `
    : "";

  const svg = `
    <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="Graf predpovede počasia">
      ${precipGrid}
      ${xLabels.join("")}
      ${radiationArea}
      ${bars}
      ${radiationLine}
      ${humidityLine}
      ${tempLine}
      ${tempAxis}
      ${nowMarker}
      ${interactiveLayer}
    </svg>
    ${interactive ? `<div class="tooltip" data-chart-tooltip="${chartId}" style="display:none"></div>` : ""}
  `;

  if (!interactive) return { svg, script: "" };

  const dataset = {
    points: points.map((p) => ({
      x: Number(xScale(p.ms).toFixed(1)),
      label: `${formatLocal(p.time).date} ${formatLocal(p.time).time}`,
      precipLabel: p.precipitationMm !== null ? `${p.precipitationMm.toFixed(1)} mm` : "–",
      tempLabel: p.temperatureC !== null ? `${p.temperatureC.toFixed(1)} °C` : "–",
      radiationLabel: p.radiationWm2 !== null ? `${p.radiationWm2.toFixed(0)} W/m²` : "–",
      humidityLabel: p.humidityPct !== null ? `${p.humidityPct.toFixed(0)} %` : "–",
    })),
  };

  const script = `CHART_DATA[${JSON.stringify(chartId)}] = ${JSON.stringify(dataset)};`;

  return { svg, script };
}

function renderLegend(): string {
  return `
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch legend-swatch-precip"></span>Zrážky (mm)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-temp"></span>Teplota (°C)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-radiation"></span>Slnečné žiarenie (W/m²)</span>
      <span class="legend-item"><span class="legend-swatch legend-swatch-humidity"></span>Vlhkosť (%)</span>
    </div>
  `;
}

function renderStatsLine(stats: WeatherStats): string {
  const tempPart =
    stats.minTempC !== null && stats.maxTempC !== null
      ? `teplota ${stats.minTempC.toFixed(1)}–${stats.maxTempC.toFixed(1)} °C`
      : "teplota bez dát";
  const humidityPart =
    stats.avgHumidityPct !== null ? `priemerná vlhkosť ${stats.avgHumidityPct.toFixed(0)} %` : "vlhkosť bez dát";
  return `<p class="muted">Súčet zrážok za celé okno: ${stats.totalPrecipMm.toFixed(1)} mm &middot; ${tempPart} &middot; ${humidityPart}.</p>`;
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
        for (const [rowLabel, valueLabel, swatchClass] of [
          ["Zrážky", point.precipLabel, "legend-swatch-precip"],
          ["Teplota", point.tempLabel, "legend-swatch-temp"],
          ["Slnko", point.radiationLabel, "legend-swatch-radiation"],
          ["Vlhkosť", point.humidityLabel, "legend-swatch-humidity"],
        ]) {
          const row = document.createElement("div");
          row.className = "tooltip-row";
          const key = document.createElement("span");
          key.className = "tooltip-key";
          const swatch = document.createElement("span");
          swatch.className = "legend-swatch " + swatchClass;
          key.appendChild(swatch);
          key.appendChild(document.createTextNode(rowLabel));
          const value = document.createElement("span");
          value.className = "tooltip-value";
          value.textContent = valueLabel;
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
  .crosshair { stroke: var(--baseline); stroke-width: 1; opacity: 0; pointer-events: none; }
  .hover-capture { fill: transparent; cursor: crosshair; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0 4px; font-size: 0.85rem; color: var(--text-secondary); }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .legend-swatch-precip { background: var(--series-precip); }
  .legend-swatch-temp { background: var(--series-temp); }
  .legend-swatch-radiation { background: var(--series-radiation); }
  .legend-swatch-humidity { background: var(--series-humidity); }
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

export function renderDashboardHtml(points: WeatherPoint[], generatedAt: Date): string {
  const stats = computeStats(points);
  const chart = buildWeatherChart(points, generatedAt.getTime());

  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Zedlitzdorf 74 – predpoveď počasia</title>
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
    --series-radiation: #e0b430;
    --series-humidity: #1f9e89;
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
      --series-radiation: #e0b430;
      --series-humidity: #3fc2ab;
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
  ${CHART_STYLES}
</style>
</head>
<body>
  <div class="wrap">
    <h1>Zedlitzdorf 74 – predpoveď počasia</h1>
    <p class="muted">${esc(LOCATION.name)} &middot; vygenerované ${esc(formatGeneratedAt(generatedAt))}</p>
    <section class="card">
      ${renderLegend()}
      ${chart.svg}
      ${renderStatsLine(stats)}
    </section>
  </div>
  <script>
    const CHART_DATA = {};
    ${chart.script}
${HOVER_SCRIPT}
  </script>
</body>
</html>`;
}
