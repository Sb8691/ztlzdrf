import type { HourlyByModel, ModelId, WindowResult } from "./types.js";
import { aggregateInterval, type AggregatedPoint } from "./analyze.js";
import { LOCATION, WINDOW, ROLLING_WINDOW, RAIN_CHART_INTERVAL_HOURS } from "./config.js";

/** Fixed categorical order/colors match config.MODELS, per the dataviz palette (slots 1-5). */
const MODEL_LABELS: Record<ModelId, string> = {
  icon_seamless: "ICON (DWD)",
  gfs_seamless: "GFS (NOAA)",
  ecmwf_ifs025: "ECMWF",
  gem_seamless: "GEM (Kanada)",
  meteofrance_seamless: "Météo-France",
};

const MODEL_COLORS: Record<ModelId, { light: string; dark: string }> = {
  icon_seamless: { light: "#2a78d6", dark: "#3987e5" },
  gfs_seamless: { light: "#eb6834", dark: "#d95926" },
  ecmwf_ifs025: { light: "#1baf7a", dark: "#199e70" },
  gem_seamless: { light: "#eda100", dark: "#c98500" },
  meteofrance_seamless: { light: "#e87ba4", dark: "#d55181" },
};

const PHASE_BAND_LABELS: Record<string, string> = {
  "pred-schnutie": "pred maľovaním",
  malovanie: "maľovanie",
  schnutie: "schnutie",
};

const PHASE_PROSE: Record<string, string> = {
  "pred-schnutie": "pred maľovaním",
  malovanie: "počas maľovania",
  schnutie: "po maľovaní, počas schnutia",
};

const WEEKDAY_NAMES = ["nedeľu", "pondelok", "utorok", "stredu", "štvrtok", "piatok", "sobotu"];

const CHART_WIDTH = 900;
const CHART_HEIGHT = 260;
const MARGIN = { top: 30, right: 16, bottom: 34, left: 40 };
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

function formatCandidateHeading(candidateStart: string): string {
  const [datePart, timePart] = candidateStart.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `Na ${WEEKDAY_NAMES[weekday]} ${d}.${m}. o ${timePart.slice(0, 5)}`;
}

/** Formats an absolute instant in LOCATION.timezone (Europe/Vienna, same clock as Bratislava). */
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

export function summarize(result: WindowResult): string {
  if (result.ok) {
    return "Všetkých 5 modelov sa zhoduje: počas celého okna (pred maľovaním, počas aj po ňom) by nemalo pršať.";
  }

  const failingModels = new Set(result.failures.map((f) => f.model));
  const totalModels = result.perModel.length;
  const sentences: string[] = [];

  if (failingModels.size > 0) {
    const phaseCounts = new Map<string, number>();
    for (const f of result.failures) phaseCounts.set(f.phase, (phaseCounts.get(f.phase) ?? 0) + 1);
    const worstPhase = [...phaseCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const phaseText = worstPhase ? PHASE_PROSE[worstPhase] : "";
    sentences.push(
      `${failingModels.size} z ${totalModels} modelov hlási dážď${phaseText ? ", najmä " + phaseText : ""}.`
    );
  }

  const insufficientModels = result.perModel.filter((m) => !m.dry && m.hoursCovered < m.hoursExpected);
  if (insufficientModels.length > 0) {
    sentences.push(
      `Predpoveď zatiaľ nepokrýva celé okno pre: ${insufficientModels.map((m) => MODEL_LABELS[m.model]).join(", ")}.`
    );
  }

  return sentences.join(" ");
}

function niceTicks(max: number, count = 4): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push((max / count) * i);
  return ticks;
}

interface ChartBand {
  from: number;
  to: number;
  label: string;
}

interface ChartMarker {
  ms: number;
  label: string;
}

interface ChartOptions {
  yMax: number;
  showThreshold: boolean;
  decimals: number;
  unitSuffix: string;
  /** CSS custom property (e.g. "--metric-rain") used for the envelope band and median line. */
  colorVar: string;
  /** Also label the x-axis at this local HH:MM on every day (e.g. the candidate start hour). */
  highlightHour?: string;
  bands?: ChartBand[];
  markers?: ChartMarker[];
}

