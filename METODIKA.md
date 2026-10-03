# METODIKA – presná predpoveď lyžovačky a POWDER ALERT

Živý dokument k logickému modelu stránky **ztlzdrf** (štyri strediská v Nockbergoch). Prečítať na
začiatku každej session. Kód a commity sú po anglicky, tento dokument po slovensky. Dátumy sú
absolútne.

## 1. Definície

- **D0** = najbližší lyžiarsky deň (po 16:00 zajtrajšok, `firstSkiDate`). Horizont D0 až D+9. Lanovky
  09:00–16:00, Europe/Vienna.
- **Deň merania D** = 24 h končiacich ranným termínom dňa D (06 UTC = 07:00 SEČ). Tak čítame ručný nový
  sneh eHYD a GeoSphere aj rozdiel výšky snehu LWD. V produkte je okno D−1 09:00 → D 09:00 na hornej
  stanici; z bodov merania sa prenášajú len korekcie nezávislé od miesta.
- **POWDER_SNEH** = aspoň **15 cm nového snehu za 24 h** v bode merania (overiteľné jadro).
- **POWDER ALERT** = POWDER_SNEH, ktorý je suchý, nezničený vetrom a lanovky pôjdu (prahy z literatúry,
  nefitujú sa). Značky „fresh tracks“ a „bluebird powder“. Stupne ALERT (D0–D+1), POZOR (D+2–D+3),
  VÝHĽAD (D+4–D+9).
- **Super lyžovačka** = bez dažďa na zjazdovkách počas lanoviek, nárazy hore pod prahom (40 / 60 km/h),
  horná stanica väčšinu dňa mimo oblaku, dobrý povrch. Kalibrujú sa len zložky s pravdou.
- **Sezóna** = zima pomenovaná podľa začiatku (2024/25 = august 2024 až júl 2025).
- **Sezóna prevádzky** (predpoklad) = 1. 12. – 15. 4.
- **Deň so snehovou pokrývkou** (predpoklad) = výška snehu v bode merania po sneženi ≥ 30 cm
  (citlivosť sa uvádza pre 20 a 50 cm).
- **Nezávislá búrka** = súvislé dni merania s ≥ 15 cm zlúčené do jednej udalosti.
- **Predstih** = hodiny od zverejnenia behu (nie od inicializácie) do konca okna udalosti.

## 2. Rozhodnutia a predpoklady (denník)

| Dátum | Rozhodnutie / predpoklad | Kto |
|---|---|---|
| 3. 10. 2026 | POWDER = ≥ 15 cm / 24 h; stupne ALERT / POZOR / VÝHĽAD; najprv len POWDER_SNEH pre D0–D+2 | majiteľ (prompt) |
| 3. 10. 2026 | Krok 0: audit dát bez zmien v repozitári; výsledok v `~/.cache/ztlzdrf/audit-2026-10-03/` | Fable |
| 3. 10. 2026 | LWD Kärnten: dáta používať, majiteľ píše LWD so žiadosťou o súhlas; kópia ostáva mimo verejného repozitára (`~/.cache/ztlzdrf/lwd-ktn/`) | majiteľ |
| 3. 10. 2026 | Návrh pravdy z auditu schválený (sekcia 3.6); hľadať ďalšie stanice eHYD pri strediskách | majiteľ |
| 3. 10. 2026 | Predpoklady kroku 1: sezóna prevádzky 1. 12. – 15. 4.; pokrývka = HS ≥ 30 cm; búrka = súvislé dni ≥ 15 cm | Fable |
| 3. 10. 2026 | Surové dáta v `~/.cache/ztlzdrf/` (prepísateľné cez `ZTLZDRF_CACHE`), do gitu len malé odvodené JSON | Fable |

## 3. Dáta – audit (krok 0, 3. 10. 2026)

### 3.1 Archívy predpovedí (Open-Meteo)

