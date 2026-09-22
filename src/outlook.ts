import { existsSync } from "node:fs";
import { join } from "node:path";
import { LOCATION, OUTLOOK, type OutlookConfig, type OutlookModel } from "./config.js";
import type { OutlookDigest, OutlookHistory, OutlookRunEntry } from "./types.js";
import { addDays, daysBetween, formatDayLabel, formatRunLabel, localDateOf, localMidnightMs } from "./time.js";
import { effectiveRunAt, fetchEnsembleMembers, fetchRunMeta, type EnsembleFetch, type RunMeta } from "./openmeteo.js";
import {
  buildDigest,
  consensusHourly,
  emptyHistory,
  evaluateMemberDays,
  evaluateMemberHours,
  medianSeries,
  mergeHistory,
  pct,
  primaryModel,
  resolveOutlookWindow,
  statusIcon,
  summarizeDay,
  sunTimesFor,
  windowDates,
} from "./outlook-core.js";
import { renderOutlookHtml, renderOutlookPng, type LatestRunView } from "./outlook-dashboard.js";
import { DOCS_DIR, HISTORY_PATH, readOutlookHistory, writeIfChanged, writeOutlookHistory } from "./outlook-store.js";

/**
 * Medium-range outlook run (npm run outlook / node dist/outlook.js): fetch every configured
 * ensemble model for the target window, judge each member with the painting rules, append the
 * per-run summaries to docs/outlook/history.json (idempotent per model run) and render
 * docs/outlook.html + docs/outlook.png. Run once per CI job before the dashboard/e-mail run, which
 * only reads the history. Exit code 1 only when the primary model fails - the workflow step is
 * `continue-on-error`, so the daily e-mail never depends on this.
 *
 * Env knobs for local work: OUTLOOK_DOCS_DIR (write everything into a scratch copy, never into
 * docs/), OUTLOOK_RENDER_ONLY=true (no network - re-render the page/PNG from the stored history;
 * the meteogram, which needs the freshly fetched members, is then absent), OUTLOOK_FORCE_RENDER=true
 * (render even when no new run landed).
 */

interface ModelFetch {
  fetch: EnsembleFetch;
  meta: RunMeta | null;
}

interface Snapshots {
  entries: OutlookRunEntry[];
  latestView: LatestRunView | null;
}

async function fetchSnapshots(cfg: OutlookConfig, dates: string[], startDate: string, endDate: string, windowEndMs: number): Promise<Snapshots> {
  const settled = await Promise.allSettled(
    cfg.models.map(async (model): Promise<ModelFetch> => {
      const [fetch, meta] = await Promise.all([fetchEnsembleMembers(model, startDate, endDate), fetchRunMeta(model.metaDomain)]);
      return { fetch, meta };
    })
  );

  const entries: OutlookRunEntry[] = [];
  let latestView: LatestRunView | null = null;

  for (let i = 0; i < cfg.models.length; i++) {
    const model: OutlookModel = cfg.models[i];
    const result = settled[i];
    if (result.status === "rejected") {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      if (model.primary) throw new Error(`Primárny model ${model.label} zlyhal: ${message}`);
      console.warn(`Model ${model.label} sa nepodarilo stiahnuť (${message}) – v tejto snímke chýba.`);
      continue;
    }
    const { fetch, meta } = result.value;
    if (fetch.members.length === 0) {
      console.log(`${model.label}: ${model.optional ? "zatiaľ nepokrýva okno (očakávané)" : "bez dát pre okno"} – preskakujem.`);
      continue;
    }

    const sun = sunTimesFor(fetch.members[0]);
    const hourlyPerMember = fetch.members.map((points) => evaluateMemberHours(points, sun));
    const statsPerMember = fetch.members.map((points, m) => evaluateMemberDays(points, hourlyPerMember[m], dates, cfg.minGoodHours));
    const days = dates
      .map((date) =>
        summarizeDay(
          date,
          statsPerMember.map((stats) => stats.find((d) => d.date === date)!),
          cfg.rainDayThresholdMm
        )
      )
      .filter((d): d is NonNullable<typeof d> => d !== null);
    if (days.length === 0) {
      console.log(`${model.label}: žiadny člen nepokrýva celý deň v okne – preskakujem.`);
      continue;
    }

    const run = effectiveRunAt(meta, windowEndMs, fetch.fetchedAtMs);
    entries.push({
      model: model.id,
      runAt: new Date(run.runAtMs).toISOString(),
      runAtSource: run.source,
      fetchedAt: new Date(fetch.fetchedAtMs).toISOString(),
      members: fetch.members.length,
      grid: fetch.grid,
      days,
    });
    console.log(
      `${model.label}: beh ${formatRunLabel(run.runAtMs, LOCATION.timezone)}${run.source === "fetch" ? " (odhad z času stiahnutia)" : ""}, ${fetch.members.length} členov, ` +
        `grid ${fetch.grid.latitude.toFixed(3)}/${fetch.grid.longitude.toFixed(3)} @ ${fetch.grid.elevation} m, ${days.length}/${dates.length} dní.`
    );

    if (model.primary) {
      latestView = {
        model,
        runAtMs: run.runAtMs,
        members: fetch.members.length,
        median: medianSeries(fetch.members),
        consensus: consensusHourly(hourlyPerMember, cfg.hourConsensus),
      };
    }
  }
  return { entries, latestView };
}

