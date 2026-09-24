import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCATION } from "./config.js";
import { formatDayLabel } from "./time.js";
import { addDays, bestStartPerDay, localMidnightMs, localTimeLabel } from "./window-core.js";
import { readSnapshot } from "./window-data.js";
import { renderWindowPng } from "./window-image.js";
import { renderAlertEmail, sendAlert } from "./email.js";
import { recordEmailSent } from "./email-gate.js";
import { DOCS_DIR } from "./outlook-store.js";

/**
 * The daily run (npm run dev / node dist/index.js): publish the e-mail image and send the e-mail
 * about the painting window.
 *
 * It does not fetch anything. The window snapshot is produced by src/outlook.ts, which the workflow
 * runs first and which leaves docs/data/window.json behind; reading it here is what guarantees the
 * e-mail and the page quote the same numbers. No snapshot means no e-mail - never an invented one.
 *
 * docs/chart.png keeps its name because the workflow waits for exactly that file to go live on
 * Pages before letting this run send the e-mail that links to it.
 */

const CHART_PATH = join(DOCS_DIR, "chart.png");

async function main(): Promise<void> {
  const sendEmail = process.env.SEND_EMAIL !== "false";
  const now = new Date();

  const snapshot = readSnapshot();
  if (!snapshot) {
    console.warn("Chýba snímka docs/data/window.json – e-mail sa neposiela (najprv spusti generátor okna).");
    return;
  }

  const cfg = snapshot.config;
  console.log(`Lokalita: ${LOCATION.name}`);
  console.log(`Okno na natieranie: ${cfg.start} – ${cfg.end}, dáta z ${new Date(snapshot.fetchedAtMs).toISOString()}.`);
  for (const day of bestStartPerDay(snapshot.scores, cfg)) {
    if (!day.best) {
      console.log(`  ${formatDayLabel(day.date)}: nedostatok dát`);
      continue;
    }
    console.log(`  ${formatDayLabel(day.date)}: najlepší štart ${localTimeLabel(day.best.startMs, cfg.timezone)} – ${day.best.score} % (${day.best.matching} z ${day.best.expected})`);
  }

  // Once the window is behind us there is nothing to report and the campaign is over; the run goes
  // quiet by itself rather than mailing days that already happened.
  if (now.getTime() >= localMidnightMs(addDays(cfg.end, 1), cfg.timezone)) {
    console.log(`Okno ${cfg.start} – ${cfg.end} už uplynulo – e-mail sa neposiela. Posuň PAINT_WINDOW na ďalšie natieranie.`);
    return;
  }

  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(CHART_PATH, renderWindowPng(snapshot));
  console.log("Obrázok pre e-mail vygenerovaný do docs/chart.png.");

  const previewPath = process.env.EMAIL_PREVIEW_PATH;
  if (previewPath) {
    writeFileSync(previewPath, renderAlertEmail(snapshot, now).html);
    console.log(`Náhľad e-mailu zapísaný do ${previewPath}.`);
  }

  if (!sendEmail) {
    console.log("SEND_EMAIL=false – e-mail sa neposiela (dry-run).");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!apiKey || !to || !from) {
    throw new Error("Chýbajú env premenné RESEND_API_KEY / ALERT_EMAIL_TO / ALERT_EMAIL_FROM");
  }
  await sendAlert(snapshot, now, { apiKey, to, from });
  console.log("E-mail odoslaný.");

  // Only CI records a send (src/email-gate.ts): the record is what lets later runs of the same day
  // stand down, so a local test e-mail must never write it.
  if (process.env.RECORD_EMAIL === "true") {
    const marker = recordEmailSent({
      date: process.env.EMAIL_FOR_DATE,
      nowMs: now.getTime(),
      timeZone: cfg.timezone,
      trigger: process.env.GITHUB_EVENT_NAME ?? "local",
      runId: process.env.GITHUB_RUN_ID ?? null,
    });
    console.log(`Zaznamenané: e-mail za ${marker.date} odišiel.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