function buildChart(
  chartId: string,
  windowStartMs: number,
  windowEndMs: number,
  points: AggregatedPoint[],
  opts: ChartOptions
): { svg: string; script: string } {
  const span = windowEndMs - windowStartMs;

  const xScale = (ms: number) => MARGIN.left + ((ms - windowStartMs) / span) * PLOT_W;
  const yScale = (v: number) => MARGIN.top + PLOT_H - (v / opts.yMax) * PLOT_H;

  const bandRects = (opts.bands ?? [])
    .map((b, i) => {
      const x1 = xScale(Math.max(b.from, windowStartMs));
      const x2 = xScale(Math.min(b.to, windowEndMs));
      return `
        <rect x="${x1.toFixed(1)}" y="${MARGIN.top}" width="${Math.max(0, x2 - x1).toFixed(1)}" height="${PLOT_H}" class="phase-band phase-band-${i}" />
        <text x="${((x1 + x2) / 2).toFixed(1)}" y="${MARGIN.top - 10}" class="phase-label" text-anchor="middle">${esc(b.label)}</text>
      `;
    })
    .join("");

  const ticks = niceTicks(opts.yMax);
  const yGrid = ticks
    .map((v) => {
      const y = yScale(v);
      return `
        <line x1="${MARGIN.left}" y1="${y.toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y.toFixed(1)}" class="gridline" />
        <text x="${MARGIN.left - 8}" y="${(y + 3).toFixed(1)}" class="axis-label" text-anchor="end">${v.toFixed(opts.decimals)}</text>
      `;
    })
    .join("");

  const thresholdLine = opts.showThreshold
    ? (() => {
        const y = yScale(WINDOW.rainThresholdMm);
        return `
          <line x1="${MARGIN.left}" y1="${y.toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y.toFixed(1)}" class="threshold-line" />
          <text x="${CHART_WIDTH - MARGIN.right}" y="${(y - 4).toFixed(1)}" class="axis-label" text-anchor="end">prah ${WINDOW.rainThresholdMm} mm/h</text>
        `;
      })()
    : "";

  let lastDate = "";
  const xLabels: string[] = [];
  for (const p of points) {
    const { date, time } = formatLocal(p.time);
    if (date !== lastDate || (opts.highlightHour && time === opts.highlightHour)) {
      const x = xScale(p.ms);
      xLabels.push(
        `<text x="${x.toFixed(1)}" y="${CHART_HEIGHT - MARGIN.bottom + 16}" class="axis-label" text-anchor="middle">${esc(date)} ${esc(time)}</text>`
      );
      lastDate = date;
    }
  }

  const forward = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.ms).toFixed(1)} ${yScale(p.max).toFixed(1)}`).join(" ");
  const backward = [...points]
    .reverse()
    .map((p) => `L ${xScale(p.ms).toFixed(1)} ${yScale(p.min).toFixed(1)}`)
    .join(" ");
  const band =
    points.length > 0
      ? `<path d="${forward} ${backward} Z" class="envelope-band" style="fill: var(${opts.colorVar})" />`
      : "";
  const medianPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.ms).toFixed(1)} ${yScale(p.median).toFixed(1)}`)
    .join(" ");
  const medianLine = `<path d="${medianPath}" class="median-line" style="stroke: var(${opts.colorVar})" />`;

  const markerLines = (opts.markers ?? [])
    .map((mk) => {
      const x = xScale(mk.ms);
      return `
        <line x1="${x.toFixed(1)}" y1="${MARGIN.top}" x2="${x.toFixed(1)}" y2="${MARGIN.top + PLOT_H}" class="now-marker" />
        <text x="${x.toFixed(1)}" y="${MARGIN.top + 12}" class="now-marker-label" text-anchor="middle">${esc(mk.label)}</text>
      `;
    })
    .join("");

  const svg = `
    <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="Graf ${esc(chartId)}">
      ${bandRects}
      ${yGrid}
      ${thresholdLine}
      ${xLabels.join("")}
      ${band}
      ${medianLine}
      ${markerLines}
      <line class="crosshair" x1="0" y1="${MARGIN.top}" x2="0" y2="${MARGIN.top + PLOT_H}" data-chart="${chartId}" />
      <rect class="hover-capture" x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_W}" height="${PLOT_H}" data-chart="${chartId}" />
    </svg>
    <div class="tooltip" data-chart-tooltip="${chartId}"></div>
  `;

  const dataset = {
    colorVar: opts.colorVar,
    points: points.map((p) => ({
      x: Number(xScale(p.ms).toFixed(1)),
      label: `${formatLocal(p.time).date} ${formatLocal(p.time).time}`,
      minLabel: `${p.min.toFixed(opts.decimals)}${opts.unitSuffix}`,
      medianLabel: `${p.median.toFixed(opts.decimals)}${opts.unitSuffix}`,
      maxLabel: `${p.max.toFixed(opts.decimals)}${opts.unitSuffix}`,
    })),
  };

  const script = `CHART_DATA[${JSON.stringify(chartId)}] = ${JSON.stringify(dataset)};`;

  return { svg, script };
}

