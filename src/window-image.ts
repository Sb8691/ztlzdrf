import { CHART_HEIGHT, CHART_WIDTH, MARGIN, PLOT_H, buildLayoutForDomain, esc, rasterizeSvg, type Layout } from "./charts.js";
import { formatDayLabel } from "./time.js";
import { addDays, eachDate, localMidnightMs } from "./window-core.js";
import { LIGHT } from "./window-theme.js";
import type { WindowSnapshot } from "./window-data.js";

/**
 * The one image the e-mail carries: the window's suitability and rain, drawn from the same snapshot
 * as the page and in the page's own colours (src/window-theme.ts), so the mail reads as the same
 * thing rather than a second design.
 *
 * Published as docs/chart.png - Gmail strips inline <svg> and refuses `data:` URIs, so a hosted
 * image is the only way, and keeping the filename keeps the workflow's "wait until Pages serves it"
 * step working untouched. Everything is drawn shapes and text: the CI rasterizer has no emoji font.
 */

const TITLE_H = 26;

function domainOf(snapshot: WindowSnapshot): Layout {
  const cfg = snapshot.config;
  return buildLayoutForDomain(localMidnightMs(cfg.start, cfg.timezone), localMidnightMs(addDays(cfg.end, 1), cfg.timezone));
}

/** Day separators plus one centred day label - the page's decoration, same in both panels. */
function dayDecorations(snapshot: WindowSnapshot, layout: Layout): string {
  const cfg = snapshot.config;
  const bottom = MARGIN.top + PLOT_H;
  let out = "";
  for (const date of eachDate(cfg.start, cfg.end)) {
    const from = layout.xScale(localMidnightMs(date, cfg.timezone));
    const to = layout.xScale(localMidnightMs(addDays(date, 1), cfg.timezone));
    out += `<line x1="${from.toFixed(1)}" x2="${from.toFixed(1)}" y1="${MARGIN.top}" y2="${bottom}" style="stroke:${LIGHT.dayLine};stroke-width:1" />`;
    out += `<text x="${((from + to) / 2).toFixed(1)}" y="${bottom + 18}" text-anchor="middle" style="fill:${LIGHT.muted};font-size:12px">${esc(formatDayLabel(date))}</text>`;
  }
  const end = layout.xScale(layout.windowEndMs);
  out += `<line x1="${end.toFixed(1)}" x2="${end.toFixed(1)}" y1="${MARGIN.top}" y2="${bottom}" style="stroke:${LIGHT.dayLine};stroke-width:1" />`;
  return out;
}

function yGrid(ticks: number[], yOf: (v: number) => number, label: (v: number) => string, unit: string): string {
  const rows = ticks
    .map((t) => {
      const y = yOf(t);
      return (
        `<line x1="${MARGIN.left}" x2="${CHART_WIDTH - MARGIN.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:${LIGHT.grid};stroke-width:1" />` +
        `<text x="${MARGIN.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" style="fill:${LIGHT.muted};font-size:11px">${esc(label(t))}</text>`
      );
    })
    .join("");
  return `<text x="2" y="${MARGIN.top - 8}" style="fill:${LIGHT.muted};font-size:11px">${esc(unit)}</text>${rows}`;
}

function panel(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" width="${CHART_WIDTH}" height="${CHART_HEIGHT}">${inner}</svg>`;
}

