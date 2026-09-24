import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { WINDOW_CONFIG } from "./config.js";
import { emailDecision, parseMarker } from "./email-gate.js";

/**
 * The workflow's e-mail gate (node dist/should-send-email.js <marker file>): decides whether this
 * run sends the day's e-mail and hands `send` and `date` to the later steps through GITHUB_OUTPUT.
 * The rule itself lives in src/email-gate.ts; this file only wires it to the environment.
 *
 * The marker is passed as a file the workflow fetched from main just before, not read from the
 * checkout: a run that waited in the queue can have an older checkout than the run that just sent.
 */

const markerPath = process.argv[2];
const markerText = markerPath && existsSync(markerPath) ? readFileSync(markerPath, "utf8") : null;

const decision = emailDecision({
  event: process.env.GITHUB_EVENT_NAME ?? "local",
  manualSend: process.env.MANUAL_SEND === "true",
  marker: parseMarker(markerText),
  nowMs: Date.now(),
  cfg: WINDOW_CONFIG,
});

console.log(`E-mail v tomto behu: ${decision.send ? "áno" : "nie"} – ${decision.reason} (deň ${decision.date}).`);

const lines = `send=${decision.send}\ndate=${decision.date}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
else process.stdout.write(lines);