| API | Model | Archív od | Čo má / nemá | Poznámka |
|---|---|---|---|---|
| Single Runs (`single-runs-api`) | IFS 9 km `ecmwf_ifs` | **2024-03-14 00z** (13. 3. chýba) | T, zrážky, snowfall, nárazy, wet-bulb, rosný bod, nízka oblačnosť, slnko; **bez** nulovej izotermy, 700 hPa, snowfall_height | 00z/12z 360 h, 06z/18z 144 h |
| Single Runs | IFS 0,25° `ecmwf_ifs025` | – | beh 2024-12-01 ani 2026-01-10 nie je | pre backtest nepoužiteľný |
| Single Runs | ICON-D2, AROME, ICON-CH2 | **2026-04-02** (1. 3. 2026 chýba) | | bez zimného archívu |
| Single Runs | ICON-EU, GFS | nie (testované 3/2026, 1/2025) | | |
| Previous Runs | ICON-D2 | **2024-01-19 15:00**, len N = 1 | snowfall, zrážky, T, nárazy, wet-bulb, slnko; **bez** nulovej izotermy, nízkej oblačnosti, snowfall_height | overené aj 1/2026 |
| Previous Runs | ICON-EU | 2024-01-19 (N = 1), N = 4 od 2024-01-22, N = 5 nie | | |
| Previous Runs | IFS 0,25° | 2024-02-03 (N = 1), N = 7 od 2024-02-09 | len zrážky a T; **bez** snowfall a nárazov | |
| Previous Runs | IFS 9 km | – (0 hodnôt) | | |
| Previous Runs | GFS | zrážky od 2024-01-19; snowfall medzi 10/2024 a 12/2024 | | |
| Previous Runs | ICON-CH2 | 2025-07-04 (N = 1–4) | | |
| Previous Runs | ICON-2I | medzi 10. 4. a 1. 5. 2025 (N = 1–2) | | |
| Previous Runs | AROME | nárazy 2026-03-25, zrážky 26. 3., snowfall až 30. 3. 2026 | | |
| Historical Forecast | IFS 9 km | 2017-01-01 | + wet-bulb, rosný bod, nízka oblačnosť, slnko, weather_code; bez nulovej izotermy a 700 hPa | zošité prvé hodiny behov |
| Historical Forecast | ICON-D2 | 2022-11-13 14:00 | **má nulovú izotermu** aj nízku oblačnosť | |
| Historical Forecast | ICON-EU | 1/2023 áno, 10.–20. 11. 2022 prázdne (docs: 2022-11-24) | | |
| Historical Forecast | GFS | 2021-03-23 | | |
| Historical Forecast | IFS 0,25° | 2024-02-03 | len T a zrážky | |
| Historical Forecast | ICON-CH2 | 2025-07-03 (s nulovou izotermou) | | |
| Historical Forecast | AROME | 2026-03-24 | | |
| Historical Forecast | **`ecmwf_ifs025_ensemble_mean`** (model id) | **2026-02-20 12:00** | T, zrážky, snowfall, nárazy ako priemer ENS | model `*_ensemble_spread` neexistuje; `ecmwf_ifs025_ensemble` (členovia) vracia len null |
| Ensemble API | všetky | členovia len ~4 dni dozadu (prvá hodnota 2026-09-29 22:00 pri past_days=10) | | archív členov neexistuje → vlastný log |
| Satellite API | SARAH-3 `eumetsat_sarah3` | 1983, oneskorenie ~2 dni (posledný deň 1. 10.) | SIS, priame žiarenie, sunshine_duration | pixel 0,05° |
| Satellite API | `satellite_radiation_seamless` | len nové produkty (1/2023 aj 1/2026 prázdne), dnes do 20:00 UTC | | DWD MTG od 2/2026, 0,025°, 10 min (docs); id `dwd_sis` neexistuje |
| Archive API | ERA5, CERRA, IFS analýza | 1940 / 1985–2021 / 2017 | ERA5-Land bez zrážok | hrubé bunky |

### 3.2 Živé predpovede (4 horné stanice, `elevation=nan`)

| Model | Horizont | Navyše oproti základu | Bunka: BKK 2043 / Falkert 2107 / Turracher 2197 / Hochrindl 1832 m |
|---|---|---|---|
| ICON-D2 | 67 h | nulová izoterma, snowfall_height, 800 + 700 hPa, viditeľnosť | 1742 / 1886 / 1962 / 1557 |
| AROME (GeoSphere) | 76 h | snowfall_height; **bez** nulovej izotermy, hladín, viditeľnosti | 1623 / 1900 / 1823 / 1468 |
| ICON-CH1 | 52 h | nulová izoterma | **1962 / 2018 / 2070 / 1686** (najbližšie k staniciam) |
| ICON-CH2 | 133 h | nulová izoterma | 1765 / 1934 / 1823 / 1607 |
| ICON-2I | 85 h | nulová izoterma, 700 hPa | 1880 / 1722 / 1993 / 1607 |
| ICON-EU | 133 h | nulová izoterma, 800 + 700 hPa, viditeľnosť | 1427 / 1580 / 1807 / 1278 |
| IFS 9 km | 373 h | viditeľnosť, BLH; bez nulovej izotermy/hladín/snowfall_height | 1357 / 1716 / 1864 / 1519 |
| IFS 0,25° | 375 h | 700 hPa; bez nulovej izotermy | 1143 / 1143 / 1618 / 1014 |
| GFS | 384 h | nulová izoterma, hladiny, viditeľnosť | 1416 / 1702 / 1702 / 1280 |

