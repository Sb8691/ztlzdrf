import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchWeatherWindow } from "./geosphere.js";
import { CHART_WINDOW, LOCATION } from "./config.js";
import { sendAlert } from "./email.js";
import { renderDashboardHtml, renderChartPng, computeStats } from "./dashboard.js";

const DASHBOARD_DIR = fileURLToPath(new URL("../docs", import.meta.url));

async function main() {
  const sendEmail = process.env.SEND_EMAIL !== "false";
  const now = new Date();

  const points = await fetchWeatherWindow(now, CHART_WINDOW.pastHours, CHART_WINDOW.aheadHours);
  const stats = computeStats(points);

  console.log(`Lokalita: ${LOCATION.name}`);
  console.log(
    `Okno ${points[0]?.time ?? "?"} – ${points[points.length - 1]?.time ?? "?"}: ` +
      `súčet zrážok ${stats.totalPrecipMm.toFixed(1)} mm, teplota ${stats.minTempC?.toFixed(1) ?? "?"}–${stats.maxTempC?.toFixed(1) ?? "?"} °C, ` +
      `priemerná vlhkosť ${stats.avgHumidityPct?.toFixed(0) ?? "?"} %`
  );

  mkdirSync(DASHBOARD_DIR, { recursive: true });
  writeFileSync(`${DASHBOARD_DIR}/index.html`, renderDashboardHtml(points, now));
  console.log("Dashboard vygenerovaný do docs/index.html.");

  // Published so the e-mail can link to it as a real hosted image - Gmail (and most mail
  // clients) strip inline <svg> and refuse `data:` image URIs, so this is the only reliable way
  // to show the chart in the e-mail itself.
  writeFileSync(`${DASHBOARD_DIR}/chart.png`, renderChartPng(points, now.getTime()));
  console.log("Graf vygenerovaný do docs/chart.png.");

  if (sendEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ALERT_EMAIL_TO;
    const from = process.env.ALERT_EMAIL_FROM;
    if (!apiKey || !to || !from) {
      throw new Error("Chýbajú env premenné RESEND_API_KEY / ALERT_EMAIL_TO / ALERT_EMAIL_FROM");
    }
    await sendAlert(points, now, { apiKey, to, from });
    console.log("E-mail odoslaný.");
  } else {
    console.log("SEND_EMAIL=false – e-mail sa neposiela (dry-run).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
