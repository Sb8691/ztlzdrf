import { CHART_STYLES, HOVER_SCRIPT, esc } from "./charts.js";

/**
 * The one HTML shell both published pages (docs/index.html and docs/outlook.html) are wrapped in:
 * theme variables (light + dark), the shared card/stat styles, the chart styles and the hover
 * script. Pages only supply their body and their per-chart tooltip datasets.
 */

export const PAGE_STYLES = `
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --muted: #898781;
    --gridline: #e1e0d9;
    --baseline: #c3c2b7;
    --critical: #d03b3b;
    --border: rgba(11,11,11,0.10);
    --series-precip: #2a78d6;
    --series-temp: #d9622a;
    --series-dewpoint: #8a5fb0;
    --series-radiation: #e0b430;
    --series-wind: #4d8790;
    --series-humidity: #3f9e89;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page: #0d0d0d;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --muted: #898781;
      --gridline: #2c2c2a;
      --baseline: #383835;
      --critical: #e66767;
      --border: rgba(255,255,255,0.10);
      --series-precip: #5b9be0;
      --series-temp: #e58a54;
      --series-dewpoint: #a983cf;
      --series-radiation: #e0b430;
      --series-wind: #6ea9b2;
      --series-humidity: #59baa4;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px 16px 64px;
  }
  .wrap { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  .muted { color: var(--text-secondary); font-size: 0.85rem; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin: 16px 0;
    position: relative;
  }
  .panel-title { font-size: 0.95rem; margin: 0 0 10px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .two-col { grid-template-columns: 1fr; } }
  .status-card { border: 2px solid var(--status-color); }
  .status-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .status-icon { font-size: 1.6rem; }
  .status-label { font-size: 1.25rem; font-weight: 700; color: var(--status-color); }
  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 8px; }
  .status-metric-label { font-size: 0.78rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
  .status-metric-value { font-size: 1.15rem; font-weight: 600; margin-top: 2px; }
  .reason-list { margin: 8px 0 0; padding-left: 20px; font-size: 0.88rem; }
  .reason-list li { margin: 3px 0; }
  .stat-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 0.9rem; border-bottom: 1px solid var(--border); }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { color: var(--text-secondary); }
  .stat-value { font-weight: 600; font-variant-numeric: tabular-nums; }
  .drying-score { margin-top: 8px; }
  .score-bar { height: 8px; border-radius: 4px; background: var(--gridline); overflow: hidden; margin-top: 4px; }
  .score-bar-fill { height: 100%; }
  .sun-line { margin: 4px 0 0; }
  .disclaimer { font-size: 0.78rem; color: var(--muted); margin-top: 20px; line-height: 1.4; }
  a { color: inherit; }
  .page-link { display: inline-block; margin-top: 8px; font-weight: 600; font-size: 0.9rem; }
  /* Outlook (target-window) components, shared by the outlook page and the dashboard's link card. */
  .outlook-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 760px) { .outlook-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 420px) { .outlook-grid { grid-template-columns: 1fr; } }
  .day-card { border: 1px solid var(--border); border-left: 4px solid var(--status-color); border-radius: 10px; padding: 12px 14px; background: var(--surface-1); }
  .day-card-date { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
  .day-card-status { font-size: 0.95rem; font-weight: 700; color: var(--status-color); margin: 2px 0 6px; }
  .day-card-prob { font-size: 1.9rem; font-weight: 600; line-height: 1.1; }
  .day-card-prob small { font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-left: 4px; }
  .day-card-trend { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; }
  .day-card .stat-row { font-size: 0.82rem; padding: 3px 0; }
  .outlook-row { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 0.9rem; margin: 6px 0 0; }
  .outlook-row .chip { font-weight: 600; }
  .trend-up { color: var(--series-humidity); }
  .trend-down { color: var(--critical); }
  .table-wrap { overflow-x: auto; }
  .data-table { border-collapse: collapse; font-size: 0.82rem; width: 100%; }
  .data-table th, .data-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .data-table th:first-child, .data-table td:first-child { text-align: left; }
  .data-table th { color: var(--text-secondary); font-weight: 600; }
  details summary { cursor: pointer; color: var(--text-secondary); font-size: 0.85rem; }
`;

export function renderPageShell(o: { title: string; heading: string; subtitle: string; body: string; scripts: string[] }): string {
  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.title)}</title>
<style>
${PAGE_STYLES}
${CHART_STYLES}
</style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(o.heading)}</h1>
    <p class="muted">${o.subtitle}</p>

${o.body}
  </div>
  <script>
    const CHART_DATA = {};
    ${o.scripts.join("\n")}
${HOVER_SCRIPT}
  </script>
</body>
</html>`;
}