Všetky majú snowfall, snowfall_water_equivalent, wet_bulb, rosný bod, nízku a strednú oblačnosť, slnko,
weather_code. Oprava promptu: nulovú izotermu majú aj ICON-EU a GFS; 800 + 700 hPa aj ICON-EU a GFS.

Ensembly (členov / horizont): ENS 0,25° 51 / 360 h (má nízku oblačnosť, nie nulovú izotermu);
`ecmwf_ifs_europe_ensemble` 51 / **144 h** (bez nízkej oblačnosti); AIFS 51 / 366 h; ICON-D2-EPS 20 / 66 h;
ICON-EU-EPS 40 / 132 h; ICON-CH1-EPS 11 / 48–50 h a ICON-CH2-EPS 21 / ~126 h (oba s nulovou izotermou aj
nízkou oblačnosťou); GEFS 31 / 252 h; UKMO 18 / 258 h; GEM 21 / 384 h.

Oneskorenie zverejnenia (meta.json, jedna vzorka, dostupnosť − inicializácia): IFS 9 km 6,5 h; IFS 0,25°
7,8 h; **ENS 0,25° 10,2 h**; AIFS-ENS 9,5 h; ICON-D2 1,4 h (EPS 2,5 h); ICON-EU 2,9 h (EPS 3,3 h); AROME
3,5 h; ICON-CH1 1,9 h; ICON-CH2 3,0 h; ICON-2I 2,1 h; GFS 6,0 h; GEFS 5,7 h. Pri predstihu treba brať beh,
ktorý bol v čase behu CI (04:13 / 10:13 / 16:13 UTC) už zverejnený – pri IFS 00z je to až po ~06:30 UTC,
takže beh CI o 04:13 má k dispozícii IFS 12z z predošlého dňa a ENS 06z/12z z predošlého dňa.

### 3.3 Pravda – zdroje

