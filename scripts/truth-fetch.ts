/**
 * Downloads the history that serves as truth (npm run truth:fetch) and stores one parsed JSON per
 * source under ~/.cache/ztlzdrf/derived/. Raw responses are cached by URL, so a re-run is free;
 * nothing here touches the repository.
 *
 * Phases (--only=a,b to restrict): geosphere (daily + hourly stations), grids (SNOWGRID and
 * SPARTACUS at every point), inca (hourly INCA at every point, winters only), ehyd (Turracher Höhe,
 * Falkert and any station added in scripts/lib/points.ts), lwd (the LWD Kärnten SMET files: a dated
 * copy of the rolling 12-month file is kept per download so the archive grows season by season).
 *
 * Conventions written into the derived files:
 *   - station daily values keep the source's own date stamp; how a stamp maps onto the 24 h window
 *     is settled in scripts/truth-report.ts (alignment test), not here;
 *   - missing is null, never 0; GeoSphere's -1 for "no snow" is kept as -1 (the report turns it into
 *     0 cm where that is the documented meaning).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { CACHE_DIR, cachePath, fetchCached, fetchJsonCached, fetchTextCached, stats, writeDerived } from "./lib/cache.js";
import { hourlySums, parseEhyd, parseSmet } from "./lib/parsers.js";
import { addDays } from "./lib/season.js";
import { EHYD_EXTRA, EHYD_INFO, EHYD_STATIONS, GEOSPHERE_HUB, GEOSPHERE_STATIONS, LWD_SMET, LWD_STATIONS, RESORT_POINTS, type Point } from "./lib/points.js";

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = addDays(TODAY, -1);
const FIRST_SEASON_START = 1998; // eHYD Turracher Höhe begins 1998-09
const ONE_DAY_MS = 86_400_000;

const only = new Set((process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "geosphere,grids,inca,ehyd,lwd").split(","));

/** Rolling sources: a request whose window reaches into the last two weeks is refreshed daily. */
function freshness(end: string): { maxAgeMs?: number } {
  return end >= addDays(TODAY, -14) ? { maxAgeMs: ONE_DAY_MS } : {};
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------
// GeoSphere stations
// ---------------------------------------------------------------------------

interface GsFeature { properties: { station: string | number; parameters: Record<string, { data: unknown[]; unit?: string }> } }
interface GsResponse { timestamps: string[]; features: GsFeature[] }
interface GsStationMeta { id: string | number; name: string; lat: number | string; lon: number | string; altitude: number | string; valid_from?: string; valid_to?: string }

async function geosphereStationMeta(): Promise<Point[]> {
  const meta = await fetchJsonCached<{ stations: GsStationMeta[] }>(`${GEOSPHERE_HUB}/station/historical/klima-v2-1d/metadata`, { maxAgeMs: 30 * ONE_DAY_MS, label: "GeoSphere metadata" });
  return GEOSPHERE_STATIONS.map((s) => {
    const m = meta.stations.find((x) => String(x.id) === String(s.id));
    if (!m) throw new Error(`GeoSphere station ${s.id} (${s.name}) not in klima-v2-1d metadata`);
    return { id: `geosphere:${s.id}`, name: s.name, latitude: Number(m.lat), longitude: Number(m.lon), elevation: Number(m.altitude) };
  });
}

/** One dataset for a set of stations over [start, end], merged over chunks into per-station series. */
async function geosphereStations(dataset: string, params: string[], ids: number[], chunks: [string, string][], label: string) {
  const series: Record<string, { timestamps: string[]; values: Record<string, (number | null)[]>; units: Record<string, string> }> = {};
  for (const [start, end] of chunks) {
    const url = `${GEOSPHERE_HUB}/station/historical/${dataset}?parameters=${params.join(",")}&station_ids=${ids.join(",")}&start=${start}&end=${end}`;
    const r = await fetchJsonCached<GsResponse>(url, { ...freshness(end), minIntervalMs: 800, label: `${label} ${start}..${end}` });
    for (const f of r.features) {
      const key = String(f.properties.station);
      const s = (series[key] ??= { timestamps: [], values: Object.fromEntries(params.map((p) => [p, []])), units: {} });
      s.timestamps.push(...r.timestamps);
      for (const p of params) {
        const col = f.properties.parameters[p];
        s.values[p].push(...(col ? col.data.map(num) : r.timestamps.map(() => null)));
        if (col?.unit) s.units[p] = col.unit;
      }
    }
  }
  return series;
}

function yearChunks(firstStart: string, lastEnd: string, years: number): [string, string][] {
  const out: [string, string][] = [];
  for (let y = Number(firstStart.slice(0, 4)); y <= Number(lastEnd.slice(0, 4)); y += years) {
    const s = `${y}${firstStart.slice(4)}`;
    const e = `${Math.min(y + years, Number(lastEnd.slice(0, 4)) + 1)}${firstStart.slice(4)}`;
    out.push([s < firstStart ? firstStart : s, e > lastEnd ? lastEnd : addDays(e, -1)]);
  }
  return out;
}

/** Winters (Nov 1 .. Apr 30) from the given start year to the current one, split into months. */
function winterMonths(firstStart: number): [string, string][] {
  const out: [string, string][] = [];
  const lastStart = Number(TODAY.slice(5, 7)) >= 8 ? Number(TODAY.slice(0, 4)) : Number(TODAY.slice(0, 4)) - 1;
  for (let y = firstStart; y <= lastStart; y++) {
    for (const [yy, m] of [[y, 11], [y, 12], [y + 1, 1], [y + 1, 2], [y + 1, 3], [y + 1, 4]] as const) {
      const start = `${yy}-${String(m).padStart(2, "0")}-01`;
      const end = addDays(`${m === 12 ? yy + 1 : yy}-${String((m % 12) + 1).padStart(2, "0")}-01`, -1);
      if (start > YESTERDAY) break;
      out.push([start, end > YESTERDAY ? YESTERDAY : end]);
    }
  }
  return out;
}

async function phaseGeosphere(points: Point[]): Promise<void> {
  console.log("== GeoSphere stations");
  const ids = GEOSPHERE_STATIONS.map((s) => s.id);
  const daily = await geosphereStations(
    "klima-v2-1d",
    ["shneu_manu", "sh_manu", "sh", "rr", "ffx", "so_h", "tlmax", "tlmin", "tl_mittel"],
    ids,
    yearChunks(`${FIRST_SEASON_START}-08-01`, YESTERDAY, 7),
    "klima-v2-1d"
  );
  writeDerived("geosphere-daily.json", { fetchedAt: TODAY, stations: points, series: daily });
  const hourlyIds = GEOSPHERE_STATIONS.filter((s) => s.auto).map((s) => s.id);
  const hourly = await geosphereStations(
    "klima-v2-1h",
    ["sh", "rr", "ffx", "ff", "tl", "rf", "so_h"],
    hourlyIds,
    winterMonths(2022).map(([s, e]) => [`${s}T00:00`, `${e}T23:00`] as [string, string]),
    "klima-v2-1h"
  );
  writeDerived("geosphere-hourly.json", { fetchedAt: TODAY, series: hourly });
  console.log(`   daily stations ${Object.keys(daily).length}, hourly stations ${Object.keys(hourly).length}`);
}

// ---------------------------------------------------------------------------
// GeoSphere grids (point extracts)
// ---------------------------------------------------------------------------

interface GsGridFeature { geometry: { coordinates: [number, number] }; properties: { parameters: Record<string, { data: unknown[]; unit?: string }> } }

async function gridAtPoints(dataset: string, params: string[], points: Point[], chunks: [string, string][], label: string) {
  const perPoint: Record<string, { pixel: [number, number]; timestamps: string[]; values: Record<string, (number | null)[]>; units: Record<string, string> }> = {};
  const latLon = points.map((p) => `lat_lon=${p.latitude},${p.longitude}`).join("&");
  for (const [start, end] of chunks) {
    const url = `${GEOSPHERE_HUB}/timeseries/historical/${dataset}?parameters=${params.join(",")}&start=${start}&end=${end}&${latLon}`;
    const r = await fetchJsonCached<{ timestamps: string[]; features: GsGridFeature[] }>(url, { ...freshness(end), minIntervalMs: 800, label: `${label} ${start}..${end}` });
    if (r.features.length !== points.length) throw new Error(`${dataset}: ${r.features.length} features for ${points.length} points`);
    r.features.forEach((f, i) => {
      const p = points[i];
      const s = (perPoint[p.id] ??= { pixel: f.geometry.coordinates, timestamps: [], values: Object.fromEntries(params.map((q) => [q, []])), units: {} });
      s.timestamps.push(...r.timestamps);
      for (const q of params) {
        const col = f.properties.parameters[q];
        s.values[q].push(...(col ? col.data.map(num) : r.timestamps.map(() => null)));
        if (col?.unit) s.units[q] = col.unit;
      }
    });
  }
  return perPoint;
}

async function phaseGrids(points: Point[]): Promise<void> {
  console.log("== GeoSphere grids: SNOWGRID + SPARTACUS (daily)");
  const chunks = yearChunks(`${FIRST_SEASON_START}-08-01`, YESTERDAY, 10);
  const snowgrid = await gridAtPoints("snowgrid_cl-v2-1d-1km", ["snow_depth", "swe_tot"], points, chunks, "snowgrid");
  writeDerived("snowgrid-daily.json", { fetchedAt: TODAY, points, series: snowgrid });
  const spartacus = await gridAtPoints("spartacus-v2-1d-1km", ["RR", "SA", "TX", "TN"], points, chunks, "spartacus");
  writeDerived("spartacus-daily.json", { fetchedAt: TODAY, points, series: spartacus });
  console.log(`   points ${points.length}`);
}

async function phaseInca(points: Point[]): Promise<void> {
  console.log("== GeoSphere INCA hourly (winters since 2011/12, month by month)");
  const chunks = winterMonths(2011).map(([s, e]) => [`${s}T00:00`, `${e}T23:00`] as [string, string]);
  const inca = await gridAtPoints("inca-v1-1h-1km", ["T2M", "TD2M", "RR", "RH2M", "UU", "VV", "GL"], points, chunks, "inca");
  writeDerived("inca-hourly.json", { fetchedAt: TODAY, points, series: inca });
  console.log(`   points ${points.length}, months ${chunks.length}`);
}

// ---------------------------------------------------------------------------
// eHYD
// ---------------------------------------------------------------------------

/** Export file kinds by eHYD file-name prefix. */
const EHYD_KINDS: Record<string, string> = {
  Stammdaten: "stammdaten",
  "N-Tagessummen": "precipDaily",
  "NS-Tagessummen": "newSnowDaily",
  "SH-Tageswerte": "snowDepthDaily",
  "N-5Minutensummen": "precip5min",
  "LT-Tageswerte": "tempDaily",
};

/** The files a station offers, from the same info call the eHYD map makes. */
async function ehydFiles(hzb: number): Promise<{ kind: string; fileNr: number; fileName: string }[]> {
  const info = await fetchJsonCached<unknown>(`${EHYD_INFO}?hzbnr=${hzb}`, { maxAgeMs: 30 * ONE_DAY_MS, minIntervalMs: 1000, label: `eHYD info ${hzb}` });
  const found: { kind: string; fileNr: number; fileName: string }[] = [];
  (function walk(o: unknown): void {
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (o && typeof o === "object") {
      const r = o as Record<string, unknown>;
      if (typeof r.fileName === "string" && typeof r.fileNr === "number") {
        const kind = EHYD_KINDS[r.fileName.replace(/-\d+\.(csv|txt)(\.gz)?$/, "")];
        if (kind && !found.some((x) => x.kind === kind)) found.push({ kind, fileNr: r.fileNr, fileName: r.fileName });
      }
      Object.values(r).forEach(walk);
    }
  })(info);
  return found;
}


async function phaseEhyd(): Promise<void> {
  console.log("== eHYD");
  for (const st of EHYD_STATIONS) {
    const files = await ehydFiles(st.hzb);
    const out: Record<string, unknown> = { hzb: st.hzb, name: st.name, elevation: st.elevation, latitude: st.latitude, longitude: st.longitude, note: st.note, files: {} };
    for (const { kind, fileNr, fileName } of files) {
      const url = `${EHYD_EXTRA}?id=${st.hzb}&file=${fileNr}`;
      const { body } = await fetchCached(url, { minIntervalMs: 1000, label: `eHYD ${fileName}` });
      const isGz = body[0] === 0x1f && body[1] === 0x8b;
      const text = new TextDecoder("windows-1252").decode(isGz ? gunzipSync(body) : body);
      if (kind === "stammdaten") {
        (out.files as Record<string, unknown>)[kind] = text;
        continue;
      }
      let parsed = parseEhyd(text);
      let storedKind = kind;
      if (kind === "precip5min") {
        parsed = { header: parsed.header, ...hourlySums(parsed.stamps, parsed.values) };
        storedKind = "precipHourly";
      }
      (out.files as Record<string, unknown>)[storedKind] = { fileNr, fileName, header: parsed.header, n: parsed.stamps.length, first: parsed.stamps[0], last: parsed.stamps[parsed.stamps.length - 1], stamps: parsed.stamps, values: parsed.values };
      console.log(`   ${st.name} ${storedKind}: ${parsed.stamps.length} values ${parsed.stamps[0]} → ${parsed.stamps[parsed.stamps.length - 1]} (${parsed.header["Einheit"] ?? "?"})`);
    }
    writeDerived(`ehyd-${st.hzb}.json`, out);
  }
}

// ---------------------------------------------------------------------------
// LWD Kärnten (SMET)
// ---------------------------------------------------------------------------

async function phaseLwd(): Promise<void> {
  console.log("== LWD Kärnten (rolling 12-month SMET, dated copies kept)");
  const dir = cachePath("lwd-ktn", ".keep").replace(/\.keep$/, "");
  for (const st of LWD_STATIONS) {
    const url = `${LWD_SMET}/${st.id}_12m.smet`;
    const { body, fromCache } = await fetchCached(url, { maxAgeMs: ONE_DAY_MS, minIntervalMs: 1500, label: `LWD ${st.name}` });
    const dated = join(dir, `${st.id}_12m_${TODAY}.smet`);
    if (!fromCache || !existsSync(dated)) writeFileSync(dated, body);
    // Merge every dated copy on disk (oldest first) so data that rolled out of the 12-month window stays.
    const copies = readdirSync(dir).filter((f) => f.startsWith(`${st.id}_12m_`) && f.endsWith(".smet")).sort();
    const merged = new Map<string, (number | null)[]>();
    let fields: string[] = [];
    let header: Record<string, string> = {};
    for (const f of copies) {
      const parsed = parseSmet(readFileSync(join(dir, f), "utf8"));
      fields = parsed.fields;
      header = parsed.header;
      parsed.stamps.forEach((t, i) => merged.set(t, parsed.rows[i]));
    }
    const stamps = [...merged.keys()].sort();
    writeDerived(`lwd-${st.id}.json`, { id: st.id, name: st.name, elevation: st.elevation, latitude: st.latitude, longitude: st.longitude, header, fields, copies, stamps, rows: stamps.map((t) => merged.get(t)) });
    console.log(`   ${st.name}: ${copies.length} copies, ${stamps.length} rows ${stamps[0]} → ${stamps[stamps.length - 1]}, fields ${fields.join(",")}`);
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  mkdirSync(join(CACHE_DIR, "derived"), { recursive: true });
  const gsPoints = await geosphereStationMeta();
  const points: Point[] = [
    ...RESORT_POINTS,
    ...EHYD_STATIONS.map((s) => ({ id: `ehyd:${s.hzb}`, name: `eHYD ${s.name}`, latitude: s.latitude, longitude: s.longitude, elevation: s.elevation })),
    ...LWD_STATIONS.map((s) => ({ id: `lwd:${s.id}`, name: `LWD ${s.name}`, latitude: s.latitude, longitude: s.longitude, elevation: s.elevation })),
    ...gsPoints,
  ];
  writeDerived("points.json", points);
  if (only.has("geosphere")) await phaseGeosphere(gsPoints);
  if (only.has("grids")) await phaseGrids(points);
  if (only.has("inca")) await phaseInca(points);
  if (only.has("ehyd")) await phaseEhyd();
  if (only.has("lwd")) await phaseLwd();
  console.log(`Done: ${stats.network} requests over the network (${(stats.bytes / 1e6).toFixed(1)} MB), ${stats.cached} from cache. Derived files in ${join(CACHE_DIR, "derived")}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