function logDigest(digest: OutlookDigest, cfg: OutlookConfig): void {
  for (const d of digest.days) {
    const trend = d.trend ? ` (${d.trend.deltaPct >= 0 ? "+" : ""}${d.trend.deltaPct} p. b. za 24 h)` : "";
    console.log(
      `  ${statusIcon(d.status)} ${formatDayLabel(d.date)}: maľovateľný ${pct(d.pPaintable)}${trend}, aspoň hraničný ${pct(d.pPossible)}, ` +
        `dážď ≥ ${cfg.rainDayThresholdMm} mm ${pct(d.pRain)}, zrážky p50/p90 ${d.precipP50.toFixed(1)}/${d.precipP90.toFixed(1)} mm, Tmax/Tmin ${d.tMaxP50.toFixed(0)}/${d.tMinP50.toFixed(0)} °C`
    );
  }
}

/** Writes docs/outlook.html and docs/outlook.png only when their bytes changed. */
function renderOutputs(history: OutlookHistory, digest: OutlookDigest | null, latestView: LatestRunView | null, now: Date, cfg: OutlookConfig): void {
  const htmlPath = join(DOCS_DIR, "outlook.html");
  const pngPath = join(DOCS_DIR, "outlook.png");
  const html = renderOutlookHtml(history, digest, latestView, now, cfg);
  const htmlChanged = writeIfChanged(htmlPath, html);
  // The image is the plain four-day strip, so it exists only while the window does; after it ends
  // the e-mail block is gone too and the last PNG may simply stay behind.
  const png = renderOutlookPng(digest, cfg);
  const pngChanged = png ? writeIfChanged(pngPath, png) : false;
  console.log(`${htmlPath} ${htmlChanged ? "aktualizovaný" : "bez zmeny"}, ${pngPath} ${png ? (pngChanged ? "aktualizovaný" : "bez zmeny") : "nevygenerovaný (žiadne aktívne okno)"}.`);
}

async function main(): Promise<void> {
  const cfg = OUTLOOK;
  const window = resolveOutlookWindow(cfg, process.env);
  const primary = primaryModel(cfg);
  const now = new Date();
  const today = localDateOf(now.getTime(), LOCATION.timezone);
  const renderOnly = process.env.OUTLOOK_RENDER_ONLY === "true";
  const forceRender = renderOnly || process.env.OUTLOOK_FORCE_RENDER === "true";

  console.log(`Výhľad na maľovanie: okno ${window.start} – ${window.end} (${LOCATION.name})${process.env.OUTLOOK_DOCS_DIR ? ` – výstupy do ${DOCS_DIR}` : ""}.`);
  if (daysBetween(today, window.end) < 0) {
    console.log(`Okno skončilo ${window.end} – výhľad sa už neaktualizuje. Posuň OUTLOOK.window (alebo OUTLOOK_START/OUTLOOK_END) na ďalšie maľovanie.`);
    // Still render the "window over" state (digest = null) so the page never keeps showing the past
    // days as a forecast. Rendered "as of" the midnight that closed the window - a fixed instant, so
    // the bytes are identical run after run and writeIfChanged really makes later runs a no-op.
    const history = readOutlookHistory();
    const closedAt = new Date(localMidnightMs(addDays(window.end, 1), LOCATION.timezone));
    if (history && history.window.start === window.start && history.window.end === window.end) renderOutputs(history, null, null, closedAt, cfg);
    return;
  }

  let history = readOutlookHistory() ?? emptyHistory(cfg, window);
  if (history.window.start !== window.start || history.window.end !== window.end) {
    const archive = join(DOCS_DIR, "outlook", `history-${history.window.start}_${history.window.end}.json`);
    writeOutlookHistory(history, archive);
    console.log(`Okno sa zmenilo (${history.window.start} – ${history.window.end} → ${window.start} – ${window.end}); stará história odložená do ${archive}.`);
    history = emptyHistory(cfg, window);
  }

  const dates = windowDates(window);
  const startDate = addDays(window.start, -cfg.paddingDays);
  const endDate = addDays(window.end, cfg.paddingDays);
  const windowEndMs = localMidnightMs(addDays(window.end, 1), LOCATION.timezone);

  let snapshots: Snapshots = { entries: [], latestView: null };
  if (renderOnly) console.log("OUTLOOK_RENDER_ONLY=true – nič sa nesťahuje, renderujem z uloženej histórie (meteogram posledného behu chýba).");
  else snapshots = await fetchSnapshots(cfg, dates, startDate, endDate, windowEndMs);

  if (!renderOnly && !snapshots.entries.some((e) => e.model === primary.id)) {
    console.log(`Primárny model ${primary.label} zatiaľ nepokrýva okno – snímka sa neukladá.`);
  }

  const merged = mergeHistory(history, snapshots.entries);
  history = merged.history;
  if (merged.added > 0) {
    writeOutlookHistory(history);
    console.log(`História: ${merged.added} nový beh (spolu ${history.runs.length}) → ${HISTORY_PATH}`);
  } else {
    console.log(`História: žiadny nový beh (spolu ${history.runs.length}).`);
  }

  // Taken after the fetch: the runs just stored carry a fetchedAt later than `now`, and the digest
  // must see them as "already shown" (today's sparkline point) - never build it with an instant
  // older than the newest run.
  const renderedAt = new Date();
  const digest = buildDigest(history, cfg, renderedAt.getTime());
  if (digest) logDigest(digest, cfg);

  // The page carries a "generated at" stamp, so it is re-rendered only when the data changed (or the
  // files are missing) - otherwise every outlook-only CI run would commit a timestamp-only change.
  const mustRender = merged.added > 0 || !existsSync(join(DOCS_DIR, "outlook.html")) || !existsSync(join(DOCS_DIR, "outlook.png")) || forceRender;
  if (!mustRender) {
    console.log("Bez nových behov – docs/outlook.html a docs/outlook.png ostávajú nezmenené.");
    return;
  }
  renderOutputs(history, digest, snapshots.latestView, renderedAt, cfg);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
