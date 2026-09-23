import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WINDOW_CONFIG, type WindowConfig } from "./config.js";
import { fetchJson } from "./openmeteo.js";
import { buildSnapshot, ensembleUrl, forecastUrl, metaUrl, SNAPSHOT_VERSION } from "./window-core.js";
import { DOCS_DIR, writeIfChanged } from "./outlook-store.js";

/**
 * The Node side of the painting-window page: fetch the two Open-Meteo products, hand them to the
 * shared core, and keep the result on disk.
 *
 * docs/data/window.json is the "last valid data" the page is built from. It exists so a run whose
 * fetch failed still publishes the previous numbers (labelled with the time they were really
 * fetched) instead of an empty page, and so the layout can be re-rendered offline. It is never a
 * stand-in for a fresh model run: its own fetch stamp travels with it into the page.
 */

export const SNAPSHOT_PATH = join(DOCS_DIR, "data", "window.json");

export type WindowSnapshot = ReturnType<typeof buildSnapshot>;

export function readSnapshot(path: string = SNAPSHOT_PATH): WindowSnapshot | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as WindowSnapshot;
    if (parsed?.version !== SNAPSHOT_VERSION || !parsed.series || !Array.isArray(parsed.scores)) {
      console.warn(`Snímka ${path} má neznámy formát – ignorujem.`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`Snímku ${path} sa nepodarilo načítať: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function writeSnapshot(snapshot: WindowSnapshot, path: string = SNAPSHOT_PATH): boolean {
  return writeIfChanged(path, `${JSON.stringify(snapshot)}\n`);
}

/** A stored snapshot is only reusable while it describes the window we are publishing now. */
export function snapshotMatches(snapshot: WindowSnapshot | null, cfg: WindowConfig): snapshot is WindowSnapshot {
  return !!snapshot && snapshot.config.start === cfg.start && snapshot.config.end === cfg.end;
}

/**
 * One fetch of everything the page needs. Sequential on purpose: Open-Meteo answers a burst of
 * parallel requests with an error body under HTTP 200, and the three calls cost a second.
 * The run metadata is best effort - without it the page simply omits the model-run line rather than
 * passing the fetch time off as one.
 */
export async function fetchSnapshot(cfg: WindowConfig = WINDOW_CONFIG): Promise<WindowSnapshot> {
  const forecast = await fetchJson<Record<string, unknown>>(forecastUrl(cfg));
  const ensemble = await fetchJson<Record<string, unknown>>(ensembleUrl(cfg));
  const url = metaUrl(cfg);
  let meta: Record<string, unknown> | null = null;
  if (url) {
    try {
      meta = await fetchJson<Record<string, unknown>>(url, { retries: 1 });
    } catch {
      meta = null;
    }
  }
  return buildSnapshot(forecast, ensemble, meta, cfg, Date.now());
}
