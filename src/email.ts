import { LOCATION } from "./config.js";
import { CHART_WIDTH } from "./charts.js";
import { formatDayLabel } from "./time.js";
import { bestStartPerDay, localDateOf, localTimeLabel } from "./window-core.js";
import { windowImageAlt } from "./window-image.js";
import { renderWindowEmailBlock } from "./window-email.js";
import { LIGHT } from "./window-theme.js";
import type { WindowSnapshot } from "./window-data.js";

export interface EmailConfig {
  apiKey: string;
  to: string;
  from: string;
}

/**
 * The daily e-mail: the painting window, nothing else, looking like the page it comes from - same
 * heading, same calm surface, same colours (src/window-theme.ts), same wording.
 *
 * Always the light palette: mail clients handle `prefers-color-scheme` inconsistently and some
 * invert colours on their own, so one high-contrast light card is the reliable choice.
 *
 * Mail-client rules: tables and inline styles only, no <style>, no <details>, no nowrap, and the
 * charts must be one really hosted image - Gmail strips inline <svg> and refuses `data:` URIs. The
 * `t=` parameter cache-busts Gmail's image proxy, which otherwise caches by URL forever.
 */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function chartImageUrl(generatedAt: Date): string {
  return `https://sb8691.github.io/ztlzdrf/chart.png?t=${generatedAt.getTime()}`;
}

function formatStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("sk-SK", {
    timeZone: LOCATION.timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}. ${get("hour")}:${get("minute")}`;
}

function monthName(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("sk-SK", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** The page's own subtitle: "1.–5. október 2026". */
function periodLabel(snapshot: WindowSnapshot): string {
  const { start, end } = snapshot.config;
  return `${Number(start.slice(8))}.–${Number(end.slice(8))}. ${monthName(start)} ${start.slice(0, 4)}`;
}

/** Subject carries the single most useful fact, so the window can be judged from the inbox list. */
export function emailSubject(snapshot: WindowSnapshot): string {
  const cfg = snapshot.config;
  const period = `${formatDayLabel(cfg.start)} – ${formatDayLabel(cfg.end)}`;
  const best = bestStartPerDay(snapshot.scores, cfg)
    .map((d) => d.best)
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return `Terasa ${period}: zatiaľ nedostatok dát`;
  const day = formatDayLabel(localDateOf(best.startMs, cfg.timezone));
  return `Terasa ${period}: najlepší štart ${day} ${localTimeLabel(best.startMs, cfg.timezone)} – ${best.score} %`;
}

export function renderAlertEmail(snapshot: WindowSnapshot, generatedAt: Date): { subject: string; html: string } {
  const block = renderWindowEmailBlock(snapshot, generatedAt.getTime());
  const source = `Zdroj: ${snapshot.config.modelLabel} cez Open-Meteo · načítané ${formatStamp(new Date(snapshot.fetchedAtMs))}`;

  const html = `
  <div style="background:${LIGHT.page};padding:32px 16px;font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:${LIGHT.surface};border-radius:12px;border:1px solid ${LIGHT.hairline};">
      <tr>
        <td style="padding:30px 28px 26px;">
          <h1 style="margin:0 0 4px;font-size:22px;line-height:1.25;font-weight:650;color:${LIGHT.text};letter-spacing:-0.01em;">Počasie na natieranie terasy</h1>
          <p style="margin:0 0 12px;font-size:15px;color:${LIGHT.muted};">Zedlitzdorf · ${periodLabel(snapshot)}</p>
          <p style="margin:0 0 22px;font-size:12px;color:${LIGHT.muted};">${source}</p>

          ${block}

          <img src="${chartImageUrl(generatedAt)}" width="${CHART_WIDTH}" alt="${windowImageAlt(snapshot).replace(/"/g, "&quot;")}" style="width:100%;max-width:${CHART_WIDTH}px;height:auto;display:block;margin-top:24px;border-radius:8px;border:1px solid ${LIGHT.hairline};" />

          <p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${LIGHT.hairline};font-size:13px;color:${LIGHT.muted};line-height:1.5;">
            Pred natieraním zmerajte vlhkosť a teplotu dreva. Predpoveď ich nepotvrdzuje. Nasledujúcich ${snapshot.config.postApplicationHours} h je sledované obdobie, nie záruka vyschnutia.
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:${LIGHT.muted};">
            <a href="https://sb8691.github.io/ztlzdrf/" style="color:${LIGHT.accent};text-decoration:none;font-weight:600;">Otvoriť celý prehľad s piatimi grafmi</a>
          </p>
        </td>
      </tr>
    </table>
  </div>
  `;
  return { subject: emailSubject(snapshot), html };
}

export async function sendAlert(snapshot: WindowSnapshot, generatedAt: Date, config: EmailConfig): Promise<void> {
  const { subject, html } = renderAlertEmail(snapshot, generatedAt);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API request failed: ${res.status} ${body}`);
  }
}
