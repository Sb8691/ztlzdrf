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
- **Nezávislá búrka** = súvislé dni merania s ≥ 15 cm zlúčené do jednej udalosti. **Regionálna búrka** =
  to isté cez zjednotenie ručných staníc.
- **Predstih** = hodiny od zverejnenia behu (nie od inicializácie) do konca okna udalosti.

## 2. Rozhodnutia a predpoklady (denník)

| Dátum | Rozhodnutie / predpoklad | Kto |
|---|---|---|
| 3. 10. 2026 | POWDER = ≥ 15 cm / 24 h; stupne ALERT / POZOR / VÝHĽAD; najprv len POWDER_SNEH pre D0–D+2 | majiteľ (prompt) |
| 3. 10. 2026 | Krok 0: audit dát bez zmien v repozitári; výsledok v `~/.cache/ztlzdrf/audit-2026-10-03/` | Fable |
| 3. 10. 2026 | LWD Kärnten: dáta používať, majiteľ píše LWD so žiadosťou o súhlas; kópia ostáva mimo verejného repozitára (`~/.cache/ztlzdrf/lwd-ktn/`) | majiteľ |
| 3. 10. 2026 | Návrh pravdy z auditu schválený (sekcia 3.6); hľadať ďalšie stanice eHYD pri strediskách | majiteľ |
| 3. 10. 2026 | Predpoklady kroku 1: sezóna prevádzky 1. 12. – 15. 4.; pokrývka = HS ≥ 30 cm; búrka = súvislé dni ≥ 15 cm | Fable |
| 3. 10. 2026 | Dátumové konvencie zdrojov určené empiricky proti INCA (3.9); eHYD = začiatok okna, GeoSphere ručný sneh = koniec okna, GeoSphere `rr` a SNOWGRID = začiatok | Fable (dáta) |
| 3. 10. 2026 | Pravda pre POWDER_SNEH v poradí: ručný nový sneh → ΔHS automatov o 06 UTC → SNOWGRID len ako kontext (3.9) | Fable, čaká na schválenie |
| 3. 10. 2026 | eHYD rozšírené o 9 staníc do 25 km (St. Oswald, Innerkrems, Afritz, Maitratten-Sonnleiten, Sirnitz, Thomatal, Kendlbruck, Hochegg, Dreifaltigkeit) | majiteľ (áno na hľadanie), Fable (výber) |
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

### 3.9 Krok 1 – pravda a klimatológia (3. 10. 2026)

Všetko nižšie počíta `npm run truth` z dát, ktoré stiahol `npm run truth:fetch` (cache
`~/.cache/ztlzdrf`). Úplné tabuľky sú v `data/truth/REPORT.md`, katalóg búrok v
`data/truth/storms.json`, čísla s intervalmi v `data/truth/summary.json`. Intervaly sú 95 % bootstrap
po sezónach (sezóna = blok), 2 000 opakovaní, deterministický generátor.

**Zdroje a rozsah:** eHYD 11 staníc (8 s ručným novým snehom; Turracher Höhe 1 777 m 1998–2023,
Maitratten-Sonnleiten 976 m, Sirnitz 823 m, Thomatal 1 071 m, Kendlbruck 940 m, Hochegg 1 026 m,
Dreifaltigkeit 1 096 m; St. Oswald 1 373 m, Innerkrems 1 567 m, Afritz 712 m len zrážky a T; Turracher,
Afritz, Thomatal a Kendlbruck aj 5-min zrážky zhrnuté na hodiny); GeoSphere stanice denne od 1998 (ručný
nový sneh Villacher Alpe 2 140 m, Kanzelhöhe 1 520 m, Flattnitz 1 437 m; automaty Katschberg, Arriach,
Weitensfeld, Villacher Alpe), hodinovo od 11/2022 (automatická výška snehu o 06 UTC); SNOWGRID a SPARTACUS
denne 1998 → včera a INCA hodinovo (zimy 2011/12 →) v 28 bodoch (8 staníc lanoviek, 11 eHYD, 2 LWD, 7
GeoSphere); LWD Turracherhoehe a Falkert 10-min od 10/2025.

