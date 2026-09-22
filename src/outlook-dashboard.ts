import type { HourEvaluation, OutlookDigest, OutlookDigestDay, OutlookHistory, OutlookRunEntry, WeatherPoint } from "./types.js";
import { LOCATION, type OutlookConfig, type OutlookModel } from "./config.js";
import { createHash } from "node:crypto";
import {
  PALETTE,
  buildChanceSparkline,
  buildLineChart,
  chartPanel,
  esc,
  rasterizeSvg,
  statusColor,
  weatherGlyphSvg,
  type ChartResult,
  type LineSeries,
  type SparkPoint,
  type TooltipRow,
} from "./charts.js";
import { renderPageShell } from "./page.js";
import { buildWeatherCharts, buildPaintingTimeline, renderLegend, renderDisclaimer, WEATHER_CHART_ORDER, WEATHER_CHART_TITLES } from "./dashboard.js";
import { daysBetween, formatDayLabel, formatRunLabel, formatRunTick, formatShortDate, localDateOf, localMidnightMs } from "./time.js";
import { latestRunFor, pct, primaryModel, runsOf, statusIcon, statusLabelSk, trendArrow, windowDates } from "./outlook-core.js";
import { LEGEND_SHORT, PAST_WORDS, chanceOf10, horizonSentence, howToRead, plainContext, plainDays, type PlainDay } from "./outlook-plain.js";

/*
 * Outlook page (docs/outlook.html), its e-mail PNG (docs/outlook.png), the link card on the main
 * dashboard and the block inside the daily e-mail. The page has two layers: the plain one on top
 * (four day cards a non-technical reader understands in a few seconds - see outlook-plain.ts) and,
 * folded under one <details>, everything technical: member shares, how the forecast evolved run by
 * run, the table of runs and the latest run's ensemble meteogram.
 */

export interface LatestRunView {
  model: OutlookModel;
  runAtMs: number;
  members: number;
  median: WeatherPoint[];
  consensus: HourEvaluation[];
}

const MODEL_COLORS: Record<string, string> = {
  ecmwf_aifs025: PALETTE.modelAifs,
  gfs05: PALETTE.modelGefs,
};

interface SeriesStyle {
  color: string;
  width: number;
  dash?: string;
  markerR: number;
}

