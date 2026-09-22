import { Resvg } from "@resvg/resvg-js";
import type { HourEvaluation, PaintingStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Leaf module: the palette, geometry and SVG primitives every chart in the
// project is composed from (the four weather charts in dashboard.ts, the
// suitability timeline, and the forecast-evolution line charts of the outlook
// page). Nothing here knows about pages, e-mails or data sources, so it can be
// imported from anywhere without creating an import cycle.
// ---------------------------------------------------------------------------

/** Fixed hex palette used directly as inline SVG styles (not CSS vars), so the chart markup is
 * identical and self-contained whether it's embedded in the (theme-aware) dashboard page or
 * inlined into an e-mail with no shared stylesheet. */
export const PALETTE = {
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
  surface: "#ffffff",
  /** Outlook (forecast-evolution) series. Categorical identity colors, validated together with
   * `precip` for colour-vision-deficiency separation on both light and dark surfaces - keep the
   * set as is; a status colour is never reused for a series. */
  probPaintable: "#9b3d8a",
  modelAifs: "#d9622a",
  modelGefs: "#1f9c7a",
};

export function statusColor(status: PaintingStatus): string {
  return status === "GOOD" ? PALETTE.statusGood : status === "MARGINAL" ? PALETTE.statusMarginal : PALETTE.statusBad;
}

export const CHART_WIDTH = 900;
export const CHART_HEIGHT = 210;
export const MARGIN = { top: 22, right: 50, bottom: 32, left: 46 };
export const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
export const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
export const STRIP_H = 7;

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Splits a local "YYYY-MM-DDTHH:mm" label into display parts ("14.07.", "13:00"). */
export function formatLocal(t: string): { date: string; time: string } {
  const [datePart, timePart] = t.split("T");
  const [, m, d] = datePart.split("-");
  return { date: `${d}.${m}.`, time: timePart.slice(0, 5) };
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(min + ((max - min) / count) * i);
  return ticks;
}

// ---------------------------------------------------------------------------
// Shared chart scaffolding: every chart is built from the same layout
// primitives so they stay visually consistent - same x-axis, same night
// shading, same suitability strip, same hover/tooltip wiring - without forcing
// them onto one shared (and therefore necessarily compromised) y-scale.
// ---------------------------------------------------------------------------

export interface Layout {
  windowStartMs: number;
  windowEndMs: number;
  xScale: (ms: number) => number;
}

/** Linear x-scale over the first..last item; only `ms` is needed, so any time-indexed series
 * (weather points, hour evaluations, model runs) can drive it. */
export function buildLayout(items: { ms: number }[]): Layout {
  const windowStartMs = items[0]?.ms ?? 0;
  const windowEndMs = items[items.length - 1]?.ms ?? windowStartMs + 1;
  return buildLayoutForDomain(windowStartMs, windowEndMs);
}

export function buildLayoutForDomain(windowStartMs: number, windowEndMs: number): Layout {
  const span = Math.max(1, windowEndMs - windowStartMs);
  return { windowStartMs, windowEndMs, xScale: (ms) => MARGIN.left + ((ms - windowStartMs) / span) * PLOT_W };
}

/** Shades contiguous night runs (from the painting engine's own isDaylight per hour, so the chart
 * always agrees with the decision logic about what counts as "dark") across the full plot height. */
export function renderNightShading(layout: Layout, hourly: HourEvaluation[]): string {
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
export function renderSuitabilityStrip(layout: Layout, hourly: HourEvaluation[]): string {
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

export function renderNowMarker(layout: Layout, nowMs: number): string {
  const x = layout.xScale(nowMs);
  return `
    <line x1="${x.toFixed(1)}" y1="${MARGIN.top}" x2="${x.toFixed(1)}" y2="${MARGIN.top + PLOT_H}" style="stroke:${PALETTE.critical};stroke-width:1.5;stroke-dasharray:3 3;opacity:0.85" />
    <text x="${x.toFixed(1)}" y="${MARGIN.top - 6}" style="fill:${PALETTE.critical};font-size:10px;font-weight:600" text-anchor="middle">teraz</text>
  `;
}

export const MIN_LABEL_GAP_PX = 60;

/** Date/time labels at local midnight and noon (plus the window start), thinned so they never
 * overlap. Items need the local `time` label string alongside `ms`. */
export function renderXAxisLabels(layout: Layout, items: { ms: number; time: string }[]): string {
  const xLabels: string[] = [];
  let lastLabelX = -Infinity;
  for (const p of items) {
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

export interface TooltipRow {
  label: string;
  value: string;
  color: string;
}

export interface ChartResult {
  svg: string;
  script: string;
}

export function backgroundRect(interactive: boolean): string {
  return !interactive ? `<rect x="0" y="0" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" style="fill:${PALETTE.surface}" />` : "";
}

export function interactiveLayer(chartId: string, interactive: boolean): string {
  return interactive
    ? `
      <line class="crosshair" x1="0" y1="${MARGIN.top}" x2="0" y2="${MARGIN.top + PLOT_H}" data-chart="${chartId}" />
      <rect class="hover-capture" x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_W}" height="${PLOT_H}" data-chart="${chartId}" />
    `
    : "";
}

/** Emits the per-chart hover dataset consumed by HOVER_SCRIPT: one entry per item with its x
 * position, a heading label and the rows to show. Generic over any `ms`-keyed item. */
export function buildTooltipScript<T extends { ms: number }>(
  chartId: string,
  items: T[],
  layout: Layout,
  labelFor: (item: T) => string,
  rowsFor: (item: T) => TooltipRow[]
): string {
  const dataset = {
    points: items.map((p) => ({
      x: Number(layout.xScale(p.ms).toFixed(1)),
      label: labelFor(p),
      rows: rowsFor(p),
    })),
  };
  return `CHART_DATA[${JSON.stringify(chartId)}] = ${JSON.stringify(dataset)};`;
}

export function weatherPointLabel(p: { time: string }): string {
  const { date, time } = formatLocal(p.time);
  return `${date} ${time}`;
}

export function tooltipDiv(chartId: string, interactive: boolean): string {
  return interactive ? `<div class="tooltip" data-chart-tooltip="${chartId}" style="display:none"></div>` : "";
}

export function chartPanel(title: string, chart: ChartResult): string {
  return `
    <section class="card">
      <h2 class="chart-title">${esc(title)}</h2>
      ${chart.svg}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Generic line chart (forecast evolution): several series over an arbitrary
// x domain (here: model run times), one real y axis, optional threshold
// guides, markers with a surface ring so overlapping points stay legible.
// ---------------------------------------------------------------------------

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  /** Stroke width, default 2. */
  width?: number;
  /** SVG dash pattern, e.g. "5 4"; solid when omitted. */
  dash?: string;
  /** Marker radius in px (>= 4 keeps the mark at least 8px wide); 0 disables markers. Default 4. */
  markerR?: number;
  points: { ms: number; y: number | null }[];
}

export interface LineChartSpec {
  chartId: string;
  ariaLabel: string;
  xDomain: [number, number];
  xTicks: { ms: number; label: string }[];
  yDomain: [number, number];
  yTicks: number[];
  yFormat: (v: number) => string;
  series: LineSeries[];
  /** Horizontal reference lines (thresholds), dashed so they read as thresholds, not grid. */
  guides?: { y: number; label: string }[];
  /** Hover dataset: one entry per distinct x across all series. */
  tooltip?: { labelFor: (ms: number) => string; rowsFor: (ms: number) => TooltipRow[] };
  interactive: boolean;
}

export function buildLineChart(spec: LineChartSpec): ChartResult {
  let [x0, x1] = spec.xDomain;
  if (x1 <= x0) {
    // A single run so far: pad the domain so the lone marker sits mid-plot instead of on the edge.
    x0 -= 6 * 3600_000;
    x1 += 6 * 3600_000;
  }
  const layout = buildLayoutForDomain(x0, x1);
  const [y0, y1] = spec.yDomain;
  const y = (v: number) => MARGIN.top + PLOT_H - ((v - y0) / Math.max(1e-9, y1 - y0)) * PLOT_H;

  const grid = spec.yTicks
    .map(
      (v) => `
        <line x1="${MARGIN.left}" y1="${y(v).toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y(v).toFixed(1)}" style="stroke:${PALETTE.gridline};stroke-width:1" />
        <text x="${MARGIN.left - 8}" y="${(y(v) + 3).toFixed(1)}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="end">${esc(spec.yFormat(v))}</text>
      `
    )
    .join("");

  let lastLabelX = -Infinity;
  const xLabels: string[] = [];
  for (const tick of spec.xTicks) {
    const x = layout.xScale(tick.ms);
    if (x - lastLabelX < MIN_LABEL_GAP_PX) continue;
    xLabels.push(
      `<text x="${x.toFixed(1)}" y="${CHART_HEIGHT - MARGIN.bottom + 24}" style="fill:${PALETTE.axis};font-size:10px" text-anchor="middle">${esc(tick.label)}</text>`
    );
    lastLabelX = x;
  }

  const guides = (spec.guides ?? [])
    .map(
      (g) => `
        <line x1="${MARGIN.left}" y1="${y(g.y).toFixed(1)}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y(g.y).toFixed(1)}" style="stroke:${PALETTE.axis};stroke-width:1;stroke-dasharray:4 4;opacity:0.7" />
        <text x="${CHART_WIDTH - MARGIN.right + 6}" y="${(y(g.y) + 3).toFixed(1)}" style="fill:${PALETTE.axis};font-size:10px">${esc(g.label)}</text>
      `
    )
    .join("");

  const ringStyle = spec.interactive ? `class="chart-marker"` : `style="stroke:${PALETTE.surface};stroke-width:2"`;
  const seriesSvg = spec.series
    .map((s) => {
      const width = s.width ?? 2;
      const markerR = s.markerR ?? 4;
      let d = "";
      let open = false;
      for (const p of s.points) {
        if (p.y === null) {
          open = false;
          continue;
        }
        d += `${open ? "L" : "M"} ${layout.xScale(p.ms).toFixed(1)} ${y(p.y).toFixed(1)} `;
        open = true;
      }
      const dash = s.dash ? `stroke-dasharray:${s.dash};` : "";
      const path = d
        ? `<path d="${d.trim()}" style="fill:none;stroke:${s.color};stroke-width:${width};${dash}stroke-linecap:round;stroke-linejoin:round" />`
        : "";
      const markers =
        markerR > 0
          ? s.points
              .filter((p) => p.y !== null)
              .map(
                (p) =>
                  `<circle cx="${layout.xScale(p.ms).toFixed(1)}" cy="${y(p.y as number).toFixed(1)}" r="${markerR}" fill="${s.color}" ${ringStyle} />`
              )
              .join("")
          : "";
      return path + markers;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" class="chart-svg" role="img" aria-label="${esc(spec.ariaLabel)}">
      ${backgroundRect(spec.interactive)}
      ${grid}
      ${xLabels.join("")}
      ${guides}
      ${seriesSvg}
      ${interactiveLayer(spec.chartId, spec.interactive)}
    </svg>
    ${tooltipDiv(spec.chartId, spec.interactive)}
  `;

  if (!spec.interactive || !spec.tooltip) return { svg, script: "" };
  const xs = [...new Set(spec.series.flatMap((s) => s.points.map((p) => p.ms)))].sort((a, b) => a - b).map((ms) => ({ ms }));
  const { labelFor, rowsFor } = spec.tooltip;
  const script = buildTooltipScript(spec.chartId, xs, layout, (x) => labelFor(x.ms), (x) => rowsFor(x.ms));
  return { svg, script };
}

// ---------------------------------------------------------------------------
// Chance sparkline (plain layer of the outlook): one value per calendar day on
// a 0..10 scale, drawn over three faint status bands so the *position* says
// "áno / neisté / nie" and the colour is only redundant. No axis, no ticks -
// the first and last dates and the newest value are labelled directly.
// ---------------------------------------------------------------------------

export interface SparkPoint {
  /** Short x label, shown only for the first and the last point ("22.9.", "dnes"). */
  label: string;
  /** 0..10 */
  value: number;
  status: PaintingStatus;
  /** Marks a change of the model behind the numbers (thin vertical guide at this point). */
  changed?: boolean;
}

export interface SparklineSpec {
  ariaLabel: string;
  points: SparkPoint[];
  /** Band edges in the same 0..10 units: >= good is the top band, >= marginal the middle one. */
  thresholds: { good: number; marginal: number };
  /** Direct label of the newest point, e.g. "6 z 10". */
  valueLabel: string;
  bandLabels?: { good: string; marginal: string; bad: string };
  /** Inline (page: CSS classes, theme aware) vs. rasterized (fixed hex colours). */
  inline: boolean;
  width?: number;
  height?: number;
}

/** Sized for a day card in the four-column grid (~200 CSS px of content width), so the 9-10 px
 * labels render about 1:1 there and only grow on narrower layouts where the card is wider. */
export const SPARK_WIDTH = 200;
export const SPARK_HEIGHT = 64;

export function buildChanceSparkline(spec: SparklineSpec): string {
  const W = spec.width ?? SPARK_WIDTH;
  const H = spec.height ?? SPARK_HEIGHT;
  const m = { left: 4, right: 38, top: 12, bottom: 13 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const y = (v: number) => m.top + (1 - Math.max(0, Math.min(10, v)) / 10) * plotH;
  const n = spec.points.length;
  const x = (i: number) => (n <= 1 ? m.left + plotW / 2 : m.left + (i * plotW) / (n - 1));
  const labels = spec.bandLabels ?? { good: "áno", marginal: "neisté", bad: "nie" };
  const inline = spec.inline;

  // Theme-aware classes on the page (bands brighten in dark mode, see CHART_STYLES), fixed hex in the PNG.
  const labelStyle = inline ? `class="spark-label"` : `style="fill:${PALETTE.axis}"`;
  const bands = [
    { from: 10, to: spec.thresholds.good, color: PALETTE.statusGood, label: labels.good },
    { from: spec.thresholds.good, to: spec.thresholds.marginal, color: PALETTE.statusMarginal, label: labels.marginal },
    { from: spec.thresholds.marginal, to: 0, color: PALETTE.statusBad, label: labels.bad },
  ]
    .map((b) => {
      const top = y(b.from);
      const h = y(b.to) - top;
      const rectAttrs = inline ? `class="spark-band" fill="${b.color}"` : `style="fill:${b.color};opacity:0.12"`;
      return (
        `<rect x="${m.left}" y="${top.toFixed(1)}" width="${plotW}" height="${h.toFixed(1)}" ${rectAttrs} />` +
        `<text x="${W - m.right + 6}" y="${(top + h / 2 + 3).toFixed(1)}" ${labelStyle} font-size="10">${esc(b.label)}</text>`
      );
    })
    .join("");

  const pts = spec.points.map((p, i) => ({ ...p, cx: x(i), cy: y(p.value) }));
  const path =
    pts.length > 1
      ? `<path d="${pts.map((p, i) => `${i ? "L" : "M"} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(" ")}"${inline ? ` class="spark-line"` : ""} style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round${inline ? "" : `;stroke:${PALETTE.axis}`}" />`
      : "";

  const guides = pts
    .filter((p) => p.changed)
    .map(
      (p) =>
        `<line x1="${p.cx.toFixed(1)}" y1="${m.top}" x2="${p.cx.toFixed(1)}" y2="${m.top + plotH}"${inline ? ` class="spark-guide"` : ""} style="stroke-width:1;stroke-dasharray:2 2;opacity:0.7${inline ? "" : `;stroke:${PALETTE.axis}`}" />`
    )
    .join("");

  // Only the newest point is a real mark; earlier days get a tiny dot while there are few of them
  // and none once the series is long, so the line - not a string of beads - carries the shape.
  const dots = pts
    .map((p, i) => {
      if (i === n - 1) {
        const ring = inline ? `class="chart-marker"` : `style="stroke:${PALETTE.surface};stroke-width:2"`;
        return `<circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="5" fill="${statusColor(p.status)}" ${ring} />`;
      }
      if (n > 8) return "";
      return `<circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="1.5" ${inline ? `class="spark-dot"` : `fill="${PALETTE.axis}"`} />`;
    })
    .join("");

  let valueLabel = "";
  let dateLabels = "";
  if (n > 0) {
    const last = pts[n - 1];
    const above = last.cy - 9 >= 9;
    const vy = above ? last.cy - 9 : last.cy + 16;
    // Left of the newest dot, so it never runs into the band labels right of the plot; a surface
    // halo (paint-order) keeps it legible where the line or an earlier dot passes underneath.
    const anchor = n <= 1 ? "middle" : "end";
    const vx = n <= 1 ? last.cx : last.cx - 3;
    const valueStyle = inline
      ? `class="spark-value"`
      : `style="fill:#22201b" paint-order="stroke" stroke="${PALETTE.surface}" stroke-width="3" stroke-linejoin="round"`;
    valueLabel = `<text x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" text-anchor="${anchor}" ${valueStyle} font-size="11" font-weight="700">${esc(spec.valueLabel)}</text>`;
    const first = pts[0];
    dateLabels =
      n <= 1
        ? `<text x="${last.cx.toFixed(1)}" y="${H - 3}" text-anchor="middle" ${labelStyle} font-size="9">${esc(last.label)}</text>`
        : `<text x="${first.cx.toFixed(1)}" y="${H - 3}" text-anchor="start" ${labelStyle} font-size="9">${esc(first.label)}</text>` +
          `<text x="${last.cx.toFixed(1)}" y="${H - 3}" text-anchor="end" ${labelStyle} font-size="9">${esc(last.label)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="spark-svg" role="img" aria-label="${esc(spec.ariaLabel)}">${bands}${guides}${path}${dots}${valueLabel}${dateLabels}</svg>`;
}

/** In-SVG legend row (for rasterized output, where no HTML legend exists). Returns the markup and
 * its height so callers can stack it. */
export function buildSvgLegend(items: { label: string; color: string; dash?: string }[]): { svg: string; height: number } {
  const rowH = 20;
  const charW = 6.2; // average glyph width at 11px - only used to wrap rows, so an estimate is fine
  const gap = 22;
  const maxX = CHART_WIDTH - MARGIN.right;
  let x = MARGIN.left;
  let row = 0;
  const parts: string[] = [];
  for (const item of items) {
    const width = 24 + item.label.length * charW;
    if (x > MARGIN.left && x + width > maxX) {
      row++;
      x = MARGIN.left;
    }
    const y = row * rowH + rowH / 2;
    const dash = item.dash ? `stroke-dasharray:${item.dash};` : "";
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x + 18}" y2="${y}" style="stroke:${item.color};stroke-width:2.5;${dash}stroke-linecap:round" />`,
      `<text x="${x + 24}" y="${y + 4}" style="fill:#52514e;font-size:11px">${esc(item.label)}</text>`
    );
    x += width + gap;
  }
  return { svg: `<g>${parts.join("")}</g>`, height: (row + 1) * rowH + 6 };
}

/**
 * Rasterizes chart panels stacked into one tall PNG for e-mail/docs publishing - Gmail and most
 * mail clients strip inline <svg> and refuse `data:` image URIs, so a single hosted image is the
 * only reliable way to show charts in the e-mail. Panels stay visually split (own scales/titles)
 * even though they ship as one file.
 */
export function stackChartsToPng(
  panels: { title: string; svg: string; height?: number }[],
  opts: { scale?: number; header?: { svg: string; height: number } } = {}
): Buffer {
  const titleH = 22;
  const headerH = opts.header?.height ?? 0;
  let yCursor = headerH;
  const rendered = panels
    .map((panel) => {
      const y = yCursor;
      yCursor += titleH + (panel.height ?? CHART_HEIGHT);
      return `
        <g transform="translate(0, ${y})">
          <text x="${MARGIN.left}" y="16" style="fill:#22201b;font-size:13px;font-weight:600">${esc(panel.title)}</text>
          <g transform="translate(0, ${titleH})">${panel.svg}</g>
        </g>
      `;
    })
    .join("");
  const totalHeight = yCursor;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${totalHeight}" width="${CHART_WIDTH}" height="${totalHeight}">
      <rect x="0" y="0" width="${CHART_WIDTH}" height="${totalHeight}" style="fill:${PALETTE.surface}" />
      ${opts.header ? opts.header.svg : ""}
      ${rendered}
    </svg>
  `;
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CHART_WIDTH * (opts.scale ?? 2) } });
  return resvg.render().asPng();
}

export const HOVER_SCRIPT = `
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

export const CHART_STYLES = `
  .chart-svg { width: 100%; height: auto; overflow: visible; }
  .chart-title { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin: 0 0 4px; }
  .chart-marker { stroke: var(--surface-1); stroke-width: 2; }
  .spark-svg { width: 100%; height: auto; display: block; overflow: visible; }
  .spark-band { opacity: 0.12; }
  @media (prefers-color-scheme: dark) { .spark-band { opacity: 0.22; } }
  .spark-guide { stroke: var(--baseline); }
  .spark-line { stroke: var(--text-secondary); }
  .spark-dot { fill: var(--text-secondary); }
  .spark-label { fill: var(--text-secondary); }
  .spark-value { fill: var(--text-primary); paint-order: stroke; stroke: var(--surface-1); stroke-width: 3px; stroke-linejoin: round; }
  .crosshair { stroke: var(--baseline); stroke-width: 1; opacity: 0; pointer-events: none; }
  .hover-capture { fill: transparent; cursor: crosshair; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0 4px; font-size: 0.85rem; color: var(--text-secondary); }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .legend-line { width: 18px; height: 0; border-top: 3px solid currentColor; display: inline-block; border-radius: 2px; }
  .legend-line-dashed { border-top-style: dashed; }
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
    max-width: 240px;
  }
  .tooltip-time { color: var(--text-secondary); margin-bottom: 4px; }
  .tooltip-row { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
  .tooltip-key { display: inline-flex; align-items: center; gap: 5px; color: var(--text-secondary); }
  .tooltip-value { font-weight: 600; }
`;
