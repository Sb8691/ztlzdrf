import type { WindowResult } from "./types.js";
import { LOCATION, WINDOW } from "./config.js";
import { summarize } from "./dashboard.js";

export interface EmailConfig {
  apiKey: string;
  to: string;
  from: string;
}

const MODEL_LABELS: Record<string, string> = {
  icon_seamless: "ICON (DWD)",
  gfs_seamless: "GFS (NOAA)",
  ecmwf_ifs025: "ECMWF",
  gem_seamless: "GEM (Kanada)",
  meteofrance_seamless: "Météo-France",
};

const GOOD = "#0ca30c";
const CRITICAL = "#d03b3b";
const NEUTRAL = "#54606e";
const MUTED = "#767268";
const INK = "#22201b";
const BORDER = "#e6e3dc";

function formatCandidateStart(candidateStart: string): string {
  const [datePart, timePart] = candidateStart.split("T");
  const [, m, d] = datePart.split("-");
  return `${d}.${m}. o ${timePart.slice(0, 5)}`;
}

/** Formats an absolute UTC instant (windowStart/windowEnd) in LOCATION.timezone (Bratislava clock). */
function formatWindowInstant(iso: string): string {
  const parts = new Intl.DateTimeFormat("sk-SK", {
    timeZone: LOCATION.timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}. ${get("hour")}:${get("minute")}`;
}

export function renderAlertEmail(result: WindowResult): { subject: string; html: string } {
  const niceStart = formatCandidateStart(result.candidateStart);
  const headerColor = result.ok ? GOOD : NEUTRAL;
  const subject = result.ok
    ? `☀️ Terasa: vhodné okno na maľovanie – ${niceStart}`
    : `🌦️ Terasa: ranná predpoveď (zatiaľ nevhodné) – ${niceStart}`;
  const heroLabel = result.ok ? "Odporúčaný štart maľovania" : "Najbližší sledovaný termín";

  const rows = result.perModel
    .map((m) => {
      const dryColor = m.dry ? GOOD : CRITICAL;
      const dryBg = m.dry ? "#e5f6e5" : "#fbe9e9";
      const dryLabel = m.dry ? "OK" : "ZLYHAL";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${INK};">${MODEL_LABELS[m.model] ?? m.model}</td>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${INK};text-align:right;">${m.maxHourlyMm.toFixed(2)} mm/h</td>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${INK};text-align:right;">${m.totalMm.toFixed(2)} mm</td>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER};text-align:center;">
            <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;color:${dryColor};background:${dryBg};">${dryLabel}</span>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
  <div style="background:#f4f2ee;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
      <tr>
        <td style="background:${headerColor};padding:20px 28px;">
          <span style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;opacity:0.9;">Terrace Watchdog</span>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700;">${result.ok ? "☀️ Vhodné okno na maľovanie terasy" : "🌦️ Ranná predpoveď terasy"}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:14px;color:${MUTED};">${LOCATION.name}</p>

          <div style="background:#f4f2ee;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
            <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">${heroLabel}</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:${INK};">${niceStart}</p>
            <p style="margin:10px 0 0;font-size:13px;color:${MUTED};">
              Súvislé suché okno (${WINDOW.preDryHours} h pred &middot; ${WINDOW.paintHours} h maľovania &middot; ${WINDOW.postDryHours} h schnutia)<br>
              ${formatWindowInstant(result.windowStart)} &ndash; ${formatWindowInstant(result.windowEnd)} (${LOCATION.timezone})
            </p>
            ${!result.ok ? `<p style="margin:10px 0 0;font-size:13px;color:${INK};">${summarize(result)}</p>` : ""}
          </div>

          <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:${INK};">Porovnanie zrážok podľa modelu</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;border-collapse:separate;">
            <thead>
              <tr style="background:#f4f2ee;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.02em;">Model</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.02em;">Max/h</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.02em;">Súčet</th>
                <th style="padding:10px 12px;text-align:center;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.02em;">Stav</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <p style="margin:24px 0 0;font-size:13px;color:${MUTED};">
            Automatický alert z <a href="https://sb8691.github.io/ztlzdrf/" style="color:${GOOD};text-decoration:none;font-weight:600;">terrace watchdog dashboardu</a>.
          </p>
        </td>
      </tr>
    </table>
  </div>
  `;
  return { subject, html };
}

export async function sendAlert(result: WindowResult, config: EmailConfig): Promise<void> {
  const { subject, html } = renderAlertEmail(result);
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
