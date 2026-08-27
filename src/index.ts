import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchWeatherWindow } from "./geosphere.js";
import { CHART_WINDOW, LOCATION, PAINTING_RULES } from "./config.js";
import { sendAlert } from "./email.js";
import { renderDashboardHtml, renderChartPng } from "./dashboard.js";
import { evaluatePaintingConditions } from "./painting.js";
import type { WoodMoistureReading } from "./types.js";

const DASHBOARD_DIR = fileURLToPath(new URL("../docs", import.meta.url));

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

  mkdirSync(DASHBOARD_DIR, { recursive: true });
  writeFileSync(`${DASHBOARD_DIR}/index.html`, renderDashboardHtml(points, now, assessment));
  console.log("Dashboard vygenerovaný do docs/index.html.");

  // Published so the e-mail can link to it as a real hosted image - Gmail (and most mail clients)
  // strip inline <svg> and refuse `data:` image URIs, so this is the only reliable way to show the
  // charts in the e-mail itself.
  writeFileSync(`${DASHBOARD_DIR}/chart.png`, renderChartPng(points, now.getTime(), assessment.hourly));
  console.log("Graf vygenerovaný do docs/chart.png.");

  if (sendEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ALERT_EMAIL_TO;
    const from = process.env.ALERT_EMAIL_FROM;
    if (!apiKey || !to || !from) {
      throw new Error("Chýbajú env premenné RESEND_API_KEY / ALERT_EMAIL_TO / ALERT_EMAIL_FROM");
    }
    await sendAlert(points, now, assessment, { apiKey, to, from });
    console.log("E-mail odoslaný.");
  } else {
    console.log("SEND_EMAIL=false – e-mail sa neposiela (dry-run).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
