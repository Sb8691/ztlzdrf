import test from "node:test";
import assert from "node:assert/strict";
import { hourlySums, parseEhyd, parseSmet } from "./parsers.js";
import { addDays, inOperatingWindow, seasonOf } from "./season.js";

/* Fixtures are cut from real downloads of 3 Oct 2026 (eHYD NS-Tagessummen-123133.csv, LWD
 * 2900265_12m.smet) - only shortened, never edited. */

const EHYD = `Messstelle:                ;Turracher Höhe
HZB-Nummer:                ;123133
Höhe:
 gültig seit:              ;Höhe [m ü.A.]:
  01.01.1998               ;1777
Exportzeitreihe:           ;Neuschnee,I,Sum,T,1,O,Z,0,,,
Exportzeitraum:            ;01.09.1970 07:00; bis ;01.09.2023 07:00
Hinweis:                   ;Der Intervallwert gilt bis zum nächsten Zeitpunkt mit einem Wert oder Lücke
Hinweis:                   ;Messwert=0,001 - Messwert kleiner als 0,5cm
Werteformat:               ;0 Nachkommastellen
Einheit:                   ;cm
Werte:
01.09.1998 07:00:00   ;     0
02.09.1998 07:00:00   ;     0
03.09.1998 07:00:00   ;Lücke
04.09.1998 07:00:00   ;    12,5
31.08.2023 07:00:00   ;     0,001
01.09.2023 07:00:00   ;Lücke
`;

test("eHYD: hlavička, značky ako sú, čiarkové desatinné čísla, Lücke = null", () => {
  const s = parseEhyd(EHYD);
  assert.equal(s.header["HZB-Nummer"], "123133");
  assert.equal(s.header["Einheit"], "cm");
  assert.match(s.header["Hinweis"], /Intervallwert .* \| Messwert=0,001/);
  assert.deepEqual(s.stamps, ["1998-09-01T07:00", "1998-09-02T07:00", "1998-09-03T07:00", "1998-09-04T07:00", "2023-08-31T07:00", "2023-09-01T07:00"]);
  assert.deepEqual(s.values, [0, 0, null, 12.5, 0.001, null]);
});

test("hodinové sumy z 5-minútových hodnôt: 12 hodnôt na hodinu, medzera robí hodinu null", () => {
  const stamps: string[] = [];
  const values: (number | null)[] = [];
  for (let m = 0; m < 60; m += 5) { stamps.push(`2020-01-01T06:${String(m).padStart(2, "0")}`); values.push(0.1); }
  for (let m = 0; m < 60; m += 5) { stamps.push(`2020-01-01T07:${String(m).padStart(2, "0")}`); values.push(m === 30 ? null : 0.2); }
  for (let m = 0; m < 55; m += 5) { stamps.push(`2020-01-01T08:${String(m).padStart(2, "0")}`); values.push(0); }
  const h = hourlySums(stamps, values);
  assert.deepEqual(h.stamps, ["2020-01-01T06:00", "2020-01-01T07:00", "2020-01-01T08:00"]);
  assert.deepEqual(h.values, [1.2, null, null]);
});

const SMET = `SMET 1.1 ASCII
[HEADER]
station_id = 2900265
station_name = turracherhoehe
latitude = 46.9195000
longitude = 13.8731000
altitude = 1795.0000
nodata = -777
tz = +01
fields = timestamp\tTA\tRH\tVW\tDW\tVW_MAX\tHS\tISWR

[DATA]
2025-10-13T06:50:00\t275.85\t-7.77\t-777\t-777\t-777\t-7.77\t-777
2025-10-13T10:40:00\t283.25\t0.597\t0.48\t93\t1.85\t0.154\t585
2026-10-03T21:20:00\t277.35\t0.994\t0\t225\t0\t0\t0
`;

test("SMET: polia z hlavičky, nodata -777 aj škálované -7.77 sú null, nuly ostávajú nulami", () => {
  const s = parseSmet(SMET);
  assert.equal(s.header.tz, "+01");
  assert.deepEqual(s.fields, ["TA", "RH", "VW", "DW", "VW_MAX", "HS", "ISWR"]);
  assert.equal(s.stamps.length, 3);
  assert.deepEqual(s.rows[0], [275.85, null, null, null, null, null, null]);
  assert.deepEqual(s.rows[1], [283.25, 0.597, 0.48, 93, 1.85, 0.154, 585]);
  assert.deepEqual(s.rows[2], [277.35, 0.994, 0, 225, 0, 0, 0]);
});

test("sezóna sa volá podľa začiatku zimy; sezóna prevádzky 1. 12. – 15. 4. vrátane", () => {
  assert.equal(seasonOf("2024-08-01"), "2024/25");
  assert.equal(seasonOf("2025-07-31"), "2024/25");
  assert.equal(seasonOf("2025-08-01"), "2025/26");
  assert.equal(seasonOf("2000-01-15"), "1999/00");
  assert.equal(inOperatingWindow("2024-11-30"), false);
  assert.equal(inOperatingWindow("2024-12-01"), true);
  assert.equal(inOperatingWindow("2025-04-15"), true);
  assert.equal(inOperatingWindow("2025-04-16"), false);
  assert.equal(addDays("2024-02-28", 2), "2024-03-01");
});