#### Zarovnanie dátumov (overené proti INCA)

| Zdroj | n | k = −1 | k = 0 | k = +1 | záver |
|---|---|---|---|---|---|
| eHYD Turracher Höhe nový sneh | 2029 | 0,19 | 0,71 | 0,15 | k = 0 (dátum = začiatok okna) |
| eHYD Turracher Höhe zrážky | 2090 | 0,27 | 0,91 | 0,23 | k = 0 (dátum = začiatok okna) |
| GeoSphere Villacher Alpe (ručná) nový sneh | 2567 | 0,91 | 0,28 | 0,09 | k = -1 (dátum = koniec okna) |
| GeoSphere Kanzelhöhe nový sneh | 2567 | 0,93 | 0,17 | 0,04 | k = -1 (dátum = koniec okna) |
| GeoSphere Flattnitz nový sneh | 2360 | 0,83 | 0,19 | 0,07 | k = -1 (dátum = koniec okna) |
| GeoSphere Kanzelhöhe zrážky rr | 2567 | 0,21 | 0,99 | 0,20 | k = 0 (dátum = začiatok okna) |
| SNOWGRID ΔHS @ eHYD Turracher | 2567 | 0,13 | 0,74 | 0,15 | k = 0 (dátum = začiatok okna) |
| SPARTACUS RR @ eHYD Turracher | 2567 | 0,23 | 0,92 | 0,21 | k = 0 (dátum = začiatok okna) |
| GeoSphere Flattnitz ΔHS automat (06 UTC) | 697 | 0,80 | 0,10 | 0,01 | k = -1 (dátum = koniec okna) |

Konvencie (k): ehyd=0, ehyd-rr=0, geosphere=-1, geosphere-rr=0, snowgrid=0, spartacus=0, geosphere-auto=-1, lwd=-1. Deň merania M = d + k + 1.

Dôsledok: hodnota eHYD s dátumom d (07:00) je nový sneh nameraný ráno d + 1; ručný nový sneh GeoSphere
s dátumom d je nameraný ráno d; zrážky GeoSphere `rr` s dátumom d sú však za d 06 UTC → d + 1 06 UTC;
výška snehu SNOWGRID s dátumom d je stav na konci dňa d. Skript to prepočítava na deň merania M (24 h
končiacich ráno M) automaticky a tlačí tabuľku, takže zmena v zdroji sa prejaví.

#### Nezávislé búrky ≥ 15 cm (sezóna prevádzky 1. 12. – 15. 4., pokrývka ≥ 30 cm ráno po sneženi)

