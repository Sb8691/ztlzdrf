import { LOCATION } from "./config.js";
import { formatDayLabel } from "./time.js";
import { addDays, bestStartPerDay, localMidnightMs, localTimeLabel } from "./window-core.js";
import type { WindowSnapshot } from "./window-data.js";

/**
 * The painting window as a block inside the daily e-mail, speaking the same language as the page:
 * one row per day with the best hour to start and the share of ensemble scenarios that fits.
 *
 * It is built from the very snapshot the page was built from (docs/data/window.json), so the e-mail
 * and the site can never quote different numbers. Gmail rules apply: tables and inline styles only,
 * no <style>, no <details>, no nowrap, and the one image the e-mail carries stays hosted.
 */

const MUTED = "#767268";
const INK = "#22201b";
const BORDER = "#e6e3dc";
const HEADER = "#54606e";
const SITE = "https://sb8691.github.io/ztlzdrf/";

function num(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

function cell(content: string, extra = ""): string {
  return `<td style="padding:6px 8px 6px 0;font-size:13px;color:${INK};border-bottom:1px solid ${BORDER};${extra}">${content}</td>`;
}

function head(label: string, extra = ""): string {
  return `<td style="padding:0 8px 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${MUTED};${extra}">${label}</td>`;
}

/**
 * Empty once the window is over, so the e-mail quietly goes back to just the daily decision instead
 * of reporting days that are already behind us.
 */
export function renderWindowEmailBlock(snapshot: WindowSnapshot, nowMs: number): string {
  const cfg = snapshot.config;
  const windowEndMs = localMidnightMs(addDays(cfg.end, 1), cfg.timezone);
  if (nowMs >= windowEndMs) return "";

  const rows = bestStartPerDay(snapshot.scores, cfg)
    .map((day) => {
      const rain = snapshot.daily.find((d) => d.date === day.date);
      const rainText = rain && rain.totalMm !== null ? `${num(rain.totalMm, 1)} mm${rain.complete ? "" : " (neúplné)"}` : "–";
      if (!day.best) {
        return `<tr>${cell(`<strong>${formatDayLabel(day.date)}</strong>`)}${cell("–")}${cell(
          `<span style="color:${MUTED};">nedostatok dát</span>`,
          "text-align:right;"
        )}${cell(rainText, "text-align:right;")}</tr>`;
      }
      const share = `${day.best.score} % <span style="color:${MUTED};">(${day.best.matching} z ${day.best.expected})</span>`;
      return `<tr>${cell(`<strong>${formatDayLabel(day.date)}</strong>`)}${cell(localTimeLabel(day.best.startMs, cfg.timezone))}${cell(
        share,
        "text-align:right;"
      )}${cell(rainText, "text-align:right;")}</tr>`;
    })
    .join("");

  const fetched = new Intl.DateTimeFormat("sk-SK", {
    timeZone: LOCATION.timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(snapshot.fetchedAtMs));

  return `
          <div style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${BORDER};">
            <p style="margin:0 0 10px;font-size:12px;color:${MUTED};line-height:1.4;">Koľko scenárov predpovede vyhovuje pre 8 h práce a ďalších 24 h sledovania: aspoň ${cfg.minimumAirTemperatureC} °C počas nanášania a takmer žiadny dážď.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>${head("Deň")}${head("Najlepší začiatok")}${head("Vyhovuje", "text-align:right;")}${head("Dážď za deň", "text-align:right;")}</tr>
              ${rows}
            </table>
            <p style="margin:10px 0 0;font-size:12px;color:${MUTED};line-height:1.4;">
              Predpoveď ${cfg.modelLabel}, načítaná ${fetched}. Percento je meteorologický filter, nie záruka – vlhkosť a teplotu dreva treba zmerať.
              <a href="${SITE}" style="color:${HEADER};text-decoration:none;font-weight:600;">Celý prehľad na stránke</a>.
            </p>
          </div>
  `;
}
