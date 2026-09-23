import { join } from "node:path";
import { LOCATION, WINDOW_CONFIG } from "./config.js";
import { formatShortDate } from "./time.js";
import { bestStartPerDay, localTimeLabel } from "./window-core.js";
import { fetchSnapshot, readSnapshot, snapshotMatches, writeSnapshot, type WindowSnapshot } from "./window-data.js";
import { renderWindowPage } from "./window-page.js";
import { DOCS_DIR, writeIfChanged } from "./outlook-store.js";

/**
 * The generator behind the site's main page (npm run window / node dist/outlook.js).
 *
 * The file keeps its old name because the CI workflow invokes `dist/outlook.js` by path, and the
 * workflow is out of scope here - it already runs this on all four schedules, including the 11:13
 * and 23:13 UTC ones timed to ECMWF's 00z/12z cycles, which is exactly when fresh numbers land.
 *
 * It fetches Open-Meteo, stores the snapshot and writes docs/index.html. A failed fetch is not fatal
 * while an earlier snapshot exists: the page is then republished unchanged, still stamped with the
 * time its data was really fetched, and the open page will try again on its own.
 *
 * Env knobs for local work: OUTLOOK_DOCS_DIR (write into a scratch copy instead of docs/),
 * WINDOW_RENDER_ONLY=true (no network - re-render the page from the stored snapshot).
 */

const PAGE_PATH = join(DOCS_DIR, "index.html");

function ageMinutes(snapshot: WindowSnapshot, nowMs: number): number {
  return (nowMs - snapshot.fetchedAtMs) / 60_000;
}

function logSummary(snapshot: WindowSnapshot): void {
  const cfg = snapshot.config;
  const scored = snapshot.scores.filter((s) => s.score !== null);
  console.log(
    `Ansámbel: ${snapshot.ensemble.discovered}/${snapshot.ensemble.expected} členov, ` +
      `${scored.length}/${snapshot.scores.length} začiatkov vypočítaných, mriežka ${snapshot.grid.latitude}/${snapshot.grid.longitude} @ ${snapshot.grid.elevation} m.`
  );
  for (const day of bestStartPerDay(snapshot.scores, cfg)) {
    const rain = snapshot.daily.find((d) => d.date === day.date);
    const rainText = rain && rain.totalMm !== null ? `${rain.totalMm.toFixed(1)} mm${rain.complete ? "" : " (neúplné)"}` : "—";
    if (!day.best) {
      console.log(`  ${formatShortDate(day.date)}: nedostatok dát pre všetkých ${day.total} začiatkov, dážď ${rainText}`);
      continue;
    }
    console.log(
      `  ${formatShortDate(day.date)}: najlepší štart ${localTimeLabel(day.best.startMs, cfg.timezone)} – ` +
        `${day.best.score} % (${day.best.matching} z ${day.best.expected}), vypočítaných ${day.computable}/${day.total} h, dážď ${rainText}`
    );
  }
}

async function main(): Promise<void> {
  const cfg = WINDOW_CONFIG;
  const renderOnly = process.env.WINDOW_RENDER_ONLY === "true" || process.env.OUTLOOK_RENDER_ONLY === "true";
  const now = Date.now();
  const stored = readSnapshot();
  const reusable = snapshotMatches(stored, cfg) ? stored : null;

  console.log(`Okno na natieranie: ${cfg.start} – ${cfg.end} (${LOCATION.name})${process.env.OUTLOOK_DOCS_DIR ? ` – výstupy do ${DOCS_DIR}` : ""}.`);

  let snapshot: WindowSnapshot | null = reusable;
  if (renderOnly) {
    if (!snapshot) throw new Error(`WINDOW_RENDER_ONLY=true, ale ${DOCS_DIR} nemá použiteľnú snímku pre okno ${cfg.start} – ${cfg.end}.`);
    console.log("WINDOW_RENDER_ONLY=true – nič sa nesťahuje, renderujem z uloženej snímky.");
  } else if (reusable && ageMinutes(reusable, now) < cfg.serverMinRefreshMinutes) {
    // A cache must never pose as a new model run, so a fresh snapshot is reused as-is, keeping its
    // own fetch stamp - and the page stays byte-identical instead of committing a new timestamp.
    console.log(`Snímka je stará ${ageMinutes(reusable, now).toFixed(0)} min – nesťahujem znova (limit ${cfg.serverMinRefreshMinutes} min).`);
  } else {
    try {
      snapshot = await fetchSnapshot(cfg);
      writeSnapshot(snapshot);
      console.log(`Stiahnuté z Open-Meteo (${cfg.model}), snímka uložená.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!reusable) throw new Error(`Predpoveď sa nepodarilo stiahnuť a žiadna staršia snímka neexistuje: ${message}`);
      snapshot = reusable;
      console.warn(`Predpoveď sa nepodarilo stiahnuť (${message}) – publikujem poslednú platnú snímku z ${new Date(reusable.fetchedAtMs).toISOString()}.`);
    }
  }

  if (!snapshot) throw new Error("Niet čo publikovať: chýba čerstvá aj uložená snímka.");

  logSummary(snapshot);
  const changed = writeIfChanged(PAGE_PATH, renderWindowPage(snapshot));
  console.log(`${PAGE_PATH} ${changed ? "aktualizovaná" : "bez zmeny"}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