| Rad | Sezóny s dátami | Dní ≥ 15 cm | Búrok | Búrok / sezónu (95 % CI) | Priemer búrky [cm] | Bez podmienky pokrývky | Celá zima nov–apr |
|---|---|---|---|---|---|---|---|
| eHYD Turracher Höhe (1777 m), ručne | 25 (1998/99–2022/23) | 117 | 100 | 4,0 (3,1–4,8) | 27,6 | 117 | 120 |
| eHYD Maitratten-Sonnleiten (976 m), ručne | 35 (1988/89–2022/23) | 35 | 34 | 1,0 (0,6–1,4) | 23,4 | 50 | 36 |
| eHYD Sirnitz (823 m), ručne | 53 (1970/71–2022/23) | 65 | 55 | 1,0 (0,7–1,4) | 26,6 | 78 | 60 |
| eHYD Thomatal (1071 m), ručne | 26 (1997/98–2022/23) | 29 | 24 | 0,9 (0,6–1,2) | 27,9 | 37 | 30 |
| eHYD Kendlbruck (940 m), ručne | 17 (2006/07–2022/23) | 9 | 9 | 0,5 (0,2–1,1) | 27,7 | 16 | 10 |
| eHYD Hochegg (1026 m), ručne | 53 (1970/71–2022/23) | 114 | 85 | 1,6 (1,2–2,0) | 40,8 | 134 | 101 |
| eHYD Dreifaltigkeit (1096 m), ručne | 53 (1970/71–2022/23) | 88 | 77 | 1,5 (1,1–1,9) | 27,9 | 119 | 82 |
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 28 (1998/99–2025/26) | 154 | 131 | 4,7 (3,6–5,8) | 31,5 | 136 | 159 |
| GeoSphere Kanzelhöhe (1520 m), ručne | 28 (1998/99–2025/26) | 106 | 92 | 3,3 (2,4–4,2) | 29,1 | 111 | 105 |
| GeoSphere Flattnitz (1437 m), ručne | 27 (1998/99–2024/25) | 108 | 87 | 3,2 (2,3–4,1) | 29,4 | 106 | 106 |
| GeoSphere Kanzelhöhe (1520 m), ΔHS automat | 4 (2022/23–2025/26) | 13 | 13 | 3,3 (2,5–4,0) | 25,7 | 14 | 13 |
| GeoSphere Flattnitz (1437 m), ΔHS automat | 4 (2022/23–2025/26) | 7 | 7 | 1,8 (0,5–2,8) | 22,7 | 9 | 8 |
| GeoSphere Katschberg (1635 m), ΔHS automat | 4 (2022/23–2025/26) | 11 | 10 | 2,5 (0,8–3,8) | 27,1 | 11 | 11 |
| GeoSphere Arriach (890 m), ΔHS automat | 4 (2022/23–2025/26) | 2 | 2 | 0,5 (0,0–1,5) | 27,5 | 2 | 2 |
| GeoSphere Weitensfeld (704 m), ΔHS automat | 4 (2022/23–2025/26) | 0 | 0 | 0,0 (0,0–0,0) | – | 1 | 0 |
| LWD Turracherhoehe (1795 m), ΔHS automat | 1 (2025/26–2025/26) | 1 | 1 | 1,0 (–––) | 17,5 | 1 | 1 |
| LWD Falkert (1886 m), ΔHS automat | 1 (2025/26–2025/26) | 3 | 3 | 3,0 (–––) | 17,4 | 3 | 3 |
| SNOWGRID ΔHS @ Bad Kleinkirchheim / St. Oswald – Kaiserburgbahn II (2043 m) | 28 (1998/99–2025/26) | 66 | 62 | 2,2 (1,6–2,8) | 23,7 | 70 | 73 |
| SNOWGRID ΔHS @ Falkert (Heidi Alm) – Falkertlift, horná stanica (2107 m) | 28 (1998/99–2025/26) | 51 | 47 | 1,7 (1,1–2,3) | 23,4 | 55 | 55 |
| SNOWGRID ΔHS @ Turracher Höhe – Kornockbahn (2197 m) | 28 (1998/99–2025/26) | 82 | 73 | 2,6 (1,9–3,3) | 25,9 | 75 | 83 |
| SNOWGRID ΔHS @ Hochrindl – Kruckenlift (1832 m) | 28 (1998/99–2025/26) | 34 | 32 | 1,1 (0,7–1,6) | 23,8 | 47 | 38 |
| SNOWGRID ΔHS @ eHYD Turracher Höhe (1777 m) | 28 (1998/99–2025/26) | 61 | 57 | 2,0 (1,4–2,6) | 23,8 | 64 | 64 |
| SNOWGRID ΔHS @ LWD Turracherhoehe (1795 m) | 28 (1998/99–2025/26) | 61 | 57 | 2,0 (1,4–2,6) | 23,8 | 64 | 64 |
| SNOWGRID ΔHS @ LWD Falkert (1886 m) | 28 (1998/99–2025/26) | 53 | 48 | 1,7 (1,1–2,3) | 23,9 | 57 | 58 |
| SNOWGRID ΔHS @ Villacher Alpe (ručná) (2140 m) | 28 (1998/99–2025/26) | 120 | 107 | 3,8 (3,0–4,6) | 29,2 | 109 | 131 |
| SNOWGRID ΔHS @ Kanzelhöhe (1520 m) | 28 (1998/99–2025/26) | 22 | 21 | 0,8 (0,4–1,1) | 23,0 | 35 | 25 |
| SNOWGRID ΔHS @ Flattnitz (1437.2 m) | 28 (1998/99–2025/26) | 20 | 19 | 0,7 (0,4–1,0) | 23,6 | 28 | 25 |

