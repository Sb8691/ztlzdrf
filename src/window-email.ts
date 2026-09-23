import { formatDayLabel } from "./time.js";
import { addDays, bestStartPerDay, localMidnightMs, localTimeLabel } from "./window-core.js";
import { LIGHT } from "./window-theme.js";
import type { WindowSnapshot } from "./window-data.js";

/**
 * The five days as a table inside the daily e-mail, in the page's own words and colours.
 *
 * Built from the very snapshot the page was built from (docs/data/window.json), so the e-mail and
 * the site can never quote different numbers. Gmail rules apply: tables and inline styles only, no
 * <style>, no <details>, no nowrap.
 */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function num(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

function cell(content: string, extra = ""): string {
  return `<td style="padding:9px 10px 9px 0;font-size:14px;color:${LIGHT.text};border-bottom:1px solid ${LIGHT.hairline};${extra}">${content}</td>`;
}

function head(label: string, extra = ""): string {
  return `<td style="padding:0 10px 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${LIGHT.muted};${extra}">${label}</td>`;
}

/**
 * Empty once the window is over, so the e-mail says nothing rather than reporting days that are
 * already behind us.
 */
export function renderWindowEmailBlock(snapshot: WindowSnapshot, nowMs: number): string {
  const cfg = snapshot.config;
  if (nowMs >= localMidnightMs(addDays(cfg.end, 1), cfg.timezone)) return "";

  const rows = bestStartPerDay(snapshot.scores, cfg)
    .map((day) => {
      const rain = snapshot.daily.find((d) => d.date === day.date);
      const rainText = rain && rain.totalMm !== null ? `${num(rain.totalMm, 1)} mm${rain.complete ? "" : " (neúplné)"}` : "–";
      const dayCell = cell(`<strong style="font-weight:600">${formatDayLabel(day.date)}</strong>`);
      if (!day.best) {
        return `<tr>${dayCell}${cell("–")}${cell(`<span style="color:${LIGHT.muted}">nedostatok dát</span>`, "text-align:right;")}${cell(rainText, "text-align:right;color:" + LIGHT.muted + ";")}</tr>`;
      }
      const share =
        `<span style="color:${LIGHT.score};font-weight:600">${day.best.score} %</span>` +
        ` <span style="color:${LIGHT.muted}">(${day.best.matching} z ${day.best.expected})</span>`;
      return `<tr>${dayCell}${cell(localTimeLabel(day.best.startMs, cfg.timezone))}${cell(share, "text-align:right;")}${cell(rainText, "text-align:right;color:" + LIGHT.muted + ";")}</tr>`;
    })
    .join("");

  return `
          <p style="margin:0 0 14px;font-size:13px;color:${LIGHT.muted};line-height:1.5;font-family:${FONT};">
            Koľko scenárov predpovede vyhovuje pre ${cfg.applicationHours} h práce v kuse a ďalších ${cfg.postApplicationHours} h sledovania: aspoň ${cfg.minimumAirTemperatureC} °C počas nanášania a takmer žiadny dážď. Natiera sa ${cfg.workDayStartHour}:00–${cfg.workDayEndHour}:00, preto sú v hre len začiatky do ${cfg.workDayEndHour - cfg.applicationHours}:00. Kratšiu seansu (napríklad 3 h) si vyberiete na stránke.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};">
            <tr>${head("Deň")}${head("Najlepší začiatok")}${head("Vyhovuje", "text-align:right;")}${head("Dážď za deň", "text-align:right;")}</tr>
            ${rows}
          </table>
  `;
}
