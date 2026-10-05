import { readFileSync } from "node:fs";
import vm from "node:vm";

/**
 * docs/index.html for the ski page: one self-contained file carrying a snapshot of the data, the
 * code that computed it (src/ski-core.js) and the code that draws it (src/ski-ui.js). That is what
 * lets the refresh button do a real fetch on a static host.
 *
 * The content is also rendered here, at build time, by running that very same client code in a vm
 * context - so the page reads fine before (or without) JavaScript, and a generated page and a
 * refreshed one cannot differ. Both scripts are read from disk next to this module (src/ under tsx,
 * dist/ under node); their `export` keywords are stripped because they share one inline scope.
 */

const CLIENT_FILES = ["ski-core.js", "ski-ui.js"];

export function clientBundle(): string {
  const bundle = CLIENT_FILES.map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8").replace(/^export\s+/gm, "")).join("\n");
  if (/^\s*import\s/m.test(bundle)) throw new Error("Klientsky kód nesmie obsahovať import - vkladá sa do jedného rozsahu.");
  if (/<\/script/i.test(bundle)) throw new Error("Klientsky kód obsahuje </script a rozbil by stránku.");
  return bundle;
}

export interface ClientRender {
  renderSki(snapshot: unknown, nowMs: number): string;
  renderMetaText(snapshot: unknown, nowMs: number | null): string;
}

/** The client's pure render functions, evaluated without a DOM (boot() only runs with a document). */
export function clientRender(): ClientRender {
  return vm.runInNewContext(`${clientBundle()}\n;({ renderSki, renderMetaText })`, {}) as ClientRender;
}

const STYLES = `
:root {
  color-scheme: light;
  --page: #f7f7f5; --surface: #ffffff; --text: #1d2125; --muted: #5e6871;
  --hairline: #e3e5e4; --grid: #ebedec; --accent: #2f6fb0;
  --top: #2a78d6; --base: #eb6834; --lift: rgba(42, 120, 214, 0.07); --ref: #8a949c;
  --good: #0ca30c; --fair: #fab219; --bad: #d03b3b;
  --warn-bg: #fdf3e7; --warn-text: #7a4a12;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #14171a; --surface: #1c2024; --text: #e8eaec; --muted: #9aa4ad;
    --hairline: #2b3137; --grid: #272d33; --accent: #6fb1e8;
    --top: #3987e5; --base: #d95926; --lift: rgba(57, 135, 229, 0.10); --ref: #7d8790;
    --warn-bg: #33291a; --warn-text: #e8c489;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0 16px 56px; background: var(--page); color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
}
.sk-wrap { max-width: 1000px; margin: 0 auto; }
a { color: var(--accent); }
header.sk-head { padding: 32px 0 4px; }
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 4px; font-weight: 650; letter-spacing: -0.01em; }
.sk-sub { margin: 0 0 10px; color: var(--muted); }
.sk-meta { margin: 0; font-size: 0.82rem; color: var(--muted); }
.sk-warn, #sk-status {
  margin: 12px 0 0; padding: 10px 12px; border-radius: 8px;
  background: var(--warn-bg); color: var(--warn-text); font-size: 0.88rem;
}
button {
  font: inherit; color: inherit; cursor: pointer;
  background: var(--surface); border: 1px solid var(--hairline); border-radius: 8px;
}
button:focus-visible, summary:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#sk-refresh { margin-top: 14px; padding: 10px 16px; min-height: 44px; font-weight: 550; }
#sk-refresh[disabled] { opacity: 0.6; cursor: progress; }

.sk-section { margin: 34px 0 0; }
.sk-section h2 { margin: 0; font-size: 1.2rem; font-weight: 620; }
.sk-section h2::first-letter { text-transform: uppercase; }
.sk-src { margin: 2px 0 14px; font-size: 0.82rem; color: var(--muted); }
.sk-note { margin: -6px 0 10px; font-size: 0.82rem; color: var(--muted); }

.sk-status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; }
.sk-status i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.sk-good i, i.sk-good { background: var(--good); }
.sk-fair i, i.sk-fair { background: var(--fair); }
.sk-bad i, i.sk-bad { background: var(--bad); }
.sk-none { font-weight: 400; font-style: italic; color: var(--muted); }

.sk-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.sk-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; padding: 14px 14px 10px; }
.sk-card header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.sk-card h3 { margin: 0; font-size: 1rem; font-weight: 620; }
.sk-flag { margin: 8px 0 0; font-size: 0.86rem; }
.sk-why { margin: 4px 0 10px; font-size: 0.86rem; color: var(--muted); }
.sk-card dl { margin: 0; font-size: 0.88rem; }
.sk-card dl div { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-top: 1px solid var(--grid); }
.sk-card dt { color: var(--muted); }
.sk-card dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
.sk-links { display: flex; gap: 18px; margin: 8px 0 0; font-size: 0.88rem; }
.sk-links a { display: inline-block; padding: 6px 0; }

.sk-scroll { overflow-x: auto; }
.sk-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 0.86rem; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; }
.sk-table caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.sk-table th, .sk-table td { padding: 8px 8px; text-align: left; vertical-align: top; border-top: 1px solid var(--grid); }
.sk-table thead th { border-top: 0; font-size: 0.78rem; font-weight: 600; color: var(--muted); }
.sk-table thead th:first-child { width: 3.4rem; }
.sk-table tbody th { font-weight: 600; white-space: nowrap; }
.sk-table td { overflow-wrap: anywhere; }
.sk-table small { display: block; margin-top: 2px; color: var(--muted); font-size: 0.76rem; line-height: 1.35; }
.sk-share { display: flex; gap: 2px; height: 8px; margin: 3px 0 4px; min-width: 48px; }
.sk-seg { border-radius: 2px; min-width: 2px; }
.sk-seg.sk-good { background: var(--good); }
.sk-seg.sk-fair { background: var(--fair); }
.sk-seg.sk-bad { background: var(--bad); }
.sk-prob { display: flex; flex-direction: column; gap: 2px; }
.sk-prob .sk-share { margin: 0; width: 100%; }
.sk-prob b { font-size: 0.82rem; font-weight: 600; white-space: nowrap; }
.sk-card header .sk-prob { flex: none; width: 84px; align-items: flex-end; padding-top: 2px; }
.sk-card header .sk-prob b { font-size: 0.9rem; }
.sk-alert { display: inline-block; padding: 1px 6px; border-radius: 4px; background: var(--top); color: #fff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; vertical-align: 1px; white-space: nowrap; }

.sk-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 8px; font-size: 0.8rem; color: var(--muted); }
.sk-legend i { display: inline-block; width: 14px; height: 10px; margin-right: 6px; vertical-align: -1px; border-radius: 2px; }
.sk-legend i.sk-top { height: 3px; vertical-align: middle; background: var(--top); }
.sk-legend i.sk-base { height: 3px; vertical-align: middle; background: var(--base); }
.sk-legend i.sk-liftkey { background: var(--lift); border: 1px solid var(--hairline); }

details { margin: 10px 0 0; }
summary { cursor: pointer; padding: 8px 0; font-weight: 550; }
.sk-hourly { border-top: 1px solid var(--hairline); }
.sk-svg { display: block; width: 100%; max-width: 560px; height: auto; }
.sk-ptitle { fill: var(--text); font-size: 10px; font-weight: 600; }
.sk-tick, .sk-reflabel { fill: var(--muted); font-size: 9px; }
.sk-grid { stroke: var(--grid); stroke-width: 1; }
.sk-dayline { stroke: var(--hairline); stroke-width: 1; }
.sk-lift { fill: var(--lift); }
.sk-ref { stroke: var(--ref); stroke-width: 1; stroke-dasharray: 4 3; }
.sk-line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.sk-line.sk-top { stroke: var(--top); }
.sk-line.sk-base { stroke: var(--base); }
.sk-bar.sk-top { fill: var(--top); }

.sk-method { margin-top: 30px; padding: 4px 16px 8px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; font-size: 0.88rem; }
.sk-method p, .sk-method ul { margin: 0 0 8px; }
footer { margin: 30px 0 0; padding-top: 18px; border-top: 1px solid var(--hairline); font-size: 0.82rem; color: var(--muted); }
footer p { margin: 0 0 6px; }

@media (max-width: 560px) {
  h1 { font-size: 1.35rem; }
  .sk-table { font-size: 0.8rem; }
  .sk-table th, .sk-table td { padding: 7px 4px; }
  .sk-table thead th:first-child { width: 2.6rem; }
  .sk-status { gap: 4px; }
  .sk-table small { font-size: 0.72rem; }
}
`;

