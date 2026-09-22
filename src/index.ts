import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchWeatherWindow } from "./geosphere.js";
import { CHART_WINDOW, LOCATION, OUTLOOK, PAINTING_RULES } from "./config.js";
import { renderAlertEmail, sendAlert } from "./email.js";
import { renderDashboardHtml, renderChartPng } from "./dashboard.js";
import { evaluatePaintingConditions } from "./painting.js";
import { buildDigest } from "./outlook-core.js";
import { renderOutlookCard, renderOutlookEmailBlock } from "./outlook-dashboard.js";
import { readOutlookHistory } from "./outlook-store.js";
import type { WoodMoistureReading } from "./types.js";

const DASHBOARD_DIR = fileURLToPath(new URL("../docs", import.meta.url));

/**
 * The medium-range outlook (src/outlook.ts) is a separate run that only leaves docs/outlook/
 * history.json behind; here it is merely read and embedded as a card (dashboard) and a block
 * (e-mail) while its target window is still ahead. Anything wrong with it degrades to "no outlook"
 * - the daily decision must never depend on it.
 */
function readOutlookEmbeds(nowMs: number): { cardHtml: string; emailHtml: string; label: string | null } {
  try {
    const history = readOutlookHistory();
    const digest = history ? buildDigest(history, OUTLOOK, nowMs) : null;
    if (!digest) return { cardHtml: "", emailHtml: "", label: null };
    return {
      cardHtml: renderOutlookCard(digest, OUTLOOK),
      emailHtml: renderOutlookEmailBlock(digest, OUTLOOK),
      label: `${digest.window.start} – ${digest.window.end}, ${digest.primaryLabel} beh ${digest.latestRunAt}`,
    };
  } catch (err) {
    console.warn(`Výhľad sa nepodarilo pripojiť: ${err instanceof Error ? err.message : String(err)}`);
    return { cardHtml: "", emailHtml: "", label: null };
  }
}

/**
 * Optional manual wood-moisture reading, overriding the weather-based dryness estimate - see
 * evaluatePaintingConditions's `manualWoodMoisture` option. Not a database: just two env vars,
 * since a single terrace only ever has one "latest measurement" at a time.
 */
function readManualWoodMoisture(): WoodMoistureReading | null {
  const pctRaw = process.env.WOOD_MOISTURE_PCT;
  if (!pctRaw) return null;
  const percent = Number(pctRaw);
  if (!Number.isFinite(percent)) return null;
  const measuredAtRaw = process.env.WOOD_MOISTURE_MEASURED_AT;
  const measuredAt = measuredAtRaw ? new Date(measuredAtRaw) : new Date();
  return { percent, measuredAt };
}

async function main() {
  const sendEmail = process.env.SEND_EMAIL !== "false";
  const now = new Date();

  const points = await fetchWeatherWindow(now, CHART_WINDOW.pastHours, CHART_WINDOW.aheadHours);
  const manualWoodMoisture = readManualWoodMoisture();
  const assessment = evaluatePaintingConditions(points, now.getTime(), PAINTING_RULES, { manualWoodMoisture });

  console.log(`Lokalita: ${LOCATION.name}`);
  console.log(
    `Okno ${points[0]?.time ?? "?"} – ${points[points.length - 1]?.time ?? "?"} (${points.length} h dát).`
  );
  console.log(
    `Rozhodnutie: ${assessment.status} (skóre vysychania ${assessment.score}/100). ` +
      (assessment.bestWindow
        ? `Najlepšie okno: ${new Date(assessment.bestWindow.startMs).toISOString()} – ${new Date(assessment.bestWindow.endMs).toISOString()} (${assessment.bestWindow.durationHours} h).`
        : "Žiadne vhodné okno nájdené.")
  );
  if (assessment.reasons.length > 0) console.log(`Dôvody: ${assessment.reasons.join(" | ")}`);
  if (assessment.warnings.length > 0) console.log(`Upozornenia: ${assessment.warnings.join(" | ")}`);

  const outlook = readOutlookEmbeds(now.getTime());
  console.log(outlook.label ? `Výhľad na okno ${outlook.label} pripojený.` : "Výhľad: žiadne aktívne okno.");

  mkdirSync(DASHBOARD_DIR, { recursive: true });
  writeFileSync(`${DASHBOARD_DIR}/index.html`, renderDashboardHtml(points, now, assessment, { outlookCardHtml: outlook.cardHtml }));
  console.log("Dashboard vygenerovaný do docs/index.html.");

  // Published so the e-mail can link to it as a real hosted image - Gmail (and most mail clients)
  // strip inline <svg> and refuse `data:` image URIs, so this is the only reliable way to show the
  // charts in the e-mail itself.
  writeFileSync(`${DASHBOARD_DIR}/chart.png`, renderChartPng(points, now.getTime(), assessment.hourly));
  console.log("Graf vygenerovaný do docs/chart.png.");

  // Exactly the HTML that would be sent, written to a file for a local look (the hosted images stay
  // remote, so the preview shows what Gmail shows once the run has published them).
  const previewPath = process.env.EMAIL_PREVIEW_PATH;
  if (previewPath) {
    writeFileSync(previewPath, renderAlertEmail(points, now, assessment, { outlookHtml: outlook.emailHtml }).html);
    console.log(`Náhľad e-mailu zapísaný do ${previewPath}.`);
  }

  if (sendEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ALERT_EMAIL_TO;
    const from = process.env.ALERT_EMAIL_FROM;
    if (!apiKey || !to || !from) {
      throw new Error("Chýbajú env premenné RESEND_API_KEY / ALERT_EMAIL_TO / ALERT_EMAIL_FROM");
    }
    await sendAlert(points, now, assessment, { apiKey, to, from }, { outlookHtml: outlook.emailHtml });
    console.log("E-mail odoslaný.");
  } else {
    console.log("SEND_EMAIL=false – e-mail sa neposiela (dry-run).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
