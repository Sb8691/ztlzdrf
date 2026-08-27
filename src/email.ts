import type { PaintingAssessment, WeatherPoint } from "./types.js";
import { LOCATION } from "./config.js";
import { computeStats, CHART_WIDTH, statusColor, colorForHumidity, colorForDewPointSpread } from "./dashboard.js";
import { dryingScoreLabel } from "./painting.js";

export interface EmailConfig {
  apiKey: string;
  to: string;
  from: string;
}

const HEADER = "#54606e";
const MUTED = "#767268";
const INK = "#22201b";
const BORDER = "#e6e3dc";

/**
 * Gmail (and most mail clients) strip inline <svg> from HTML e-mails entirely, and separately
 * refuse to load `data:` image URIs - so the charts can't be inlined at all, they have to be a
 * real hosted image. `index.ts` publishes the same 4-panel chart stack as docs/chart.png (served
 * by GitHub Pages) before/alongside sending this e-mail; the `t=` query param cache-busts Gmail's
 * image proxy, which otherwise caches by URL and would keep serving yesterday's chart indefinitely.
 */
function chartImageUrl(generatedAt: Date): string {
  return `https://sb8691.github.io/ztlzdrf/chart.png?t=${generatedAt.getTime()}`;
}

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

function formatHm(ms: number): string {
  return new Intl.DateTimeFormat("sk-SK", { timeZone: LOCATION.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(ms)
  );
}

function statusLabel(status: PaintingAssessment["status"]): string {
  return status === "GOOD" ? "DOBRÉ NA MAĽOVANIE" : status === "MARGINAL" ? "HRANIČNÉ PODMIENKY" : "NEMAĽOVAŤ";
}

function statusIcon(status: PaintingAssessment["status"]): string {
  return status === "GOOD" ? "🟢" : status === "MARGINAL" ? "🟡" : "🔴";
}

function statRow(label: string, value: string, color?: string): string {
  return `
    <tr>
      <td style="padding:4px 0;font-size:13px;color:${MUTED};border-bottom:1px solid ${BORDER};">${label}</td>
      <td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right;color:${color ?? INK};border-bottom:1px solid ${BORDER};">${value}</td>
    </tr>
  `;
}

/**
 * Decision-first e-mail: the reader should be able to look at this for ~5 seconds and answer "can I
 * paint the terrace today" without interpreting any curves - the status card and window come first,
 * detailed charts are a compact single image at the bottom for anyone who wants to see why.
 */
export function renderAlertEmail(points: WeatherPoint[], generatedAt: Date, assessment: PaintingAssessment): { subject: string; html: string } {
  const niceNow = formatGeneratedAt(generatedAt);
  const subject = `${statusIcon(assessment.status)} ${statusLabel(assessment.status)} – Zedlitzdorf 74 – ${niceNow}`;
  const stats = computeStats(points);
  const chartImgSrc = chartImageUrl(generatedAt);
  const m = assessment.metrics;
  const color = statusColor(assessment.status);

  const windowLine = assessment.bestWindow
    ? `${formatHm(assessment.bestWindow.startMs)} – ${formatHm(assessment.bestWindow.endMs)} (${assessment.bestWindow.durationHours} h)`
    : "žiadne vhodné okno";
  const curingLine = assessment.bestWindow
    ? `${Math.round((assessment.bestWindow.endMs - assessment.bestWindow.startMs) / 3600_000)} h`
    : "–";
  const nextRainLine = m.hoursUntilRain !== null ? `o ${m.hoursUntilRain.toFixed(0)} h` : "nepredpokladá sa";
  const reasonsHtml =
    assessment.reasons.length > 0
      ? `<p style="margin:12px 0 0;font-size:13px;color:${INK};">${assessment.reasons.map((r) => esc(r)).join(" &middot; ")}</p>`
      : "";

  const terraceLabel =
    assessment.terraceDrying.status === "LIKELY_DRY" ? "Pravdepodobne suchá" : assessment.terraceDrying.status === "DRYING" ? "Vysychá" : "Pravdepodobne mokrá";

  const html = `
  <div style="background:#f4f2ee;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
      <tr>
        <td style="background:${HEADER};padding:20px 28px;">
          <span style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;opacity:0.9;">Zedlitzdorf 74</span>
          <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#ffffff;font-weight:700;">Maľovanie terasy – rozhodnutie</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px 8px;">
          <p style="margin:0 0 16px;font-size:13px;color:${MUTED};">${LOCATION.name} &middot; vygenerované ${niceNow}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${color};border-radius:10px;">
            <tr>
              <td style="padding:16px 18px;">
                <div style="font-size:18px;font-weight:700;color:${color};">${statusIcon(assessment.status)} ${statusLabel(assessment.status)}</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
                  <tr>
                    <td style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${MUTED};padding-right:12px;">Najlepšie okno</td>
                    <td style="font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:${MUTED};">Bezdažďový čas na vyschnutie</td>
                  </tr>
                  <tr>
                    <td style="font-size:15px;font-weight:600;color:${INK};padding-right:12px;">${windowLine}</td>
                    <td style="font-size:15px;font-weight:600;color:${INK};">${curingLine}</td>
                  </tr>
                </table>
                ${reasonsHtml}
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
            <tr>
              <td width="50%" style="vertical-align:top;padding-right:10px;">
                <div style="font-size:13px;font-weight:700;color:${INK};margin-bottom:4px;">Zrážky</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${statRow("Posledných 24 h", `${m.recentRainMm24h.toFixed(1)} mm`)}
                  ${statRow("Ďalších 12 h", `${m.upcomingRainMm12h.toFixed(1)} mm`)}
                  ${statRow("Ďalších 24 h", `${m.upcomingRainMm24h.toFixed(1)} mm`)}
                  ${statRow("Ďalší dážď", nextRainLine)}
                  ${statRow("Pravdep. zrážok (12 h)", m.rainProbability12h?.label ?? "nedostupné")}
                </table>
              </td>
              <td width="50%" style="vertical-align:top;padding-left:10px;">
                <div style="font-size:13px;font-weight:700;color:${INK};margin-bottom:4px;">Podmienky</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${statRow("Teplota", m.temperatureC !== null ? `${m.temperatureC.toFixed(1)} °C` : "–")}
                  ${statRow("Vlhkosť", m.relativeHumidity !== null ? `${m.relativeHumidity.toFixed(0)} %` : "–", m.relativeHumidity !== null ? colorForHumidity(m.relativeHumidity) : undefined)}
                  ${statRow("T − Td", m.dewPointSpreadC !== null ? `${m.dewPointSpreadC >= 0 ? "+" : ""}${m.dewPointSpreadC.toFixed(1)} °C` : "–", m.dewPointSpreadC !== null ? colorForDewPointSpread(m.dewPointSpreadC) : undefined)}
                  ${statRow("Vietor / nárazy", `${m.windSpeedKmh !== null ? m.windSpeedKmh.toFixed(0) : "–"} / ${m.windGustKmh !== null ? m.windGustKmh.toFixed(0) : "–"} km/h`)}
                  ${statRow("Vysychanie", `${m.dryingScore}/100 – ${dryingScoreLabel(m.dryingScore)}`)}
                  ${statRow("Stav terasy", assessment.manualWoodMoisture ? `${assessment.manualWoodMoisture.percent.toFixed(0)} % (nameraná)` : terraceLabel)}
                </table>
              </td>
            </tr>
          </table>

          <div style="margin:20px 0 6px;font-size:12px;color:${MUTED};">
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#2a78d6;margin-right:5px;"></span>Zrážky
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#d9622a;margin-right:5px;"></span>Teplota
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#8a5fb0;margin-right:5px;"></span>Rosný bod
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#3f9e89;margin-right:5px;"></span>Vlhkosť
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#e0b430;margin-right:5px;"></span>Slnko
            &nbsp;&nbsp;
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#4d8790;margin-right:5px;"></span>Vietor
          </div>

          <img src="${chartImgSrc}" width="${CHART_WIDTH}" alt="Podrobný graf: zrážky, teplota, rosný bod, vlhkosť, slnečné žiarenie, vietor" style="width:100%;max-width:${CHART_WIDTH}px;height:auto;display:block;border-radius:8px;border:1px solid ${BORDER};" />

          <p style="margin:14px 0 0;font-size:12px;color:${MUTED};line-height:1.4;">
            Súčet zrážok za celé okno: ${stats.totalPrecipMm.toFixed(1)} mm. Ide len o odhad na základe meteorologických dát – pred aplikáciou vždy overte, že je povrch dreva skutočne suchý.
          </p>

          <p style="margin:20px 0 0;font-size:13px;color:${MUTED};">
            Automatický report zo <a href="https://sb8691.github.io/ztlzdrf/" style="color:${HEADER};text-decoration:none;font-weight:600;">Zedlitzdorf 74 weather dashboardu</a>.
          </p>
        </td>
      </tr>
    </table>
  </div>
  `;
  return { subject, html };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendAlert(points: WeatherPoint[], generatedAt: Date, assessment: PaintingAssessment, config: EmailConfig): Promise<void> {
  const { subject, html } = renderAlertEmail(points, generatedAt, assessment);
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