Regionálne búrky (10 ručných radov: Turracher Höhe, Maitratten-Sonnleiten, Sirnitz, Thomatal, Kendlbruck, Hochegg, Dreifaltigkeit, Villacher Alpe (ručná), Kanzelhöhe, Flattnitz; aspoň jedna stanica ≥ 15 cm, zlúčené súvislé dni): 281 v 56 sezónach, 5,0 (4,1–6,0) za sezónu; podiel búrok, ktoré zasiahli ≥ 2 stanice: 56,9 %.

Po sezónach (regionálne búrky): 1970/71: 2, 1971/72: 3, 1972/73: 3, 1973/74: 1, 1974/75: 2, 1975/76: 1, 1976/77: 2, 1977/78: 5, 1978/79: 4, 1979/80: 4, 1980/81: 3, 1981/82: 3, 1982/83: 2, 1983/84: 6, 1984/85: 2, 1985/86: 3, 1986/87: 5, 1987/88: 2, 1988/89: 0, 1989/90: 1, 1990/91: 2, 1991/92: 2, 1992/93: 1, 1993/94: 3, 1994/95: 5, 1995/96: 6, 1996/97: 0, 1997/98: 0, 1998/99: 6, 1999/00: 5, 2000/01: 10, 2001/02: 3, 2002/03: 2, 2003/04: 9, 2004/05: 6, 2005/06: 11, 2006/07: 8, 2007/08: 6, 2008/09: 12, 2009/10: 10, 2010/11: 3, 2011/12: 5, 2012/13: 11, 2013/14: 12, 2014/15: 2, 2015/16: 8, 2016/17: 5, 2017/18: 11, 2018/19: 9, 2019/20: 4, 2020/21: 13, 2021/22: 10, 2022/23: 9, 2023/24: 8, 2024/25: 6, 2025/26: 4

Regionálne búrky (aspoň jedna z 10 ručných staníc ≥ 15 cm, súvislé dni zlúčené): 281 v 56 sezónach,
5,0 (4,1–6,0) za sezónu; od 1998/99, keď merajú aj stanice nad 1 400 m, 208 búrok = 7,4 za sezónu.
57 % búrok zasiahlo aspoň dve stanice. Po sezónach s archívom predstihu: 2024/25 šesť, 2025/26 štyri.

#### Citlivosť na prah a pokrývku

| Rad | prah 10 cm | 15 cm | 20 cm | 30 cm | pokrývka 0 | 20 cm | 30 cm | 50 cm |
|---|---|---|---|---|---|---|---|---|
| eHYD Turracher Höhe (1777 m), ručne | 6,9 | 4,0 | 2,3 | 1,1 | 4,7 | 4,5 | 4,0 | 3,0 |
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 6,4 | 4,7 | 3,4 | 1,6 | 4,9 | 4,9 | 4,7 | 4,0 |
| GeoSphere Kanzelhöhe (1520 m), ručne | 5,5 | 3,3 | 2,2 | 1,0 | 4,0 | 3,8 | 3,3 | 2,6 |
| GeoSphere Flattnitz (1437 m), ručne | 4,8 | 3,2 | 2,2 | 1,2 | 3,9 | 3,7 | 3,2 | 2,4 |

#### Klimatológia