/** Hourly suitability, with real gaps wherever a start could not be computed. */
export function buildScorePanel(snapshot: WindowSnapshot): string {
  const layout = domainOf(snapshot);
  const bottom = MARGIN.top + PLOT_H;
  const yOf = (pct: number) => bottom - (pct / 100) * PLOT_H;

  let line = "";
  let area = "";
  let run: { ms: number; score: number }[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const pts = run.map((p) => `${layout.xScale(p.ms).toFixed(1)} ${yOf(p.score).toFixed(1)}`);
      area +=
        `<path d="M ${layout.xScale(run[0].ms).toFixed(1)} ${bottom} L ${pts.join(" L ")} L ${layout.xScale(run[run.length - 1].ms).toFixed(1)} ${bottom} Z" ` +
        `style="fill:${LIGHT.score};fill-opacity:0.14" />`;
      line += `<path d="M ${pts.join(" L ")}" style="fill:none;stroke:${LIGHT.score};stroke-width:2;stroke-linejoin:round" />`;
    }
    run = [];
  };
  for (const s of snapshot.scores) {
    if (s.score === null) flush();
    else run.push({ ms: s.startMs, score: s.score });
  }
  flush();

  return panel(yGrid([0, 25, 50, 75, 100], yOf, (t) => String(t), "%") + dayDecorations(snapshot, layout) + area + line);
}

/** Six-hour totals on the window's shared scale - the same bars the page draws. */
export function buildRainPanel(snapshot: WindowSnapshot): string {
  const layout = domainOf(snapshot);
  const bottom = MARGIN.top + PLOT_H;
  const max = snapshot.precipAxisMax;
  const yOf = (mm: number) => bottom - (mm / max) * PLOT_H;

  let bars = "";
  for (const b of snapshot.buckets) {
    if (b.totalMm === null) continue;
    const x0 = layout.xScale(b.startMs);
    const width = Math.max(1, layout.xScale(b.endMs) - x0 - 3);
    const y = yOf(Math.min(b.totalMm, max));
    const height = bottom - y;
    if (height <= 0) continue;
    bars += `<rect x="${(x0 + 1.5).toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" style="fill:${b.complete ? LIGHT.rain : LIGHT.rainPartial}" />`;
  }

  const ticks = max <= 2 ? [0, max / 2, max] : [0, Math.round(max / 2), max];
  const label = (t: number) => t.toFixed(max <= 2 ? 1 : 0).replace(".", ",");
  return panel(yGrid(ticks, yOf, label, "mm / 6 h") + dayDecorations(snapshot, layout) + bars);
}

/** Two panels stacked into one image, titled the way the page titles its charts. */
function stack(panels: { title: string; svg: string }[]): string {
  let y = 0;
  const body = panels
    .map((p) => {
      const block =
        `<g transform="translate(0, ${y})">` +
        `<text x="${MARGIN.left}" y="17" style="fill:${LIGHT.text};font-size:14px;font-weight:600">${esc(p.title)}</text>` +
        `<g transform="translate(0, ${TITLE_H})">${p.svg}</g></g>`;
      y += TITLE_H + CHART_HEIGHT;
      return block;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${y}" width="${CHART_WIDTH}" height="${y}" ` +
    `style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
    `<rect x="0" y="0" width="${CHART_WIDTH}" height="${y}" style="fill:${LIGHT.surface}" />${body}</svg>`
  );
}

export function buildWindowImageSvg(snapshot: WindowSnapshot): string {
  return stack([
    { title: "Vhodnosť počasia pri začiatku náteru", svg: buildScorePanel(snapshot) },
    { title: "Dážď", svg: buildRainPanel(snapshot) },
  ]);
}

export function renderWindowPng(snapshot: WindowSnapshot): Buffer {
  return rasterizeSvg(buildWindowImageSvg(snapshot), CHART_WIDTH);
}

/** Text describing the picture for readers with images switched off. */
export function windowImageAlt(snapshot: WindowSnapshot): string {
  const cfg = snapshot.config;
  const days = snapshot.daily
    .map((d) => `${formatDayLabel(d.date)} ${d.totalMm === null ? "bez dát" : `${d.totalMm.toFixed(1).replace(".", ",")} mm`}`)
    .join(", ");
  return `Graf vhodnosti počasia a dažďa pre ${formatDayLabel(cfg.start)} až ${formatDayLabel(cfg.end)}. Denné úhrny: ${days}.`;
}
