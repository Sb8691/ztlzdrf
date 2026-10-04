import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SKI_CONFIG } from "./config.js";
import { VERIFICATION_STATIONS, appendForecastLog, buildForecastLog, seasonName, stationsUrl } from "./prospective.js";
import { HOUR_MS, addDays, buildSkiSnapshot, localMidnightMs, localTimeMs, powderWindow, requestDates } from "./ski-core.js";

/* The prospective log: one line per fresh fetch, the resorts, the verification stations and the
 * ensemble members' window sums, written so that the season can be scored afterwards. */

const cfg = SKI_CONFIG;
const tz = cfg.timezone;
const DAY = "2027-01-15";
type Fill = (point: number, member: number, ms: number) => Partial<{ temp: number | null; precip: number | null }>;

function response(from: string, to: string, fill: Fill = () => ({}), members = 1, points = 2 * cfg.resorts.length) {
  const times: number[] = [];
  for (let t = localMidnightMs(from, tz); t < localMidnightMs(addDays(to, 1), tz); t += HOUR_MS) times.push(t);
  return Array.from({ length: points }, (_, p) => {
    const hourly: Record<string, (number | null)[]> = { time: times.map((t) => t / 1000) };
    for (let m = 0; m < members; m++) {
      const s = m === 0 ? "" : `_member${String(m).padStart(2, "0")}`;
      const hours = times.map((t) => ({ temp: -5, precip: 0, ...fill(p, m, t) }));
      hourly[`temperature_2m${s}`] = hours.map((h) => h.temp);
      hourly[`precipitation${s}`] = hours.map((h) => h.precip);
      hourly[`wind_gusts_10m${s}`] = hours.map(() => 10);
      hourly[`sunshine_duration${s}`] = hours.map(() => 3600);
    }
    return { latitude: 46.9, longitude: 13.9, elevation: 1500, hourly_units: { temperature_2m: "°C", precipitation: "mm", wind_gusts_10m: "km/h", sunshine_duration: "s" }, hourly };
  });
}

const at = (hour: number, date = DAY) => localTimeMs(date, hour, tz);

function fixtures(fill: Fill = () => ({}), fetchedAtMs = at(10)) {
  const range = (key: "now" | "short" | "long") => requestDates(cfg, key, DAY);
  const data = (key: "now" | "short" | "long", members = 1, points?: number) => response(range(key).startDate, range(key).endDate, fill, members, points);
  const responses = {
    now: { data: data("now"), meta: null },
    short: { data: data("short"), meta: null },
    long: { data: data("long", cfg.horizons.long.expectedMembers), meta: null },
  };
  const stations = { now: data("now", 1, VERIFICATION_STATIONS.length), short: data("short", 1, VERIFICATION_STATIONS.length) };
  return { snapshot: buildSkiSnapshot(responses, cfg, fetchedAtMs), responses, stations };
}

test("sezóna logu: august až júl pod jedným menom", () => {
  assert.equal(seasonName("2026-11-05"), "2026-27");
  assert.equal(seasonName("2027-04-15"), "2026-27");
  assert.equal(seasonName("2027-08-01"), "2027-28");
});

test("stanice sa pýtajú rovnako ako strediská: tie isté premenné, dátumy a výšky staníc", () => {
  const url = new URL(stationsUrl(cfg, "short", DAY));
  assert.equal(url.searchParams.get("elevation"), VERIFICATION_STATIONS.map((s) => s.elevation).join(","));
  assert.equal(url.searchParams.get("models"), cfg.horizons.short.model);
  assert.equal(url.searchParams.get("start_date"), requestDates(cfg, "short", DAY).startDate);
  assert.equal(url.searchParams.get("hourly"), "temperature_2m,precipitation,wind_gusts_10m,sunshine_duration,cloud_cover_low,relative_humidity_2m");
});

test("riadok logu: strediská, stanice a členovia ansámblu; D0 ansámblu bez okna", () => {
  // Member 3 gets 10 mm at the top in the last hour of D+1's window; the control stays dry.
  const w1 = powderWindow(addDays(DAY, 1), cfg);
  const { snapshot, responses, stations } = fixtures((p, m, t) => (p === 0 && m === 3 && t === w1.endMs ? { precip: 10 } : {}));
  const line = buildForecastLog(snapshot, responses, stations, cfg);
  assert.equal(line.v, 1);
  assert.equal(line.firstDate, DAY);
  assert.equal(line.modelVersion, cfg.powder.version);
  assert.deepEqual(Object.keys(line.horizons), ["now", "short", "long"]);
  for (const key of ["now", "short"] as const) {
    const h = line.horizons[key];
    assert.deepEqual(Object.keys(h.resorts), cfg.resorts.map((r) => r.id));
    assert.equal(h.resorts[cfg.resorts[0].id].length, cfg.horizons[key].days);
    assert.ok((h.resorts[cfg.resorts[0].id][0] as { powderSnow: { probability: number } }).powderSnow.probability >= 0);
    assert.deepEqual(Object.keys(h.stations!), VERIFICATION_STATIONS.map((s) => s.id));
    const st = h.stations!["lwd:2900240"];
    assert.equal(st.length, cfg.horizons[key].days);
    assert.equal((st[0] as { powderSnow: { stage: string } }).powderSnow.stage, "alert");
  }
  const long = line.horizons.long;
  assert.equal(long.stations, undefined);
  const days = long.resorts[cfg.resorts[0].id] as { date: string; members: (number | null)[] }[];
  assert.equal(days.length, cfg.horizons.long.days);
  assert.equal(days[0].members.length, cfg.horizons.long.expectedMembers);
  // The ensemble is not fetched before the first day, so D0's window (from the day before) is unknown.
  assert.ok(days[0].members.every((v) => v === null));
  assert.equal(days[1].members[3], 7);
  assert.equal(days[1].members[0], 0);
  assert.ok(JSON.stringify(line).length < 60_000, "riadok musí ostať malý, pribúda trikrát denne");
});

test("bez staníc sa riadok zapíše aj tak; rovnaké načítanie sa nezdvojí; súbor podľa sezóny", () => {
  const { snapshot, responses } = fixtures();
  const line = buildForecastLog(snapshot, responses, null, cfg);
  assert.equal(line.horizons.short.stations, undefined);
  const dir = mkdtempSync(join(tmpdir(), "ztlzdrf-log-"));
  const first = appendForecastLog(line, dir);
  assert.equal(first.written, true);
  assert.match(first.path, /2026-27\.jsonl$/);
  assert.equal(appendForecastLog(line, dir).written, false);
  const later = buildForecastLog(fixtures(() => ({}), at(16)).snapshot, responses, null, cfg);
  assert.equal(appendForecastLog(later, dir).written, true);
  const lines = readFileSync(first.path, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).fetchedAtMs, at(16));
});