| Zdroj | Stanice / pixel | Obdobie | Premenné | Formát, prístup, CORS | Licencia |
|---|---|---|---|---|---|
| **eHYD** (HD Steiermark) | Turracher Höhe HZB 123133, 1 777 m, 46°55'11" N 13°52'46" E (Bessel), ~1 km od stanice LWD | nový sneh a výška snehu **1. 9. 1998 – 31. 8. 2023** o 07:00; zrážky denné 1998–2023 (+ **5-min zrážky**, gz 3,8 MB); denná T 1998–2023 | ručný nový sneh (doska), výška snehu (ručne, od 2012 ultrazvuk), zrážky (od 2007 váha), T | `…/nlv?id=123133&file=N`: 1 Stammdaten, 2 N-Tagessummen, 3 NS-Tagessummen, 4 SH-Tageswerte, 5 N-5Minutensummen.csv.gz, 6 LT-Tageswerte (7, 8 prázdne); CP1252, `;`, „Lücke“, 0,001 = < 0,5 cm; **bez CORS** | CC BY 4.0, uvádzať „Datenquelle: ehyd.gv.at“ |
| eHYD (HD Kärnten) | Falkert HZB 114652, 1 887 m | zrážky 1985–2023, T 1985–2023 | – | file 2 N-Tagessummen, 3 LT-Tageswerte; laserová výška snehu (od 2015) a ručný nový sneh (1992–2002) sa **neexportujú** | CC BY 4.0 |
| **GeoSphere klima-v2-1d** (ručné stanice) | Villacher Alpe 20020 (2 140 m, 34 km), Kanzelhöhe 122 (1 520 m, 21 km), Flattnitz 186 (1 437 m, 13 km); nižšie Bad Bleiberg 6, Millstatt 62, Tamsweg 98, St. Michael 92 | 1998 → dnes (oneskorenie 1–2 dni) | `shneu_manu`, `sh_manu` o 06 UTC (−1 = bez snehu), `rr`, `ffx`, `so_h`, `tlmax/tlmin` | JSON, do 240 req/h, **CORS \*** | CC BY 4.0 |
| GeoSphere automatické | Flattnitz, Kanzelhöhe, Katschberg 15715 (1 635 m), Arriach 20105 (890 m), Weitensfeld 103 (704 m), Fresach, Stolzalpe, Villacher Alpe 20021 | `sh` denne / 10 min / hodinovo od ~2020–2022; `ffx`, `rr`, `so` dlhšie | výška snehu, nárazy, zrážky, slnko, T | `klima-v2-10min`, `klima-v2-1h`, denne `klima-v2-1d` | CC BY 4.0 |
| GeoSphere TAWES živé | 11222 Flattnitz, 11216 Kanzelhöhe, 11349 Katschberg, 11265 Villacher Alpe | posledných 10 min | `SCHNEE`, RR, FFX, TL, SO (overené dnes 21:00 UTC; SCHNEE Flattnitz/Katschberg teraz null) | `station/current/tawes-v1-10min` | CC BY 4.0 |
| GeoSphere SYNOP | 11265 Villacher Alpe, 11349 Katschberg… | 1972 → včera | `VV` viditeľnosť, `N` oblačnosť, `schnee` | `synop-v1-1h` | CC BY 4.0 |
| **GeoSphere gridy 1 km** | pixel pri každej stanici, viac `lat_lon` v jednom volaní funguje | INCA hodinovo **2011-03-15 → dnes 20:00 UTC**; SNOWGRID a SPARTACUS denne 1961 → včera; APOLIS 100 m slnko 2006 → 10/2025 | INCA: T2M, TD2M, RR, UU, VV, RH2M, GL, P0 (**bez nárazov**); SNOWGRID: snow_depth, swe_tot; SPARTACUS: RR, SA (slnko s), TX, TN | `timeseries/historical/{id}` | CC BY 4.0 (analýzy, nie nezávislá pravda; INCA vietor 14 m/s vs 1 m/s v susedných pixeloch) |
| **LWD Kärnten** (smet.hydrographie.info) | 27 staníc v GeoJSON, pri strediskách len **Turracherhoehe 2900265** (1 795 m, 1,4 km; TA, RH, VW, DW, VW_MAX, HS, ISWR) a **Falkert 2900240** (1 886 m, 1,6 km; TA, RH, HS); obe `startYear: 2025` | kĺzavých 12 mesiacov (`{ID}_12m.smet`), `{ID}.smet` = posledné dni; súbory sa priebežne prepisujú | 10 min, SMET, `tz=+01`, nodata −777 (**v škálovaných stĺpcoch −7,77**) | **bez CORS** (len allow-methods); zoznam `stations_ktn_destiny.geojson`, webkamery `webcams.geojson` | **žiadna zverejnená licencia**; Impressum lawinenwarndienst.ktn.gv.at: každé použitie mimo stránok Land Kärnten len s písomným súhlasom (Abt. 3, abt3.katastrophenschutz@ktn.gv.at) |
| LAWIS | v Korutánsku len 2 stanice, žiadna pri strediskách | | | | |
| Satelit | SARAH-3 pixel 0,05° pri hornej stanici | 1983 → pred 2 dňami | SIS, sunshine_duration | CORS \* | EUMETSAT CM SAF, uviesť zdroj |
| Webkamery | foto-webcam.eu: kaiserburg (0,7 km od BKK vrchol), falkert, falkert-nord, turrach-ost (0,7 km), turrach-west, gnesau; winterdienst360: turracher_hoehe, hochrindl, falkert; ktn.gv.at st_oswald | archív `…/webcam/{cam}/YYYY/MM/DD/HHMM_la.jpg` (overené 200) | obraz | robots.txt zakazuje len vybrané boty | len ručné kontroly |
| História prevádzky lanoviek | – | – | – | – | nenašla sa (neprehľadávané znova) |

### 3.4 Počty udalostí ≥ 15 cm / 24 h (náhľad, sezóna nov–apr)

