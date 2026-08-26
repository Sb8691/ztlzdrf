import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchModelForecasts } from "./openMeteo.js";
import { findPaintWindows, pickCandidateStarts } from "./analyze.js";
import { WINDOW, LOCATION } from "./config.js";
import { sendAlert } from "./email.js";
import { renderDashboardHtml } from "./dashboard.js";
import type { WindowResult } from "./types.js";

const DASHBOARD_DIR = fileURLToPath(new URL("../docs", import.meta.url));

function printWindowReport(r: WindowResult) {
  console.log(`Kandidát ${r.candidateStart}: ${r.ok ? "VHODNÉ OKNO" : "nevhodné"}`);
  console.log(`  Okno: ${r.windowStart} – ${r.windowEnd}`);
  for (const m of r.perModel) {
    const coverage = `${m.hoursCovered}/${m.hoursExpected}h pokryté`;
    const status = m.dry ? "OK" : "ZLYHAL";
    console.log(
      `  ${m.model}: max ${m.maxHourlyMm.toFixed(2)} mm/h, súčet ${m.totalMm.toFixed(2)} mm, ${coverage} [${status}]`
    );
  }
  if (r.failures.length > 0) {
    console.log("  Dôvody zlyhania (hodina, model, fáza, zrážky):");
    const sorted = [...r.failures].sort((a, b) => a.time.localeCompare(b.time));
    for (const f of sorted) {
      console.log(
        `    ${f.time} | ${f.model} | ${f.phase} | ${f.precipitationMm.toFixed(2)} mm/h (prah ${WINDOW.rainThresholdMm} mm/h)`
      );
    }
  }
}

async function main() {
  const sendEmail = process.env.SEND_EMAIL !== "false";

  const hourlyByModel = await fetchModelForecasts();
  const anyModel = Object.values(hourlyByModel)[0];
  // past_days on the Open-Meteo request adds recent history to the same array, so
  // pickCandidateStarts would otherwise also match already-passed Sat/Sun 08:00 slots.
  const candidateStarts = pickCandidateStarts(anyModel.time).filter(
    (t) => new Date(t).getTime() >= Date.now()
  );
  const results = findPaintWindows(hourlyByModel, candidateStarts, WINDOW);

  console.log(`Lokalita: ${LOCATION.name}`);
  for (const r of results) {
    printWindowReport(r);
  }

  mkdirSync(DASHBOARD_DIR, { recursive: true });
  writeFileSync(`${DASHBOARD_DIR}/index.html`, renderDashboardHtml(hourlyByModel, results, new Date()));
  console.log("Dashboard vygenerovaný do docs/index.html.");

  // Always reports on the nearest upcoming candidate weekend - preferring one that's fully
  // dry (ok) if any exists, otherwise the earliest one - so a daily e-mail goes out every
  // morning regardless of whether painting is actually advisable right now.
  const best = results.find((r) => r.ok) ?? results[0];

  if (!best) {
    console.log("Žiadny kandidátsky termín v dosahu predpovede.");
    return;
  }

  console.log(
    best.ok
      ? `Vhodné okno: ${best.candidateStart}`
      : `Zatiaľ nevhodné, najbližší sledovaný termín: ${best.candidateStart}`
  );

  if (sendEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ALERT_EMAIL_TO;
    const from = process.env.ALERT_EMAIL_FROM;
    if (!apiKey || !to || !from) {
      throw new Error("Chýbajú env premenné RESEND_API_KEY / ALERT_EMAIL_TO / ALERT_EMAIL_FROM");
    }
    await sendAlert(best, { apiKey, to, from });
    console.log("E-mail odoslaný.");
  } else {
    console.log("SEND_EMAIL=false – e-mail sa neposiela (dry-run).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