| Rad | nov | dec | jan | feb | mar | apr | P(≥15) sezóna prevádzky, pokrývka ≥ 30 cm | medián / 90. perc. úhrnu v dňoch ≥ 1 cm [cm] |
|---|---|---|---|---|---|---|---|---|
| eHYD Turracher Höhe (1777 m), ručne | 4,3 | 4,3 | 4,0 | 4,7 | 3,9 | 1,9 | 4,9 % (n = 2406) | 5,0 / 17,0 |
| eHYD Maitratten-Sonnleiten (976 m), ručne | 0,6 | 1,6 | 0,9 | 1,5 | 1,0 | 0,3 | 5,0 % (n = 706) | 3,0 / 13,0 |
| eHYD Sirnitz (823 m), ručne | 0,8 | 1,6 | 1,3 | 1,5 | 1,1 | 0,2 | 6,4 % (n = 1019) | 3,0 / 13,0 |
| eHYD Thomatal (1071 m), ručne | 0,9 | 0,9 | 1,4 | 1,9 | 1,2 | 0,5 | 4,9 % (n = 593) | 5,0 / 14,2 |
| eHYD Kendlbruck (940 m), ručne | 0,4 | 0,4 | 0,9 | 1,9 | 0,2 | 0,2 | 15,0 % (n = 60) | 3,0 / 11,0 |
| eHYD Hochegg (1026 m), ručne | 2,3 | 3,0 | 2,3 | 2,9 | 2,1 | 1,0 | 14,1 % (n = 810) | 5,0 / 20,0 |
| eHYD Dreifaltigkeit (1096 m), ručne | 1,4 | 2,1 | 1,8 | 2,2 | 1,8 | 0,8 | 7,2 % (n = 1219) | 5,0 / 17,0 |
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 4,4 | 4,6 | 3,5 | 5,2 | 3,8 | 3,3 | 5,5 % (n = 2783) | 4,0 / 19,0 |
| GeoSphere Kanzelhöhe (1520 m), ručne | 3,8 | 3,5 | 2,6 | 4,9 | 3,0 | 1,8 | 6,0 % (n = 1778) | 5,0 / 18,0 |
| GeoSphere Flattnitz (1437 m), ručne | 4,3 | 4,2 | 2,6 | 4,7 | 3,8 | 1,7 | 7,9 % (n = 1369) | 5,0 / 20,0 |

#### Zhoda verzií pravdy

