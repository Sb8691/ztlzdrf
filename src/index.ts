import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchModelForecasts } from "./openMeteo.js";
import { findPaintWindows, pickCandidateStarts } from "./analyze.js";
import { WINDOW, ALERT_LOOKAHEAD_DAYS, LOCATION } from "./config.js";
import { sendAlert } from "./email.js";
import { readState, writeState } from "./state.js";
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

  // FORCE_ALERT=true bypasses the "ok" / lookahead gate and the state dedup so you can
  // see what the alert e-mail actually looks like, regardless of whether the forecast is
  // currently suitable. Testing-only: never writes state.json.
  const forceAlert = process.env.FORCE_ALERT === "true";

  // candidateStart is a naive Vienna wall-clock string (no UTC offset), so this
  // comparison against Date.now() can be off by Vienna's UTC offset (1-2h) -
  // negligible next to the multi-day ALERT_LOOKAHEAD_DAYS threshold.
  const lookaheadMs = ALERT_LOOKAHEAD_DAYS * 24 * 3600_000;
  const best = forceAlert
    ? results[0]
    : results.find((r) => r.ok && new Date(r.candidateStart).getTime() - Date.now() <= lookaheadMs);

  if (!best) {
    console.log("Žiadne vhodné okno na najbližšie víkendy.");
    return;
  }

  if (forceAlert) {
    console.log(`FORCE_ALERT=true – posielam testovací e-mail pre ${best.candidateStart} (ok=${best.ok}), bez zápisu do state.json.`);
  } else {
    const state = readState();
    if (state.lastAlertedStart === best.candidateStart) {
      console.log(`Už bol odoslaný alert pre ${best.candidateStart}, preskakujem.`);
      return;
    }
    console.log(`Nájdené vhodné okno: ${best.candidateStart}`);
  }

  if (sendEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ALERT_EMAIL_TO;
    const from = process.env.ALERT_EMAIL_FROM;
    if (!apiKey || !to || !from) {
      throw new Error("Chýbajú env premenné RESEND_API_KEY / ALERT_EMAIL_TO / ALERT_EMAIL_FROM");
    }
    await sendAlert(best, { apiKey, to, from });
    console.log("E-mail alert odoslaný.");
  } else {
    console.log("SEND_EMAIL=false – e-mail sa neposiela (dry-run).");
  }

  if (!forceAlert) {
    writeState({ lastAlertedStart: best.candidateStart });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
