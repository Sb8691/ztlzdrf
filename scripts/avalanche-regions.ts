/**
 * Step 9 (npm run regions, METODIKA §4.8): which EAWS micro-region each lift station lies in, from
 * the official region polygons (regions.avalanches.org, the geodata every bulletin map is drawn
 * with), and whether `avalancheRegion` in src/config.ts still agrees with the top stations.
 *
 * The page never needs the polygons - it carries the region ids - but the regions change between
 * seasons (every polygon has a start and an end date, Kärnten's were last redrawn for 2022/23 and
 * 2025/26), so this is the check to run before a winter. Exit code 1 on a mismatch.
 */
import { SKI_CONFIG } from "../src/config.js";
import { fetchCached } from "./lib/cache.js";

/** Kärnten, and Styria for Turracher Höhe's valley station, which lies across the border. */
const SETS = ["AT-02", "AT-06"];
const regionsUrl = (set: string) => `https://regions.avalanches.org/micro-regions/${set}_micro-regions.geojson.json`;
const DAY_MS = 86_400_000;

type Position = [number, number];
type Ring = Position[];
interface Feature {
  properties: { id: string; start_date?: string | null; end_date?: string | null };
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
}

/** Ray casting on one ring (lon/lat as plain numbers - the regions are small, the stations well inside). */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inFeature(lon: number, lat: number, f: Feature): boolean {
  const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polygons.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)));
}

/** A polygon in force on `isoDate`: started by then and not yet ended. */
function current(f: Feature, isoDate: string): boolean {
  const p = f.properties;
  return (!p.start_date || p.start_date <= isoDate) && (!p.end_date || p.end_date > isoDate);
}

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const features: Feature[] = [];
  for (const set of SETS) {
    const { body, fromCache } = await fetchCached(regionsUrl(set), { maxAgeMs: 7 * DAY_MS, label: `regióny ${set}`, verbose: false });
    const parsed = JSON.parse(body.toString("utf8")) as { features: Feature[] };
    console.log(`${set}: ${parsed.features.length} polygónov${fromCache ? " (z cache)" : ""}`);
    features.push(...parsed.features);
  }
  let mismatches = 0;
  for (const r of SKI_CONFIG.resorts) {
    const at = (p: { latitude: number; longitude: number }) => features.filter((f) => current(f, today) && inFeature(p.longitude, p.latitude, f)).map((f) => f.properties.id);
    const top = at(r.top);
    const base = at(r.base);
    const ok = top.includes(r.avalancheRegion);
    if (!ok) mismatches++;
    console.log(`${r.name}: horná stanica ${top.join(", ") || "–"}, dolná stanica ${base.join(", ") || "–"}; config ${r.avalancheRegion} ${ok ? "sedí" : "NESEDÍ"}`);
  }
  if (mismatches) {
    console.error(`${mismatches} stredisk(o/á) má v src/config.ts iný región, než v ktorom leží horná stanica.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
