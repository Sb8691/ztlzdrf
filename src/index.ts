import { fetchModelForecasts } from "./openMeteo.js";
import { findPaintWindows, pickCandidateStarts } from "./analyze.js";
import { WINDOW, ALERT_LOOKAHEAD_DAYS, LOCATION } from "./config.js";
import { sendAlert } from "./email.js";
import { readState, writeState } from "./state.js";

async function main() {
  const sendEmail = process.env.SEND_EMAIL !== "false";

  const hourlyByModel = await fetchModelForecasts();
  const anyModel = Object.values(hourlyByModel)[0];
  const candidateStarts = pickCandidateStarts(anyModel.time);
  const results = findPaintWindows(hourlyByModel, candidateStarts, WINDOW);

  console.log(`Lokalita: ${LOCATION.name}`);
  for (const r of results) {
    console.log(`Kandidát ${r.candidateStart}: ${r.ok ? "VHODNÉ OKNO" : "nevhodné"}`);
    for (const m of r.perModel) {
      console.log(`  ${m.model}: max ${m.maxHourlyMm.toFixed(2)} mm/h, súčet ${m.totalMm.toFixed(2)} mm`);
    }
  }

  // candidateStart is a naive Vienna wall-clock string (no UTC offset), so this
  // comparison against Date.now() can be off by Vienna's UTC offset (1-2h) -
  // negligible next to the multi-day ALERT_LOOKAHEAD_DAYS threshold.
  const lookaheadMs = ALERT_LOOKAHEAD_DAYS * 24 * 3600_000;
  const best = results.find(
    (r) => r.ok && new Date(r.candidateStart).getTime() - Date.now() <= lookaheadMs
  );

  if (!best) {
    console.log("Žiadne vhodné okno na najbližšie víkendy.");
    return;
  }

  const state = readState();
  if (state.lastAlertedStart === best.candidateStart) {
    console.log(`Už bol odoslaný alert pre ${best.candidateStart}, preskakujem.`);
    return;
  }

  console.log(`Nájdené vhodné okno: ${best.candidateStart}`);

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

  writeState({ lastAlertedStart: best.candidateStart });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