| Zdroj (výška) | Sezóny | Dní ≥ 15 cm | Nezávislé búrky | Priemer / sezónu | Rozpätie |
|---|---|---|---|---|---|
| eHYD Turracher Höhe (1 777 m), ručne 07:00 | 25 (1998/99–2022/23) | 172 | 147 | 5,9 | 1–12 |
| GeoSphere Villacher Alpe 20020 (2 140 m), ručne | 28 (1998/99–2025/26) | 209 | 177 | 6,3 | 2–14 |
| GeoSphere Kanzelhöhe 122 (1 520 m) | 28 | 165 | 143 | 5,1 | |
| GeoSphere Flattnitz 186 (1 437 m) | 28 (2025/26 prázdne!) | 173 | 138 | 4,9 | |
| LWD Turracherhoehe, ΔHS 07:00–07:00 (surové) | 2025/26 | dec 0, jan 1, feb 0, mar 0 | | | leto: „udalosti“ v máji/júli/auguste → nutná QC |
| LWD Falkert, ΔHS surové | 2025/26 | nov 1, jan 1, feb 1 | | | max HS 0,79 m (feb) |

Dôsledok: za dve sezóny s predstihom (2024/25, 2025/26) je na stanicu ~12–14 búrok → binárnu udalosť
kalibrovať nemožno; potvrdzuje plán kroku 3 (spojitý úhrn, P(≥ 15 cm) odvodená). Dlhé rady (eHYD +
Villacher Alpe + Kanzelhöhe, spolu ~470 búrok) stačia na fázu, pomer sneh/voda a bias bunka → stanica.

### 3.5 CORS, limity, licencie

- Open-Meteo (všetky hostitele vrátane single-runs, previous-runs, historical-forecast, ensemble, archive,
  satellite): `Access-Control-Allow-Origin: *`, ale hlavička sa posiela **len keď požiadavka nesie Origin**
  (preto ju curl bez Origin neukáže). Limity: 10 000 / deň, 5 000 / h, 600 / min; CC BY 4.0, nekomerčne.
- GeoSphere Data Hub: CORS `*` (overené s Origin), 240 req/h, CC BY 4.0 → živý výpočet v prehliadači môže
  čítať aj stanice GeoSphere.
- eHYD: bez CORS, len generátor/offline. smet.hydrographie.info: bez CORS.
- Zdroje na stránku: Open-Meteo (už), GeoSphere („Datenquelle: GeoSphere Austria“), eHYD („Datenquelle:
  ehyd.gv.at“), EUMETSAT CM SAF pri satelite.

### 3.6 Návrh pravdy pre každú zložku (na schválenie)

| Zložka | Primárna pravda | Kontrolná verzia | Poznámka |
|---|---|---|---|
| POWDER_SNEH (≥ 15 cm / 24 h do 06 UTC) – fyzika bez predstihu | eHYD Turracher Höhe 1998–2023 (ručný nový sneh + výška + zrážky + T) | GeoSphere ručný nový sneh Villacher Alpe 2 140 m, Kanzelhöhe 1 520 m, Flattnitz 1 437 m (1998 →) | proti Historical Forecast IFS 9 km (2017 →) a ICON-D2 (11/2022 →) |
| POWDER_SNEH – overenie s predstihom (2024/25, 2025/26) | GeoSphere ručný nový sneh (Villacher Alpe, Kanzelhöhe, Flattnitz) | ΔHS automatických staníc (Flattnitz, Kanzelhöhe, Katschberg) so sadaním; SNOWGRID ΔHS/ΔSWE; LWD ΔHS 2025/26 po QC a po vyriešení licencie | proti Single Runs IFS a Previous Runs ICON-D2/ICON-EU/IFS 0,25°/GFS |
| Prenos na hornú stanicu | žiadna priama pravda | LWD Turracher (1,4 km) a Falkert (1,6 km) ako jediný blízky bod, len 2025/26 | prenášať len korekcie nezávislé od miesta |
| Dážď dole | GeoSphere `rr` + T (Arriach 890 m, Weitensfeld 704 m); eHYD 5-min zrážky + T Turracher | INCA RR + T2M v pixeli dolnej stanice | |
| Nárazy hore | GeoSphere `ffx` Villacher Alpe 2 117 m (10 min / hod / denne), Kanzelhöhe, Katschberg | LWD Turracher VW_MAX (2025/26) | INCA nárazy nemá |
| Slnko / viditeľnosť | SARAH-3 sunshine_duration v pixeli hornej stanice (1983 →) | GeoSphere `so_h`, SPARTACUS SA, LWD ISWR | horná stanica v oblaku: len SYNOP VV Villacher Alpe + webkamery → bez strojovej pravdy (ostane pravidlo) |
| Teplota, wet-bulb na stanici | GeoSphere `tl`, `rf` (10 min) | LWD TA, RH; INCA T2M, RH2M | |
| Lanovky v prevádzke | žiadna | – | |
| Klimatológia udalosti | priamo z ručných radov (bod 4) | ERA5/CERRA len na synoptický kontext (hypotéza 700 hPa) | |