function secondaryStyle(model: OutlookModel): SeriesStyle {
  return { color: MODEL_COLORS[model.id] ?? PALETTE.probPaintable, width: 1.5, dash: MODEL_COLORS[model.id] ? "2 3" : "1 3", markerR: 3 };
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

function shortDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${d}.${m}.`;
}

function windowLabel(window: { start: string; end: string }, withYear = true): string {
  const [ys, ms, ds] = window.start.split("-").map(Number);
  const [ye, me, de] = window.end.split("-").map(Number);
  const year = withYear ? String(ye) : "";
  if (ys === ye && ms === me) return `${ds}.–${de}.${me}.${year}`;
  return `${ds}.${ms}.–${de}.${me}.${year}`;
}

function runLabel(runAt: string): string {
  return formatRunLabel(Date.parse(runAt), LOCATION.timezone);
}

// ---------------------------------------------------------------------------
// Plain layer: four day cards + one "how to read" line
// ---------------------------------------------------------------------------

/** The day's chance, one point per calendar day, over the three status bands. Inline on the page
 * (theme-aware classes), fixed colours in the PNG. */
function sparklineFor(day: PlainDay, cfg: OutlookConfig, inline: boolean, size?: { width: number; height: number }): string {
  const snaps = day.snapshots;
  const points: SparkPoint[] = snaps.map((s, i) => ({
    label: i === snaps.length - 1 ? "dnes" : formatShortDate(s.date),
    value: s.pPaintable * 10,
    status: s.status,
    changed: i > 0 && s.model !== snaps[i - 1].model,
  }));
  const last = snaps[snaps.length - 1];
  return buildChanceSparkline({
    ariaLabel: `Ako sa menila šanca – ${day.dayLabel}: ${snaps.map((s) => `${chanceOf10(s.pPaintable)} z 10`).join(", ")}`,
    points,
    thresholds: { good: cfg.dayStatus.good * 10, marginal: cfg.dayStatus.marginal * 10 },
    valueLabel: last ? `${chanceOf10(last.pPaintable)} z 10` : "",
    inline,
    width: size?.width,
    height: size?.height,
  });
}

function renderPlainCard(day: PlainDay, cfg: OutlookConfig): string {
  // role="group": a plain <div> may not carry an aria-label (generic role), a group may - the
  // sentence becomes the group's name and the visible children stay readable.
  if (day.past) {
    return `
    <div class="plain-card past" role="group" style="--status-color:${statusColor(day.status)}" aria-label="${esc(day.sentence)}">
      <div class="plain-day">${esc(day.dayLabel)}</div>
      <div class="plain-verdict">${PAST_WORDS}</div>
    </div>`;
  }
  const trendClass = day.trendDirection === "up" ? "trend-up" : day.trendDirection === "down" ? "trend-down" : "";
  return `
    <div class="plain-card" role="group" style="--status-color:${statusColor(day.status)}" aria-label="${esc(day.sentence)}">
      <div class="plain-day">${esc(day.dayLabel)}</div>
      <div class="plain-verdict"><span aria-hidden="true">${day.icon}</span><span>${esc(day.verdict)}</span></div>
      <div class="plain-weather"><span aria-hidden="true">${day.glyphEmoji}</span> ${esc(day.weather)} &middot; ${esc(day.temp)}</div>
      <div class="plain-chance">${esc(day.chance)}</div>
      <div class="plain-trend">${day.trendArrow ? `<span class="${trendClass}" aria-hidden="true">${day.trendArrow}</span> ` : ""}${esc(day.trend)}</div>
      <div class="plain-spark">${sparklineFor(day, cfg, true)}</div>
    </div>`;
}

export function renderPlainSection(digest: OutlookDigest, cfg: OutlookConfig): string {
  const days = plainDays(digest, cfg);
  return `
    <section class="card">
      <h2 class="panel-title">Maľovanie terasy ${esc(windowLabel(digest.window, false))} – deň po dni</h2>
      <div class="plain-grid">
        ${days.map((d) => renderPlainCard(d, cfg)).join("")}
      </div>
      <p class="how-to-read">${esc(howToRead(plainContext(digest)))}</p>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Forecast-evolution charts (one panel per target day)
// ---------------------------------------------------------------------------

export interface EvolutionPanel {
  date: string;
  title: string;
  chart: ChartResult;
}

function legendItems(history: OutlookHistory, cfg: OutlookConfig): { label: string; color: string; dash?: string }[] {
  const primary = primaryModel(cfg);
  const items = [
    { label: `Maľovateľný deň (≥ ${cfg.minGoodHours} h GOOD) – ${primary.label}`, color: PALETTE.probPaintable },
    { label: `Aspoň hraničný deň – ${primary.label}`, color: PALETTE.probPaintable, dash: "5 4" },
    { label: `Dážď ≥ ${cfg.rainDayThresholdMm} mm – ${primary.label}`, color: PALETTE.precip },
  ];
  for (const model of cfg.models) {
    if (model.primary || runsOf(history, model.id).length === 0) continue;
    const style = secondaryStyle(model);
    items.push({ label: `Maľovateľný deň – ${model.label}`, color: style.color, dash: style.dash });
  }
  return items;
}

export function buildEvolutionPanels(history: OutlookHistory, cfg: OutlookConfig, opts: { interactive: boolean }): EvolutionPanel[] {
  if (history.runs.length === 0) return [];
  const primary = primaryModel(cfg);
  const runMs = history.runs.map((r) => Date.parse(r.runAt));
  const firstRunMs = Math.min(...runMs);
  const lastRunMs = Math.max(...runMs);
  const windowStartMs = localMidnightMs(history.window.start, LOCATION.timezone);
  const xDomain: [number, number] = [firstRunMs, Math.max(windowStartMs, lastRunMs)];

  const distinctRuns = [...new Set(runMs)].sort((a, b) => a - b);
  const xTicks = distinctRuns.map((ms) => ({ ms, label: formatRunTick(ms) }));
  if (windowStartMs > lastRunMs) xTicks.push({ ms: windowStartMs, label: `${shortDate(history.window.start)} 00:00` });

  const byModel = new Map<string, OutlookRunEntry[]>();
  for (const model of cfg.models) byModel.set(model.id, runsOf(history, model.id));

  const pointsFor = (runs: OutlookRunEntry[], date: string, pick: (d: NonNullable<OutlookRunEntry["days"][number]>) => number) =>
    runs.map((r) => {
      const day = r.days.find((d) => d.date === date);
      return { ms: Date.parse(r.runAt), y: day ? Math.round(pick(day) * 100) : null };
    });

  return windowDates(history.window).map((date) => {
    const primaryRuns = byModel.get(primary.id) ?? [];
    const series: LineSeries[] = [
      {
        id: "paintable",
        label: `Maľovateľný deň – ${primary.label}`,
        color: PALETTE.probPaintable,
        width: 2.5,
        markerR: 4,
        points: pointsFor(primaryRuns, date, (d) => d.pPaintable),
      },
      {
        id: "possible",
        label: `Aspoň hraničný deň – ${primary.label}`,
        color: PALETTE.probPaintable,
        width: 1.5,
        dash: "5 4",
        markerR: 3,
        points: pointsFor(primaryRuns, date, (d) => d.pPossible),
      },
      {
        id: "rain",
        label: `Dážď ≥ ${cfg.rainDayThresholdMm} mm – ${primary.label}`,
        color: PALETTE.precip,
        width: 2,
        markerR: 4,
        points: pointsFor(primaryRuns, date, (d) => d.pRain),
      },
    ];
    for (const model of cfg.models) {
      const runs = byModel.get(model.id) ?? [];
      if (model.primary || runs.length === 0) continue;
      const style = secondaryStyle(model);
      series.push({
        id: `model-${model.id}`,
        label: `Maľovateľný deň – ${model.label}`,
        ...style,
        points: pointsFor(runs, date, (d) => d.pPaintable),
      });
    }

    const rowsFor = (ms: number): TooltipRow[] => {
      const rows: TooltipRow[] = [];
      for (const model of cfg.models) {
        const run = (byModel.get(model.id) ?? []).find((r) => Date.parse(r.runAt) === ms);
        const day = run?.days.find((d) => d.date === date);
        if (!run || !day) continue;
        if (model.primary) {
          rows.push(
            { label: "Maľovateľný deň", value: pct(day.pPaintable), color: PALETTE.probPaintable },
            { label: "Aspoň hraničný", value: pct(day.pPossible), color: PALETTE.probPaintable },
            { label: `Dážď ≥ ${cfg.rainDayThresholdMm} mm`, value: pct(day.pRain), color: PALETTE.precip },
            { label: "Zrážky p50 (p10–p90)", value: `${day.precip.p50.toFixed(1)} (${day.precip.p10.toFixed(1)}–${day.precip.p90.toFixed(1)}) mm`, color: PALETTE.precip },
            { label: "Tmax / Tmin p50", value: `${day.tMax.p50.toFixed(1)} / ${day.tMin.p50.toFixed(1)} °C`, color: PALETTE.temp },
            { label: "GOOD okno p50", value: `${day.goodRun.p50.toFixed(1)} h`, color: PALETTE.probPaintable },
            { label: "Členov", value: String(day.n), color: PALETTE.axis }
          );
        } else {
          rows.push({ label: `Maľovateľný – ${model.label}`, value: pct(day.pPaintable), color: secondaryStyle(model).color });
        }
      }
      return rows;
    };

    const chart = buildLineChart({
      chartId: `evo-${date}`,
      ariaLabel: `Vývoj predpovede pre ${formatDayLabel(date)}`,
      xDomain,
      xTicks,
      yDomain: [0, 100],
      yTicks: [0, 25, 50, 75, 100],
      yFormat: (v) => `${v} %`,
      series,
      guides: [
        { y: cfg.dayStatus.good * 100, label: `${Math.round(cfg.dayStatus.good * 100)} %` },
        { y: cfg.dayStatus.marginal * 100, label: `${Math.round(cfg.dayStatus.marginal * 100)} %` },
      ],
      tooltip: { labelFor: (ms) => `Beh ${formatRunLabel(ms, LOCATION.timezone)}`, rowsFor },
      interactive: opts.interactive,
    });
    return { date, title: `${formatDayLabel(date)} – pravdepodobnosti (%)`, chart };
  });
}

function renderEvolutionLegend(history: OutlookHistory, cfg: OutlookConfig): string {
  const items = legendItems(history, cfg)
    .map(
      (item) =>
        `<span class="legend-item"><span class="legend-line${item.dash ? " legend-line-dashed" : ""}" style="color:${item.color}"></span>${esc(item.label)}</span>`
    )
    .join("");
  return `<div class="legend">${items}</div>`;
}

// ---------------------------------------------------------------------------
// Day cards, table view, meteogram
// ---------------------------------------------------------------------------

function renderDayCard(day: OutlookDigestDay, cfg: OutlookConfig): string {
  const color = statusColor(day.status);
  const trend = day.trend
    ? `<div class="day-card-trend"><span class="${day.trend.direction === "up" ? "trend-up" : day.trend.direction === "down" ? "trend-down" : ""}">${trendArrow(day.trend)} ${day.trend.deltaPct >= 0 ? "+" : ""}${day.trend.deltaPct} p. b.</span> za 24 h</div>`
    : `<div class="day-card-trend">trend po ďalšom behu</div>`;
  const row = (label: string, value: string) => `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  const models = day.byModel.map((m) => `${esc(m.label.replace("ECMWF ", ""))} ${pct(m.pPaintable)}`).join(" · ");
  return `
    <div class="day-card" style="--status-color:${color}">
      <div class="day-card-date">${esc(formatDayLabel(day.date))}</div>
      <div class="day-card-status">${statusIcon(day.status)} ${esc(statusLabelSk(day.status))}</div>
      <div class="day-card-prob">${pct(day.pPaintable)}<small>maľovateľný deň</small></div>
      ${trend}
      ${row("Aspoň hraničný deň", pct(day.pPossible))}
      ${row(`Dážď ≥ ${cfg.rainDayThresholdMm} mm`, pct(day.pRain))}
      ${row("Zrážky p50 / p90", `${day.precipP50.toFixed(1)} / ${day.precipP90.toFixed(1)} mm`)}
      ${row("Tmax / Tmin", `${day.tMaxP50.toFixed(0)} / ${day.tMinP50.toFixed(0)} °C`)}
      ${row("GOOD okno (medián)", `${day.goodRunP50.toFixed(1)} h`)}
      ${row("Modely", models || "–")}
    </div>
  `;
}

function renderHistoryTable(history: OutlookHistory, cfg: OutlookConfig): string {
  const primary = primaryModel(cfg);
  const rows = runsOf(history, primary.id)
    .slice()
    .reverse()
    .flatMap((run) =>
      run.days.map(
        (d) => `
          <tr>
            <td>${esc(runLabel(run.runAt))}</td>
            <td>${esc(shortDate(d.date))}</td>
            <td>${pct(d.pPaintable)}</td>
            <td>${pct(d.pPossible)}</td>
            <td>${pct(d.pRain)}</td>
            <td>${d.precip.p50.toFixed(1)} (${d.precip.p10.toFixed(1)}–${d.precip.p90.toFixed(1)})</td>
            <td>${d.tMax.p50.toFixed(1)}</td>
            <td>${d.tMin.p50.toFixed(1)}</td>
            <td>${d.goodRun.p50.toFixed(1)}</td>
            <td>${d.n}</td>
          </tr>`
      )
    )
    .join("");
  return `
    <details class="card">
      <summary>Tabuľka všetkých behov ${esc(primary.label)} (${runsOf(history, primary.id).length})</summary>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Beh</th><th>Deň</th><th>Maľovateľný</th><th>Aspoň hraničný</th><th>Dážď ≥ ${cfg.rainDayThresholdMm} mm</th><th>Zrážky p50 (p10–p90) mm</th><th>Tmax p50</th><th>Tmin p50</th><th>GOOD okno p50 h</th><th>Členov</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  `;
}

function renderMeteogram(latest: LatestRunView, generatedAt: Date): { html: string; scripts: string[] } {
  const nowMs = generatedAt.getTime();
  const charts = buildWeatherCharts(latest.median, nowMs, latest.consensus, { interactive: true, showNow: false });
  const timeline = buildPaintingTimeline(latest.consensus, nowMs, null, { showNow: false });
  const html = `
    <h2 class="panel-title" style="margin-top:32px;font-size:1.05rem;">Posledný beh ${esc(latest.model.label)} v okne – mediánový scenár</h2>
    <p class="muted">Beh ${esc(formatRunLabel(latest.runAtMs, LOCATION.timezone))}, ${latest.members} členov. Čiary sú mediány členov po hodinách (zrážky: priemer členov, v tooltipe aj p50/p90); farebný pás je konsenzus členov o vhodnosti danej hodiny. Hodinové hodnoty sú interpolované z 3–6 h krokov modelu, preto ide o orientačný priebeh, nie presný rozvrh.</p>
    <section class="card">
      <h2 class="panel-title">Konsenzus vhodnosti po hodinách</h2>
      ${timeline}
    </section>
    ${renderLegend()}
    ${WEATHER_CHART_ORDER.map((key) => chartPanel(WEATHER_CHART_TITLES[key], charts[key])).join("")}
  `;
  return { html, scripts: WEATHER_CHART_ORDER.map((key) => charts[key].script) };
}

function renderOutlookDisclaimer(cfg: OutlookConfig): string {
  return `<p class="disclaimer">Strednodobý výhľad (dni až týždne dopredu) má nízku spoľahlivosť: sleduj trend a zhodu modelov, nie jednotlivé čísla. Pravdepodobnosti sú podiely členov ensemblu, ktorým vyšlo aspoň ${cfg.minGoodHours} h súvisle vhodných podmienok podľa rovnakých pravidiel ako denné rozhodnutie (teplota, vlhkosť, rosný bod, vietor, 12 h sucha pred a 12 h bez dažďa po). Globálne modely majú rozlíšenie ~25 km – teplota je prepočítaná na 1055 m n. m., zrážky a vlhkosť v alpskom údolí ostávajú hrubé. Keď sa okno dostane do horizontu +60 h, rozhoduje hlavný dashboard (AROME/INCA).</p>`;
}

/** Everything technical, folded under one <details>: latest runs, member-share day cards, the
 * run-by-run evolution charts with their table, the meteogram and the technical disclaimer. */
function renderTechnicalDetails(
  history: OutlookHistory,
  digest: OutlookDigest | null,
  latest: LatestRunView | null,
  generatedAt: Date,
  cfg: OutlookConfig
): { html: string; scripts: string[] } {
  const primary = primaryModel(cfg);
  const runsLine = cfg.models
    .map((m) => {
      const run = latestRunFor(history, m.id);
      return run ? `${esc(m.label)}: beh ${esc(runLabel(run.runAt))}, ${run.members} členov` : null;
    })
    .filter((x): x is string => x !== null)
    .join(" &middot; ");

  let inner = runsLine ? `<p class="muted">${runsLine}</p>` : "";
  const scripts: string[] = [];

  if (digest) {
    inner += `
      <section class="card">
        <h2 class="panel-title">Verdikt po dňoch (${esc(primary.label)}, beh ${esc(runLabel(digest.latestRunAt))})</h2>
        <div class="outlook-grid">
          ${digest.days.map((d) => renderDayCard(d, cfg)).join("")}
        </div>
        <p class="muted" style="margin:12px 0 0;">🟢 ≥ ${Math.round(cfg.dayStatus.good * 100)} % členov s maľovateľným dňom &middot; 🟡 ≥ ${Math.round(cfg.dayStatus.marginal * 100)} % (alebo ≥ ${Math.round(cfg.dayStatus.possibleMarginal * 100)} % s aspoň hraničným dňom) &middot; 🔴 menej. Trend porovnáva s behom spred aspoň ${cfg.trend.minAgeHours} h.</p>
      </section>
    `;
  }

  const panels = buildEvolutionPanels(history, cfg, { interactive: true });
  if (panels.length > 0) {
    inner += `
      <h2 class="panel-title" style="margin-top:24px;font-size:1.05rem;">Ako sa predpoveď vyvíja beh po behu</h2>
      <p class="muted">Každý bod je jeden beh modelu (os x = čas behu, os y = podiel členov ensemblu). Stabilne vysoká alebo rastúca čiara je dobrá správa; skoky medzi behmi znamenajú, že model ešte nemá jasno.</p>
      ${renderEvolutionLegend(history, cfg)}
      ${panels.map((p) => chartPanel(p.title, p.chart)).join("")}
      ${renderHistoryTable(history, cfg)}
    `;
    scripts.push(...panels.map((p) => p.chart.script));
  }

  if (latest) {
    const meteogram = renderMeteogram(latest, generatedAt);
    inner += meteogram.html;
    scripts.push(...meteogram.scripts);
  }

  if (inner.trim() === "") return { html: "", scripts };
  inner += renderOutlookDisclaimer(cfg);
  return {
    html: `
    <details class="technical">
      <summary>Podrobnosti pre technika – pravdepodobnosti, vývoj po behoch, tabuľka a meteogram</summary>
      ${inner}
    </details>
  `,
    scripts,
  };
}

export function renderOutlookHtml(
  history: OutlookHistory,
  digest: OutlookDigest | null,
  latest: LatestRunView | null,
  generatedAt: Date,
  cfg: OutlookConfig
): string {
  const title = `Dá sa maľovať ${windowLabel(history.window)}?`;
  let body = `<p class="muted"><a href="index.html">← Späť na dnešné rozhodnutie</a></p>`;
  const scripts: string[] = [];

  if (!digest) {
    const over = daysBetween(localDateOf(generatedAt.getTime(), LOCATION.timezone), history.window.end) < 0;
    body += over
      ? `
      <section class="card">
        <h2 class="panel-title">Okno maľovania ${esc(windowLabel(history.window, false))} už uplynulo</h2>
        <p class="muted">Dni maľovania sú za nami – ako sa predpoveď vyvíjala, ostáva v podrobnostiach nižšie.</p>
      </section>
    `
      : `
      <section class="card">
        <h2 class="panel-title">Výhľad zatiaľ nie je k dispozícii</h2>
        <p class="muted">Ešte nebola uložená žiadna snímka predpovede.</p>
      </section>
    `;
  } else {
    body += renderPlainSection(digest, cfg);
  }

  const technical = renderTechnicalDetails(history, digest, latest, generatedAt, cfg);
  body += technical.html;
  scripts.push(...technical.scripts);
  body += renderDisclaimer();

  return renderPageShell({
    title,
    heading: `${title} – Zedlitzdorf 74`,
    subtitle: `${esc(LOCATION.name)} &middot; stav k ${esc(formatGeneratedAt(generatedAt))}`,
    body,
    scripts,
  });
}

// ---------------------------------------------------------------------------
// E-mail image (docs/outlook.png): the same four plain days as a narrow strip
// ---------------------------------------------------------------------------

/** 480 CSS px wide, rasterized at 2x - the width the e-mail shows it at, so text renders sharp on
 * a retina phone without the mail client having to scale anything down. */
const STRIP = { width: 480, pad: 14, headerH: 58, rowH: 78, pastRowH: 36, footerH: 34, colARight: 310, sparkX: 324, sparkW: 142, sparkH: 66 };
/** Fixed ink, like the rest of the rasterized output: a PNG has no theme to follow. */
const STRIP_INK = { primary: "#22201b", secondary: "#52514e", muted: "#898781", border: "#e6e3dc" };

function stripText(x: number, y: number, size: number, fill: string, content: string, opts: { weight?: number; anchor?: string } = {}): string {
  const anchor = opts.anchor ? ` text-anchor="${opts.anchor}"` : "";
  return `<text x="${x}" y="${y}"${anchor} style="fill:${fill};font-size:${size}px;${opts.weight ? `font-weight:${opts.weight};` : ""}">${esc(content)}</text>`;
}

/**
 * The plain four-day overview as one SVG document. No emoji anywhere (a test checks): the CI
 * rasterizer has no emoji font, so the traffic light is a coloured disc, the weather is a drawn
 * pictogram and the trend is words only - an "↑" would risk a tofu box for no added meaning.
 */
export function buildPlainStripSvg(digest: OutlookDigest, cfg: OutlookConfig): { svg: string; width: number; height: number } {
  const days = plainDays(digest, cfg);
  const parts: string[] = [
    stripText(STRIP.pad, 26, 16, STRIP_INK.primary, `Dá sa maľovať ${windowLabel(digest.window)}?`, { weight: 700 }),
    stripText(STRIP.pad, 45, 11.5, STRIP_INK.secondary, horizonSentence(plainContext(digest))),
  ];
  const rule = (at: number) => `<line x1="${STRIP.pad}" y1="${at}" x2="${STRIP.width - STRIP.pad}" y2="${at}" stroke="${STRIP_INK.border}" stroke-width="1" />`;

  let y = STRIP.headerH;
  for (const day of days) {
    parts.push(rule(y));
    if (day.past) {
      parts.push(stripText(STRIP.pad, y + 23, 12.5, STRIP_INK.secondary, day.dayLabel, { weight: 600 }));
      parts.push(stripText(STRIP.colARight, y + 23, 11.5, STRIP_INK.muted, PAST_WORDS, { anchor: "end" }));
      y += STRIP.pastRowH;
      continue;
    }
    parts.push(
      stripText(STRIP.pad, y + 15, 12.5, STRIP_INK.secondary, day.dayLabel, { weight: 600 }),
      stripText(STRIP.colARight, y + 15, 10.5, STRIP_INK.muted, day.trend, { anchor: "end" }),
      `<circle cx="${STRIP.pad + 5.5}" cy="${y + 32.5}" r="5.5" fill="${statusColor(day.status)}" />`,
      stripText(STRIP.pad + 17, y + 37, 15, STRIP_INK.primary, day.verdict, { weight: 700 }),
      weatherGlyphSvg(day.glyph, STRIP.pad, y + 43, 18),
      stripText(STRIP.pad + 23, y + 56, 11.5, STRIP_INK.primary, day.weather),
      stripText(STRIP.pad, y + 72, 11.5, STRIP_INK.muted, `${day.temp} · ${day.chanceShort}`),
      `<g transform="translate(${STRIP.sparkX},${y + 6})">${sparklineFor(day, cfg, false, { width: STRIP.sparkW, height: STRIP.sparkH })}</g>`
    );
    y += STRIP.rowH;
  }

  parts.push(rule(y));
  const legend = [
    { color: PALETTE.statusGood, label: "asi áno" },
    { color: PALETTE.statusMarginal, label: "ešte nevieme" },
    { color: PALETTE.statusBad, label: "skôr nie" },
  ];
  legend.forEach((item, i) => {
    const x = STRIP.pad + i * 160;
    parts.push(`<circle cx="${x + 5}" cy="${y + 13}" r="4.5" fill="${item.color}" />`, stripText(x + 15, y + 17, 11, STRIP_INK.secondary, item.label));
  });

  const height = y + STRIP.footerH;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STRIP.width} ${height}" width="${STRIP.width}" height="${height}">` +
    `<rect x="0" y="0" width="${STRIP.width}" height="${height}" style="fill:${PALETTE.surface}" />${parts.join("")}</svg>`;
  return { svg, width: STRIP.width, height };
}

/** The hosted image the e-mail embeds; null once the window is over (no digest, nothing to show). */
export function renderOutlookPng(digest: OutlookDigest | null, cfg: OutlookConfig): Buffer | null {
  if (!digest) return null;
  const strip = buildPlainStripSvg(digest, cfg);
  return rasterizeSvg(strip.svg, strip.width, 2);
}

/** Cache-busting key for the hosted image: a hash of the very source the PNG is rendered from, so
 * Gmail's image proxy refetches exactly when the picture changes. A run timestamp would not do -
 * from step B1 on, the speaking model can change without the anchor's run changing. */
export function outlookImageKey(digest: OutlookDigest, cfg: OutlookConfig): string {
  return createHash("sha1").update(buildPlainStripSvg(digest, cfg).svg).digest("hex").slice(0, 10);
}

// ---------------------------------------------------------------------------
// Embeds: dashboard card + e-mail block
// ---------------------------------------------------------------------------

/** The plain layer in list form - same words as the outlook page, minus the sparklines (the card is
 * a glance on the way to outlook.html, not the place to study a trend). */
export function renderOutlookCard(digest: OutlookDigest, cfg: OutlookConfig): string {
  const items = plainDays(digest, cfg)
    .map((d) =>
      d.past
        ? `<li><span class="plain-head">${esc(d.dayLabel)}</span><span class="plain-sub">${PAST_WORDS}</span></li>`
        : `<li>
          <span class="plain-head"><span aria-hidden="true">${d.icon}</span> ${esc(d.dayLabel)} &middot; ${esc(d.verdict)}</span>
          <span class="plain-sub"><span aria-hidden="true">${d.glyphEmoji}</span> ${esc(d.weather)} &middot; ${esc(d.temp)} &middot; ${esc(d.chance)} &middot; ${esc(d.trend)}</span>
        </li>`
    )
    .join("");
  return `
    <section class="card">
      <h2 class="panel-title">Dá sa maľovať ${esc(windowLabel(digest.window))}?</h2>
      <ul class="plain-list">${items}</ul>
      <p class="how-to-read">${esc(horizonSentence(plainContext(digest)))} ${LEGEND_SHORT}</p>
      <a class="page-link" href="outlook.html">Podrobný výhľad →</a>
      <details style="margin-top:10px;">
        <summary>Zdroj</summary>
        <p class="muted" style="margin:6px 0 0;">${esc(digest.primaryLabel)}, beh ${esc(runLabel(digest.latestRunAt))} &middot; podiel členov ensemblu s aspoň ${cfg.minGoodHours} h súvisle vhodných podmienok; trend = zmena za 24 h.</p>
      </details>
    </section>
  `;
}

const EMAIL = { header: "#54606e", muted: "#767268", ink: "#22201b", border: "#e6e3dc" };
const PAGES_BASE = "https://sb8691.github.io/ztlzdrf";

/**
 * Two columns - the day on the left, the verdict on the right - in the same plain words as the
 * page. Wrapping is deliberately left on (the old seven-column table forced a horizontal scroll on
 * a phone), and the verdict is ink, never the status colour, which fails contrast in amber.
 * The image below repeats it all, so its alt text carries the whole message for a reader who has
 * images turned off.
 */
export function renderOutlookEmailBlock(digest: OutlookDigest, cfg: OutlookConfig): string {
  const days = plainDays(digest, cfg);
  const cell = (content: string, extra = "") =>
    `<td valign="top" style="padding:7px 8px 7px 0;border-bottom:1px solid ${EMAIL.border};${extra}">${content}</td>`;
  const head = (text: string) => `<div style="font-size:14px;font-weight:700;color:${EMAIL.ink};">${text}</div>`;
  const sub = (text: string) => `<div style="margin-top:2px;font-size:12px;color:${EMAIL.muted};">${text}</div>`;
  const rows = days
    .map((d) => {
      if (d.past) {
        return `<tr>${cell(head(esc(d.dayLabel)), "width:44%;")}${cell(`<div style="font-size:13px;color:${EMAIL.muted};">${PAST_WORDS}</div>`)}</tr>`;
      }
      const left = head(esc(d.dayLabel)) + sub(`${d.glyphEmoji} ${esc(d.weather)} &middot; ${esc(d.temp)}`);
      const right = head(`${d.icon} ${esc(d.verdict)}`) + sub(`${esc(d.chance)} &middot; ${d.trendArrow ? `${d.trendArrow} ` : ""}${esc(d.trend)}`);
      return `<tr>${cell(left, "width:44%;")}${cell(right)}</tr>`;
    })
    .join("");
  const imgSrc = `${PAGES_BASE}/outlook.png?t=${outlookImageKey(digest, cfg)}`;
  const alt = days.map((d) => d.sentence).join(" ");
  return `
    <div style="margin-top:22px;padding-top:16px;border-top:1px solid ${EMAIL.border};">
      <div style="font-size:15px;font-weight:700;color:${EMAIL.ink};">Dá sa maľovať ${esc(windowLabel(digest.window))}?</div>
      <div style="margin:2px 0 10px;font-size:12px;color:${EMAIL.muted};">${esc(horizonSentence(plainContext(digest)))} ${LEGEND_SHORT}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows}
      </table>
      <img src="${imgSrc}" width="480" alt="${esc(alt)}" style="width:100%;max-width:480px;height:auto;display:block;margin-top:12px;border-radius:8px;border:1px solid ${EMAIL.border};" />
      <p style="margin:8px 0 0;font-size:12px;color:${EMAIL.muted};">Pre technika – pravdepodobnosti, vývoj predpovede a meteogram: <a href="${PAGES_BASE}/outlook.html" style="color:${EMAIL.header};font-weight:600;text-decoration:none;">${PAGES_BASE}/outlook.html</a></p>
    </div>
  `;
}
