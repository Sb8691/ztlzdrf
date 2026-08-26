import type { WeatherPoint } from "./types.js";
import { LOCATION } from "./config.js";
import { buildWeatherChart, computeStats } from "./dashboard.js";

export interface EmailConfig {
  apiKey: string;
  to: string;
  from: string;
}

const HEADER = "#54606e";
const MUTED = "#767268";
const INK = "#22201b";
const BORDER = "#e6e3dc";

/** Formats an absolute instant in LOCATION.timezone (Europe/Vienna). */
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

export function renderAlertEmail(points: WeatherPoint[], generatedAt: Date): { subject: string; html: string } {
  const niceNow = formatGeneratedAt(generatedAt);
  const subject = `🌤️ Predpoveď počasia – Zedlitzdorf 74 – ${niceNow}`;
  const stats = computeStats(points);
  const chart = buildWeatherChart(points, generatedAt.getTime(), { interactive: false });
  const tempPart =
    stats.minTempC !== null && stats.maxTempC !== null
      ? `teplota ${stats.minTempC.toFixed(1)}–${stats.maxTempC.toFixed(1)} °C`
      : "teplota bez dát";
  const humidityPart =
    stats.avgHumidityPct !== null ? `priemerná vlhkosť ${stats.avgHumidityPct.toFixed(0)} %` : "vlhkosť bez dát";

  const html = `
  <div style="background:#f4f2ee;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
      <tr>
        <td style="background:${HEADER};padding:20px 28px;">
          <span style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;opacity:0.9;">Zedlitzdorf 74</span>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700;">🌤️ Predpoveď počasia (−24 h / +36 h)</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:14px;color:${MUTED};">${LOCATION.name} &middot; vygenerované ${niceNow}</p>

          <div style="margin-bottom:16px;font-size:12px;color:${MUTED};">
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#2a78d6;margin-right:5px;"></span>Zrážky (mm)
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#d9622a;margin-right:5px;"></span>Teplota (°C)
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#e0b430;margin-right:5px;"></span>Slnečné žiarenie (W/m²)
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#1f9e89;margin-right:5px;"></span>Vlhkosť (%)
          </div>

          ${chart.svg}

          <p style="margin:16px 0 0;font-size:13px;color:${INK};">
            Súčet zrážok za celé okno: ${stats.totalPrecipMm.toFixed(1)} mm &middot; ${tempPart} &middot; ${humidityPart}.
          </p>

          <p style="margin:24px 0 0;font-size:13px;color:${MUTED};">
            Automatický report zo <a href="https://sb8691.github.io/ztlzdrf/" style="color:${HEADER};text-decoration:none;font-weight:600;">Zedlitzdorf 74 weather dashboardu</a>.
          </p>
        </td>
      </tr>
    </table>
  </div>
  `;
  return { subject, html };
}

export async function sendAlert(points: WeatherPoint[], generatedAt: Date, config: EmailConfig): Promise<void> {
  const { subject, html } = renderAlertEmail(points, generatedAt);
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