interface SnapshotLike {
  fetchedAtMs: number;
  config: { resorts: { name: string }[] };
}

export function renderSkiPage(snapshot: SnapshotLike): string {
  const client = clientRender();
  // Rendered as of the fetch, so an unchanged snapshot gives a byte-identical page; the browser
  // re-renders against its own clock straight away.
  const main = client.renderSki(snapshot, snapshot.fetchedAtMs);
  const meta = client.renderMetaText(snapshot, null);
  const names = snapshot.config.resorts.map((r) => r.name).join(", ");
  // Escaping "<" keeps any string value from ending the JSON block early.
  const json = JSON.stringify(snapshot).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lyžiarske podmienky</title>
<meta name="description" content="Kde a kedy sa oplatí lyžovať: ${names}. Najbližší deň, 3 dni a 10-dňový výhľad." />
<style>${STYLES}</style>
</head>
<body>
<div class="sk-wrap">
<header class="sk-head">
  <h1>Lyžiarske podmienky</h1>
  <p class="sk-sub">${names.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>
  <p class="sk-meta" id="sk-meta">${meta}</p>
  <p id="sk-status" hidden></p>
  <button type="button" id="sk-refresh">Obnoviť predpoveď</button>
</header>
<main id="sk-main">${main}</main>
<footer>
  <p>Predpoveď nevie, či je stredisko otvorené ani aký je sneh na zjazdovke. Pred cestou pozrite snehovú správu a webkameru.</p>
  <p>Dáta: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (DWD ICON-D2, ECMWF IFS a ensemble).</p>
  <p>Pravdepodobnosti sú kalibrované na meraniach <a href="https://data.hub.geosphere.at/" target="_blank" rel="noopener">GeoSphere Austria</a> (CC BY 4.0) a <a href="https://ehyd.gv.at/" target="_blank" rel="noopener">eHYD</a> (Datenquelle: ehyd.gv.at).</p>
</footer>
</div>
<script type="application/json" id="sk-snapshot">${json}</script>
<script type="module">
${clientBundle()}
</script>
</body>
</html>
`;
}
