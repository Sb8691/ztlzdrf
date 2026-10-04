import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SKI_CONFIG, type SkiConfig } from "./config.js";
import { fetchJson } from "./fetch-json.js";
import { appendForecastLog, buildForecastLog, fetchStationResponses, type Responses, type StationResponses } from "./prospective.js";
import { buildSkiSnapshot, HORIZON_KEYS, firstSkiDate, horizonUrl, metaUrl, SKI_SNAPSHOT_VERSION } from "./ski-core.js";
import { renderSkiPage } from "./ski-page.js";

/**
 * The generator behind the ski page (npm run ski / node dist/ski.js): fetch the three horizons,
 * keep the snapshot in docs/data/ski.json, write docs/index.html.
 *
 * A failed fetch is not fatal while an earlier snapshot exists: the page is republished from it,
 * still stamped with the time its data was really fetched, and the open page tries again itself.
 * A snapshot younger than serverMinRefreshMinutes is reused as-is, so a re-run minutes later
 * changes no byte.
 *
 * Every fresh fetch also appends one line to data/prospective/<season>.jsonl (src/prospective.ts),
 * the record the 2026/27 verification will be scored from; a failure there is a warning, never a
 * missing page.
 *
 * Env knobs for local work: SKI_DOCS_DIR (write into a scratch directory instead of docs/),
 * SKI_LOG_DIR (the forecast log elsewhere than data/prospective/), SKI_RENDER_ONLY=true (no network -
 * re-render the page from the stored snapshot, no log line).
 */

export const DOCS_DIR = process.env.SKI_DOCS_DIR ? resolve(process.env.SKI_DOCS_DIR) : fileURLToPath(new URL("../docs", import.meta.url));
const SNAPSHOT_PATH = join(DOCS_DIR, "data", "ski.json");
const PAGE_PATH = join(DOCS_DIR, "index.html");
export const LOG_DIR = process.env.SKI_LOG_DIR ? resolve(process.env.SKI_LOG_DIR) : fileURLToPath(new URL("../data/prospective", import.meta.url));

export type SkiSnapshot = ReturnType<typeof buildSkiSnapshot>;

/** Writes only when the content differs, so an unchanged page never becomes a commit. */
export function writeIfChanged(path: string, data: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === data) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return true;
}

export function readSnapshot(path: string = SNAPSHOT_PATH): SkiSnapshot | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as SkiSnapshot;
    if (parsed?.version !== SKI_SNAPSHOT_VERSION || !parsed.horizons || !HORIZON_KEYS.every((k) => parsed.horizons[k]?.resorts)) {
      console.warn(`Snímka ${path} má neznámy formát – ignorujem.`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`Snímku ${path} sa nepodarilo načítať: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Sequential on purpose: Open-Meteo answers a burst of parallel requests with an error body under
 * HTTP 200. The run metadata is best effort - without it the page just omits the run time. */
export async function fetchSkiResponses(cfg: SkiConfig = SKI_CONFIG, nowMs = Date.now()): Promise<Responses> {
  const first = firstSkiDate(nowMs, cfg);
  const responses: Responses = {};
  for (const key of HORIZON_KEYS) {
    const data = await fetchJson<unknown>(horizonUrl(cfg, key, first), { timeoutMs: 60_000 });
    let meta: unknown = null;
    try {
      meta = await fetchJson<unknown>(metaUrl(cfg, key), { retries: 1 });
    } catch {
      meta = null;
    }
    responses[key] = { data, meta };
  }
  return responses;
}

export async function fetchSkiSnapshot(cfg: SkiConfig = SKI_CONFIG, nowMs = Date.now()): Promise<SkiSnapshot> {
  return buildSkiSnapshot(await fetchSkiResponses(cfg, nowMs), cfg, nowMs);
}

/** The prospective log line for a fresh fetch: stations are fetched best effort, the line is written either way. */
async function logForecasts(snapshot: SkiSnapshot, responses: Responses, cfg: SkiConfig): Promise<void> {
  let stations: StationResponses | null = null;
  try {
    stations = await fetchStationResponses(cfg, snapshot.firstDate);
  } catch (err) {
    console.warn(`Predpoveď pre overovacie stanice sa nepodarilo stiahnuť (${err instanceof Error ? err.message : String(err)}) – log bude bez staníc.`);
  }
  const { path, written } = appendForecastLog(buildForecastLog(snapshot, responses, stations, cfg), LOG_DIR);
  console.log(written ? `Predpoveď zapísaná do ${path}${stations ? "" : " (bez staníc)"}.` : `${path} už má riadok z tohto načítania.`);
}

function logSummary(s: SkiSnapshot): void {
  for (const key of HORIZON_KEYS) {
    const h = s.horizons[key];
    console.log(`${h.label}: ${h.dates[0]} – ${h.dates[h.dates.length - 1]}${h.runAtMs ? `, beh ${new Date(h.runAtMs).toISOString()}` : ""}`);
    for (const r of h.resorts as { id: string; days: Record<string, unknown>[] }[]) {
      const cells = r.days.map((d) =>
        key === "long" ? `${d.goodPct ?? "–"}/${d.fairPct ?? "–"}/${d.badPct ?? "–"} %` : String(d.status ?? "–")
      );
      console.log(`  ${r.id.padEnd(20)} ${cells.join("  ")}`);
    }
  }
}

async function main(): Promise<void> {
  const cfg = SKI_CONFIG;
  const renderOnly = process.env.SKI_RENDER_ONLY === "true";
  const now = Date.now();
  const stored = readSnapshot();
  const ageMin = stored ? (now - stored.fetchedAtMs) / 60_000 : Infinity;

  let snapshot: SkiSnapshot | null = stored;
  if (renderOnly) {
    if (!stored) throw new Error(`SKI_RENDER_ONLY=true, ale ${SNAPSHOT_PATH} nemá použiteľnú snímku.`);
    console.log("SKI_RENDER_ONLY=true – nič sa nesťahuje, renderujem z uloženej snímky.");
  } else if (stored && ageMin < cfg.serverMinRefreshMinutes) {
    console.log(`Snímka je stará ${ageMin.toFixed(0)} min – nesťahujem znova (limit ${cfg.serverMinRefreshMinutes} min).`);
  } else {
    try {
      const responses = await fetchSkiResponses(cfg, now);
      snapshot = buildSkiSnapshot(responses, cfg, now);
      writeIfChanged(SNAPSHOT_PATH, `${JSON.stringify(snapshot)}\n`);
      console.log("Stiahnuté z Open-Meteo, snímka uložená.");
      try {
        await logForecasts(snapshot, responses, cfg);
      } catch (err) {
        console.warn(`Log predpovedí sa nepodarilo zapísať: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!stored) throw new Error(`Predpoveď sa nepodarilo stiahnuť a žiadna staršia snímka neexistuje: ${message}`);
      console.warn(`Predpoveď sa nepodarilo stiahnuť (${message}) – publikujem snímku z ${new Date(stored.fetchedAtMs).toISOString()}.`);
    }
  }
  if (!snapshot) throw new Error("Niet čo publikovať.");

  logSummary(snapshot);
  const changed = writeIfChanged(PAGE_PATH, renderSkiPage(snapshot));
  console.log(`${PAGE_PATH} ${changed ? "aktualizovaná" : "bez zmeny"}.`);
}

// Only when run as a program - the tests import the helpers above.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