### 3.7 Opravy a doplnenia sekcie 4 promptu

- Single Runs: IFS 0,25° **nemá** behy (ani 12/2024, ani 1/2026); IFS 9 km 06z/18z len 144 h.
- Previous Runs: GFS zrážky už od 1/2024, snowfall od konca 2024; ICON-2I až od konca apríla 2025;
  AROME snowfall až od 30. 3. 2026. ICON-D2 previous_day má wet-bulb a slnko.
- Historical Forecast: ICON-D2 má nulovú izotermu (prompt tvrdil, že chýba všade – platí len pre Previous
  Runs a IFS). Priemer ensemblu je samostatný **model** `ecmwf_ifs025_ensemble_mean` od 20. 2. 2026,
  rozptyl neexistuje.
- `ecmwf_ifs_europe_ensemble`: 144 h, nie 150; bez nízkej oblačnosti.
- Nulová izoterma a tlakové hladiny: aj ICON-EU a GFS.
- Oneskorenie ENS 0,25° ~10 h; ovplyvní, ktorý beh je „známy“ v čase behu CI.
- GeoSphere: `shneu_manu`/`sh` = −1 znamená bez snehu (nie medzera); Flattnitz 2025/26 nemá ručný nový
  sneh; Katschberg nemá ručné merania; INCA nemá nárazy; Data Hub má CORS.
- eHYD Turracher Höhe má aj 5-minútové zrážky a dennú teplotu; Falkert na eHYD nemá sneh.
- LWD: obe stanice vznikli 2025, žiadna licencia; nodata v HS/RH je −7,77.
- Satelit: „DWD SIS“ je v Open-Meteo DWD MTG (od 2/2026), seamless nemá históriu pred 2026.
- eHYD sieť staníc existuje ako WMS/WFS/OAPIF (`gis.lfrz.gv.at/api/ehyd/` vracia 403 priamo) a ako
  GeoPackage na data.gv.at – odkaz som nenašiel; doriešiť v kroku 1.

### 3.8 Otvorené body / otázky

1. **LWD licencia a archív** – bez súhlasu nepoužívať verejne. Návrh: napísať LWD Kärnten (Abt. 3) so
   žiadosťou o súhlas na nekomerčné overovanie; kópiu držať len súkromne (nie v `docs/`, nie v repozitári).
2. Schváliť návrh pravdy (bod 6).
3. Krok 1: dohľadať ďalšie stanice eHYD NLV pri strediskách (Ebene Reichenau, Innerkrems, Bad
   Kleinkirchheim, Turrach, Hochrindl?) cez mapu eHYD alebo WFS – každá môže pridať 25 rokov ručného
   nového snehu v inej výške.
4. Rozpočet Open-Meteo pre backtest: IFS Single Runs 2 zimy × 182 dní × 2 behy ≈ 730 behov; ak funguje viac
   bodov v jednom volaní, ~730–1 500 volaní – postupne, s cache, v rámci limitov.

## 4. Model

Zatiaľ dnešné pravidlá (`src/ski-core.js`, README). Nový model príde v kroku 3 po backteste.

## 5. Výsledky podľa predstihu

Zatiaľ žiadne. Doplní krok 2 (baseline) a krok 3 (model).

## 6. Limity

- Žiadny dlhý rad pravdy neleží na hornej stanici lanovky; LWD body sú 1,4–1,6 km od nich a existujú len
  od 2025 (bez zverejnenej licencie).
- Archív s predstihom: IFS 9 km od 14. 3. 2024, ICON-D2/ICON-EU previous runs od 19. 1. 2024 → dve zimy.
  AROME (dnešný model pre D0) a členovia ensemblov zimný archív nemajú.
- Za dve zimy s predstihom pripadá na stanicu ~12–14 búrok ≥ 15 cm → binárna udalosť sa nekalibruje,
  modeluje sa spojitý úhrn.

## 7. Prekalibrovanie

Doplní krok 5 (prospektívne overovanie od novembra 2026, vyhodnotenie po sezóne 2026/27).

## 8. Reprodukcia

```sh
npm run check:scripts     # typová kontrola offline skriptov
npm run truth:fetch       # stiahne históriu pravdy do ~/.cache/ztlzdrf (s cache)
npm run truth             # spočíta búrky, klimatológiu a zhodu zdrojov; zapíše data/truth/*.json
```
