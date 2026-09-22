import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OutlookHistory } from "./types.js";

/** The only persistence in the project: the outlook run history, committed to docs/ by CI. */

export const DOCS_DIR = fileURLToPath(new URL("../docs", import.meta.url));
export const OUTLOOK_DIR = join(DOCS_DIR, "outlook");
export const HISTORY_PATH = join(OUTLOOK_DIR, "history.json");

/** null when the file is missing or unusable (logged) - callers must treat that as "no outlook yet". */
export function readOutlookHistory(path = HISTORY_PATH): OutlookHistory | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<OutlookHistory>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs) || !parsed.window) {
      console.warn(`História výhľadu ${path} má neznámy formát – ignorujem.`);
      return null;
    }
    return parsed as OutlookHistory;
  } catch (err) {
    console.warn(`Históriu výhľadu ${path} sa nepodarilo načítať: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function writeOutlookHistory(history: OutlookHistory, path = HISTORY_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(history, null, 1)}\n`);
}

/** Writes only when the bytes differ, so unchanged renders never create git noise. */
export function writeIfChanged(path: string, data: Buffer | string): boolean {
  const next = typeof data === "string" ? Buffer.from(data) : data;
  if (existsSync(path) && readFileSync(path).equals(next)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return true;
}
