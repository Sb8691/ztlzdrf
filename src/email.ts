import type { WindowResult } from "./types.js";
import { LOCATION } from "./config.js";

export interface EmailConfig {
  apiKey: string;
  to: string;
  from: string;
}

export function renderAlertEmail(result: WindowResult): { subject: string; html: string } {
  const subject = `Terasa: vhodné okno na maľovanie – ${result.candidateStart}`;

  const rows = result.perModel
    .map(
      (m) =>
        `<tr><td>${m.model}</td><td>${m.maxHourlyMm.toFixed(2)} mm/h</td><td>${m.totalMm.toFixed(2)} mm</td></tr>`
    )
    .join("");

  const html = `
    <h2>Vhodné okno na maľovanie terasy</h2>
    <p>Lokalita: ${LOCATION.name}</p>
    <p>Odporúčaný štart maľovania: <strong>${result.candidateStart}</strong> (čas lokálny, ${LOCATION.timezone})</p>
    <p>Súvislé suché okno (24h pred + 12h maľovania + 24h schnutia): ${result.windowStart} &ndash; ${result.windowEnd}</p>
    <p>Porovnanie zrážok podľa modelu v rámci tohto okna:</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>Model</th><th>Max zrážky/h</th><th>Súčet za okno</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
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