function renderCandidateCard(
  result: WindowResult,
  hourlyByModel: HourlyByModel,
  index: number
): { html: string; script: string } {
  const windowStartMs = new Date(result.windowStart).getTime();
  const windowEndMs = new Date(result.windowEnd).getTime();
  const startMs = new Date(result.candidateStart).getTime();
  const paintEndMs = startMs + WINDOW.paintHours * 3600_000;
  const highlightHour = formatLocal(result.candidateStart).time;
  const bands: ChartBand[] = [
    { from: windowStartMs, to: startMs, label: PHASE_BAND_LABELS["pred-schnutie"] },
    { from: startMs, to: paintEndMs, label: PHASE_BAND_LABELS.malovanie },
    { from: paintEndMs, to: windowEndMs, label: PHASE_BAND_LABELS.schnutie },
  ];

  const rainPoints = aggregateInterval(
    hourlyByModel,
    windowStartMs,
    windowEndMs,
    RAIN_CHART_INTERVAL_HOURS,
    (s, i) => s.precipitation[i]
  );
  const observedMaxMm = Math.max(0, ...rainPoints.map((p) => p.max));
  const rainChart = buildChart(`rain-${index}`, windowStartMs, windowEndMs, rainPoints, {
    yMax: Math.max(observedMaxMm * 1.25, 1),
    showThreshold: false,
    decimals: 1,
    unitSuffix: " mm",
    colorVar: "--metric-rain",
    highlightHour,
    bands,
  });

  const summaryRows = result.perModel
    .map(
      (m) => `
        <tr>
          <td><span class="legend-swatch" style="background: var(--series-${m.model})"></span>${esc(MODEL_LABELS[m.model])}</td>
          <td class="num">${m.maxHourlyMm.toFixed(2)}</td>
          <td class="num">${m.totalMm.toFixed(2)}</td>
          <td class="num">${m.hoursCovered}/${m.hoursExpected}</td>
          <td><span class="badge ${m.dry ? "badge-good" : "badge-critical"}">${m.dry ? "OK" : "ZLYHAL"}</span></td>
        </tr>`
    )
    .join("");

  const failureRows = result.failures
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(
      (f) => `
        <tr>
          <td>${esc(formatLocal(f.time).date)} ${esc(formatLocal(f.time).time)}</td>
          <td>${esc(MODEL_LABELS[f.model])}</td>
          <td>${esc(PHASE_BAND_LABELS[f.phase] ?? f.phase)}</td>
          <td class="num">${f.precipitationMm.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const html = `
    <section class="card">
      <div class="simple-row">
        <span class="simple-date">${esc(formatCandidateHeading(result.candidateStart))}</span>
        <span class="badge ${result.ok ? "badge-good" : "badge-critical"}">${result.ok ? "VHODNÉ" : "NEVHODNÉ"}</span>
      </div>
      <p class="reason">${esc(summarize(result))}</p>
      <details class="more-info">
        <summary>Viac info</summary>
        <p class="muted">Okno (pred-maľovaním + maľovanie + schnutie): ${esc(result.windowStart)} &ndash; ${esc(result.windowEnd)}</p>
        <p class="muted">Pás = rozptyl 5 modelov (min&ndash;max), čiara = medián.</p>
        <h3>Zrážky</h3>
        ${rainChart.svg}
        <table class="summary-table">
          <thead><tr><th>Model</th><th>Max mm/h</th><th>Súčet mm</th><th>Pokrytie</th><th>Stav</th></tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
        ${
          result.failures.length > 0
            ? `<details class="failures">
                 <summary>Dôvody zlyhania (${result.failures.length})</summary>
                 <table class="summary-table">
                   <thead><tr><th>Čas</th><th>Model</th><th>Fáza</th><th>mm/h</th></tr></thead>
                   <tbody>${failureRows}</tbody>
                 </table>
               </details>`
            : ""
        }
      </details>
    </section>
  `;

  return { html, script: rainChart.script };
}

/**
 * A rolling ±N-day view around "now" (independent of the weekend candidates), so the
 * user can eyeball recent rain (wet substrate) against upcoming rain (drying conditions
 * for the pine boards) and judge for themselves - not tied to the WINDOW rule.
 */
function renderRollingSection(hourlyByModel: HourlyByModel, models: ModelId[], now: Date): { html: string; script: string } {
  const nowMs = now.getTime();
  const windowStartMs = nowMs - ROLLING_WINDOW.pastDays * 24 * 3600_000;
  const windowEndMs = nowMs + ROLLING_WINDOW.aheadDays * 24 * 3600_000;
  const markers: ChartMarker[] = [{ ms: nowMs, label: "teraz" }];

  const rainPoints = aggregateInterval(
    hourlyByModel,
    windowStartMs,
    windowEndMs,
    RAIN_CHART_INTERVAL_HOURS,
    (s, i) => s.precipitation[i]
  );
  const observedMaxMm = Math.max(0, ...rainPoints.map((p) => p.max));
  const rainChart = buildChart("rolling-rain", windowStartMs, windowEndMs, rainPoints, {
    yMax: Math.max(observedMaxMm * 1.25, 1),
    showThreshold: false,
    decimals: 1,
    unitSuffix: " mm",
    colorVar: "--metric-rain",
    markers,
  });

  let maxPastRainMm = 0;
  let minFutureDryHours = Infinity;
  for (const model of models) {
    const series = hourlyByModel[model];
    let past = 0;
    let futureDry = 0;
    for (let i = 0; i < series.time.length; i++) {
      const t = new Date(series.time[i]).getTime();
      if (t < windowStartMs || t >= windowEndMs) continue;
      const mm = series.precipitation[i];
      if (mm === null) continue;
      if (t < nowMs) past += mm;
      else if (mm < WINDOW.rainThresholdMm) futureDry++;
    }
    maxPastRainMm = Math.max(maxPastRainMm, past);
    minFutureDryHours = Math.min(minFutureDryHours, futureDry);
  }
  if (!Number.isFinite(minFutureDryHours)) minFutureDryHours = 0;

  const html = `
    <section class="card">
      <h2 class="section-title">Dážď (posledné ${ROLLING_WINDOW.pastDays} / najbližšie ${ROLLING_WINDOW.aheadDays} dni)</h2>
      <p class="muted">
        Na vlastné posúdenie vlhkosti podkladu (borovicové dosky): koľko pršalo predtým a koľko
        suchých hodín je pred nami. Zvislá čiarkovaná čiara označuje "teraz".
      </p>
      <p class="muted">Pás = rozptyl 5 modelov (min&ndash;max), čiara = medián.</p>
      ${rainChart.svg}
      <p class="muted">
        Najviac zrážok spomedzi modelov za posledné ${ROLLING_WINDOW.pastDays} dni: ${maxPastRainMm.toFixed(1)} mm.
        Suché hodiny (pod prahom ${WINDOW.rainThresholdMm} mm/h) v najbližších ${ROLLING_WINDOW.aheadDays} dňoch
        podľa najprísnejšieho modelu: ${minFutureDryHours} h.
      </p>
    </section>
  `;

  return { html, script: rainChart.script };
}

export function renderDashboardHtml(
  hourlyByModel: HourlyByModel,
  results: WindowResult[],
  generatedAt: Date
): string {
  const models = Object.keys(hourlyByModel) as ModelId[];
  const rolling = renderRollingSection(hourlyByModel, models, generatedAt);
  const cards = results.map((r, i) => renderCandidateCard(r, hourlyByModel, i));
  const seriesVars = models.map((m) => `--series-${m}: ${MODEL_COLORS[m].light};`).join(" ");
  const seriesVarsDark = models.map((m) => `--series-${m}: ${MODEL_COLORS[m].dark};`).join(" ");

  const firstOk = results.find((r) => r.ok);
  const hero = firstOk
    ? `Najbližší vhodný víkend: ${formatCandidateHeading(firstOk.candidateStart)}`
    : "Momentálne nie je nájdené vhodné okno na najbližšie víkendy.";

  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Terasa – watchdog počasia</title>
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
    --good: #0ca30c;
    --critical: #d03b3b;
    --border: rgba(11,11,11,0.10);
    ${seriesVars}
    --metric-rain: var(--series-icon_seamless);
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
      --good: #0ca30c;
      --critical: #e66767;
      --border: rgba(255,255,255,0.10);
      ${seriesVarsDark}
      --metric-rain: var(--series-icon_seamless);
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
  .wrap { max-width: 1400px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin: 0 0 8px; }
  .hero { font-size: 1.15rem; font-weight: 600; margin: 0 0 20px; }
  .muted { color: var(--text-secondary); font-size: 0.85rem; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin: 16px 0;
    position: relative;
  }
  .simple-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .simple-date { font-size: 1.05rem; font-weight: 600; }
  .reason { margin: 8px 0 0; color: var(--text-secondary); font-size: 0.95rem; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .badge-good { color: var(--good); background: color-mix(in srgb, var(--good) 14%, transparent); }
  .badge-critical { color: var(--critical); background: color-mix(in srgb, var(--critical) 14%, transparent); }
  details.more-info { margin-top: 14px; border-top: 1px solid var(--gridline); padding-top: 10px; }
  details.more-info > summary { cursor: pointer; color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; }
  details.more-info h3 { font-size: 0.9rem; margin: 18px 0 4px; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .chart-svg { width: 100%; height: auto; overflow: visible; }
  .phase-band-0 { fill: var(--gridline); opacity: 0.35; }
  .phase-band-1 { fill: var(--gridline); opacity: 0.6; }
  .phase-band-2 { fill: var(--gridline); opacity: 0.35; }
  .phase-label { fill: var(--muted); font-size: 10px; }
  .gridline { stroke: var(--gridline); stroke-width: 1; }
  .axis-label { fill: var(--muted); font-size: 10px; }
  .threshold-line { stroke: var(--baseline); stroke-width: 1; stroke-dasharray: 4 3; }
  .now-marker { stroke: var(--critical); stroke-width: 1.5; stroke-dasharray: 3 3; opacity: 0.85; }
  .now-marker-label { fill: var(--critical); font-size: 10px; font-weight: 600; }
  .section-title { font-size: 1.05rem; margin: 0 0 4px; }
  .envelope-band { opacity: 0.18; }
  .median-line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .crosshair { stroke: var(--baseline); stroke-width: 1; opacity: 0; pointer-events: none; }
  .hover-capture { fill: transparent; cursor: crosshair; }
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
  .tooltip-line { width: 10px; height: 2px; display: inline-block; }
  .tooltip-value { font-weight: 600; }
  .summary-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }
  .summary-table th, .summary-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--gridline); }
  .summary-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  details.failures { margin-top: 12px; }
  details.failures summary { cursor: pointer; color: var(--text-secondary); font-size: 0.85rem; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Terasa – watchdog počasia</h1>
    <p class="hero">${esc(hero)}</p>
    <p class="muted">${esc(LOCATION.name)} &middot; vygenerované ${esc(formatGeneratedAt(generatedAt))}</p>
    ${rolling.html}
    ${cards.map((c) => c.html).join("")}
  </div>
  <script>
    const CHART_DATA = {};
    ${rolling.script}
    ${cards.map((c) => c.script).join("\n")}

    document.querySelectorAll(".hover-capture").forEach((rect) => {
      const chartId = rect.getAttribute("data-chart");
      const svg = rect.closest("svg");
      const crosshair = svg.querySelector(\`.crosshair[data-chart="\${chartId}"]\`);
      const tooltip = document.querySelector(\`[data-chart-tooltip="\${chartId}"]\`);
      const chart = CHART_DATA[chartId];
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
        const swatchColor = getComputedStyle(document.documentElement).getPropertyValue(chart.colorVar);
        for (const [rowLabel, valueLabel] of [["Min", point.minLabel], ["Medián", point.medianLabel], ["Max", point.maxLabel]]) {
          const row = document.createElement("div");
          row.className = "tooltip-row";
          const key = document.createElement("span");
          key.className = "tooltip-key";
          const line = document.createElement("span");
          line.className = "tooltip-line";
          line.style.background = swatchColor;
          key.appendChild(line);
          key.appendChild(document.createTextNode(rowLabel));
          const value = document.createElement("span");
          value.className = "tooltip-value";
          value.textContent = valueLabel;
          row.appendChild(key);
          row.appendChild(value);
          tooltip.appendChild(row);
        }

        const cardBox = rect.closest(".card").getBoundingClientRect();
        tooltip.style.display = "block";
        tooltip.style.left = (evt.clientX - cardBox.left + 12) + "px";
        tooltip.style.top = (evt.clientY - cardBox.top + 12) + "px";
      });

      rect.addEventListener("pointerleave", () => {
        crosshair.style.opacity = "0";
        tooltip.style.display = "none";
      });
    });
  </script>
</body>
</html>`;
}
