import { LOCATION } from "./config.js";
import { CHART_WIDTH } from "./charts.js";
import { formatDayLabel } from "./time.js";
import { bestStartPerDay, localDateOf, localTimeLabel } from "./window-core.js";
import { windowImageAlt } from "./window-image.js";
import { renderWindowEmailBlock } from "./window-email.js";
import type { WindowSnapshot } from "./window-data.js";

export interface EmailConfig {
  apiKey: string;
  to: string;
  from: string;
}

const HEADER = "#54606e";
const MUTED = "#767268";
const BORDER = "#e6e3dc";

/**
 * The daily e-mail: the painting window, nothing else.
 *
 * It used to lead with a "can I paint today" verdict from GeoSphere, but the whole project is now
 * about one question - which hour of 1-5 Oct to start - so the e-mail says exactly what the page
 * says, built from the same snapshot (docs/data/window.json).
 *
 * Mail-client rules: tables and inline styles only, no <style>, no <details>, no nowrap, and the
 * charts must be one really hosted image - Gmail strips inline <svg> and refuses `data:` URIs.
 * The `t=` parameter cache-busts Gmail's image proxy, which otherwise caches by URL forever.
 */
function chartImageUrl(generatedAt: Date): string {
  return `https://sb8691.github.io/ztlzdrf/chart.png?t=${generatedAt.getTime()}`;
}

function formatGeneratedAt(d: Date): string {
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
  const cfg = snapshot.config;
  const niceNow = formatGeneratedAt(generatedAt);
  const block = renderWindowEmailBlock(snapshot, generatedAt.getTime());

  const html = `
  <div style="background:#f4f2ee;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
      <tr>
        <td style="background:${HEADER};padding:20px 28px;">
          <span style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;opacity:0.9;">Zedlitzdorf 74</span>
          <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#ffffff;font-weight:700;">Okno na natieranie terasy</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px 28px;">
          <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">${formatDayLabel(cfg.start)} – ${formatDayLabel(cfg.end)} &middot; ${LOCATION.name}</p>
          <p style="margin:0;font-size:12px;color:${MUTED};">Odoslané ${niceNow}.</p>

          ${block}

          <img src="${chartImageUrl(generatedAt)}" width="${CHART_WIDTH}" alt="${windowImageAlt(snapshot).replace(/"/g, "&quot;")}" style="width:100%;max-width:${CHART_WIDTH}px;height:auto;display:block;margin-top:20px;border-radius:8px;border:1px solid ${BORDER};" />

          <p style="margin:16px 0 0;font-size:12px;color:${MUTED};line-height:1.5;">
            Pred natieraním zmerajte vlhkosť a teplotu dreva – predpoveď ich nepotvrdzuje. Nasledujúcich 24 h po dokončení je sledované obdobie, nie záruka vyschnutia.
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:${MUTED};">
            Automatický report zo <a href="https://sb8691.github.io/ztlzdrf/" style="color:${HEADER};text-decoration:none;font-weight:600;">stránky okna na natieranie</a>.
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
