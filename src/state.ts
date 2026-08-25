import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATE_PATH = fileURLToPath(new URL("../state.json", import.meta.url));

export interface State {
  lastAlertedStart: string | null;
}

export function readState(): State {
  if (!existsSync(STATE_PATH)) return { lastAlertedStart: null };
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

export function writeState(state: State): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}