| A (referencia) | B | n dní | A∧B | len A | len B | POD | FAR | r | MAE [cm] | bias B−A [cm] |
|---|---|---|---|---|---|---|---|---|---|---|
| eHYD Turracher Höhe (1777 m), ručne | SNOWGRID ΔHS @ eHYD Turracher Höhe (1777 m) | 2406 | 40 | 77 | 17 | 0,34 (0,25–0,43) | 0,30 (0,17–0,43) | 0,73 | 5,0 | -3,4 |
| eHYD Turracher Höhe (1777 m), ručne | GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 2406 | 48 | 69 | 70 | 0,41 (0,31–0,52) | 0,59 (0,49–0,69) | 0,61 | 5,6 | -0,2 |
| eHYD Turracher Höhe (1777 m), ručne | GeoSphere Kanzelhöhe (1520 m), ručne | 2406 | 55 | 62 | 49 | 0,47 (0,37–0,57) | 0,47 (0,38–0,57) | 0,70 | 4,8 | -0,5 |
| eHYD Turracher Höhe (1777 m), ručne | GeoSphere Flattnitz (1437 m), ručne | 2406 | 63 | 54 | 50 | 0,54 (0,44–0,65) | 0,44 (0,36–0,52) | 0,78 | 4,4 | -0,8 |
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | SNOWGRID ΔHS @ Villacher Alpe (ručná) (2140 m) | 2783 | 105 | 49 | 12 | 0,68 (0,59–0,77) | 0,10 (0,06–0,16) | 0,88 | 3,9 | -2,1 |
| GeoSphere Kanzelhöhe (1520 m), ručne | SNOWGRID ΔHS @ Kanzelhöhe (1520 m) | 1778 | 28 | 78 | 3 | 0,26 (0,20–0,33) | 0,10 (0,00–0,21) | 0,80 | 5,9 | -5,6 |
| GeoSphere Kanzelhöhe (1520 m), ručne | GeoSphere Kanzelhöhe (1520 m), ΔHS automat | 291 | 12 | 1 | 0 | 0,92 (0,82–1,00) | 0,00 (0,00–0,00) | 0,96 | 3,0 | -2,9 |
| GeoSphere Flattnitz (1437 m), ručne | GeoSphere Flattnitz (1437 m), ΔHS automat | 141 | 5 | 1 | 0 | 0,83 (–––) | 0,00 (–––) | 0,93 | 2,2 | -1,9 |
| GeoSphere Flattnitz (1437 m), ručne | SNOWGRID ΔHS @ Flattnitz (1437.2 m) | 1369 | 22 | 86 | 1 | 0,20 (0,15–0,26) | 0,04 (0,00–0,13) | 0,78 | 6,6 | -6,0 |
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | GeoSphere Kanzelhöhe (1520 m), ručne | 2783 | 80 | 74 | 39 | 0,52 (0,44–0,59) | 0,33 (0,25–0,42) | 0,76 | 4,7 | -1,1 |
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | GeoSphere Flattnitz (1437 m), ručne | 2654 | 61 | 89 | 58 | 0,41 (0,31–0,51) | 0,49 (0,39–0,58) | 0,62 | 6,0 | -1,7 |
| GeoSphere Kanzelhöhe (1520 m), ručne | GeoSphere Flattnitz (1437 m), ručne | 1724 | 66 | 38 | 38 | 0,63 (0,52–0,74) | 0,37 (0,28–0,46) | 0,82 | 4,5 | -1,0 |
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | LWD Turracherhoehe (1795 m), ΔHS automat | 114 | 0 | 4 | 1 | 0,00 (–––) | 1,00 (–––) | 0,75 | 3,0 | -0,8 |
| SNOWGRID ΔHS @ Turracher Höhe – Kornockbahn (2197 m) | SNOWGRID ΔHS @ eHYD Turracher Höhe (1777 m) | 2646 | 67 | 15 | 0 | 0,82 (0,72–0,92) | 0,00 (0,00–0,00) | 0,97 | 1,3 | -1,0 |
| eHYD Turracher Höhe (1777 m), ručne | eHYD Maitratten-Sonnleiten (976 m), ručne | 2406 | 21 | 96 | 14 | 0,18 (0,10–0,26) | 0,40 (0,19–0,60) | 0,61 | 5,6 | -4,4 |
| eHYD Turracher Höhe (1777 m), ručne | eHYD Sirnitz (823 m), ručne | 2406 | 20 | 97 | 17 | 0,17 (0,11–0,24) | 0,46 (0,28–0,61) | 0,53 | 6,1 | -4,7 |
| eHYD Turracher Höhe (1777 m), ručne | eHYD Thomatal (1071 m), ručne | 2406 | 31 | 86 | 9 | 0,26 (0,20–0,33) | 0,23 (0,11–0,36) | 0,61 | 5,8 | -3,7 |
| eHYD Turracher Höhe (1777 m), ručne | eHYD Kendlbruck (940 m), ručne | 1639 | 8 | 71 | 6 | 0,10 (0,04–0,16) | 0,43 (0,00–0,74) | 0,62 | 6,0 | -4,7 |
| eHYD Turracher Höhe (1777 m), ručne | eHYD Hochegg (1026 m), ručne | 2406 | 37 | 80 | 25 | 0,32 (0,24–0,40) | 0,40 (0,25–0,55) | 0,59 | 5,9 | -3,2 |
| eHYD Turracher Höhe (1777 m), ručne | eHYD Dreifaltigkeit (1096 m), ručne | 2406 | 25 | 92 | 15 | 0,21 (0,15–0,29) | 0,38 (0,20–0,54) | 0,62 | 5,7 | -4,0 |

| Stanica | POD surové | POD korigované | FAR surové | FAR korigované |
|---|---|---|---|---|
| Kanzelhöhe | 0,92 (0,82–1,00) | 0,92 (0,82–1,00) | 0,00 (0,00–0,00) | 0,00 (0,00–0,00) |
| Flattnitz | 0,83 (–––) | 0,83 (–––) | 0,00 (–––) | 0,00 (–––) |

**Čo z toho plynie (overené):**

- Automatická výška snehu o 06 UTC dáva po odčítaní takmer to isté ako ručné meranie na tej istej
  stanici (Kanzelhöhe POD 0,92, FAR 0,00, r 0,96; sadanie len −3 cm na snehový deň, korekcia 2 %/deň
  nič nemení). ΔHS automatov je preto plnohodnotná pravda pre Katschberg, LWD aj ďalšie automaty.
- SNOWGRID udalosť ≥ 15 cm väčšinou nevidí (POD 0,20–0,34, bias −3 až −6 cm na snehový deň), okrem
  pixelu Villacher Alpe (POD 0,68). Ostáva len slabou treťou verziou, nie pravdou.
- Stanice vzdialené 13–35 km zdieľajú približne polovicu udalostí (POD 0,41–0,54, FAR 0,44–0,59, r
  0,6–0,8). Pravda je lokálna: horná stanica lanovky bez vlastného merania má neistotu tohto rádu
  a model treba overovať na viacerých staniciach naraz.
- Údolné stanice (700–1 100 m) majú 0,5–1,6 búrky za sezónu, Hochegg (juhozápad) najväčšie úhrny
  (priemer búrky 41 cm) – podporuje hypotézu o južnom prúdení; test príde v kroku 3.
- Za dve zimy s archívom predstihu je 10 regionálnych búrok (Villacher Alpe 6 + 4, Kanzelhöhe 2 + 2,
  Katschberg automat 3 + 0, LWD Falkert 3, LWD Turracher 1). Binárna kalibrácia je vylúčená; krok 3
  modeluje spojitý úhrn, presne ako predpokladal prompt.
- LWD: surový rad HS má v lete falošné „sneženia“ (vegetácia, šum); v zime po mediáne zo siedmich hodnôt
  okolo 07:00 vyzerá čisto. Turracher 2025/26 zaznamenal jediný deň ≥ 15 cm, Falkert tri, SNOWGRID v tých
  istých pixeloch dva – chudobná zima, nie chyba zarovnania (r = 0,75 oproti Villacher Alpe).

**Predpoklady kroku 1:** sezóna prevádzky 1. 12. – 15. 4.; pokrývka = výška snehu ≥ 30 cm ráno po
sneženi z toho istého prístroja (pri SNOWGRID z analýzy); búrka = súvislé dni ≥ 15 cm; GeoSphere −1 = 0
pre nový sneh, výšku snehu a zrážky; LWD výška o 07:00 = medián 06:40–07:40 SEČ, záporné hodnoty = 0,
aspoň 4 platné z 7; bootstrap po sezónach (nie po búrkach – sezóny sú nezávislé, búrky v sezóne nie).

## 4. Model

Zatiaľ dnešné pravidlá (`src/ski-core.js`, README). Nový model príde v kroku 3 po backteste.

## 5. Výsledky podľa predstihu

Zatiaľ žiadne. Doplní krok 2 (baseline) a krok 3 (model).

## 6. Limity

- Žiadny dlhý rad pravdy neleží na hornej stanici lanovky; LWD body sú 1,4–1,6 km od nich a existujú len
  od 2025 (bez zverejnenej licencie).
- Archív s predstihom: IFS 9 km od 14. 3. 2024, ICON-D2/ICON-EU previous runs od 19. 1. 2024 → dve zimy.
  AROME (dnešný model pre D0) a členovia ensemblov zimný archív nemajú.
- Za dve zimy s predstihom je v regióne 10 búrok ≥ 15 cm (sezóna prevádzky, s pokrývkou) → binárna
  udalosť sa nekalibruje, modeluje sa spojitý úhrn.
- SNOWGRID nie je pravda pre udalosť ≥ 15 cm (POD 0,2–0,3 mimo Villacher Alpe). Stanice 13–35 km od seba
  zdieľajú len ~polovicu udalostí, horná stanica bez merania má neistotu tohto rádu.
- eHYD končí 31. 8. 2023 (sneh) / 31. 12. 2023 (zrážky, T): použiteľné len na fyziku bez predstihu.

## 7. Prekalibrovanie

Doplní krok 5 (prospektívne overovanie od novembra 2026, vyhodnotenie po sezóne 2026/27).

## 8. Reprodukcia

```sh
npm test                  # testy stránky aj parserov (fixtúry zo skutočných odpovedí)
npm run check:scripts     # typová kontrola offline skriptov
npm run truth:fetch       # stiahne históriu pravdy do ~/.cache/ztlzdrf (s cache)
npm run truth             # zarovnanie, búrky, klimatológia, zhoda zdrojov → data/truth/{storms,summary}.json, REPORT.md
```
