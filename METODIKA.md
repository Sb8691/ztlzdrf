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
| 4. 10. 2026 | Krok 6a: hodinové značky GeoSphere = predchádzajúca hodina (overené krížovou koreláciou); áno/nie pravidlá stránky nahradia kalibrované pravdepodobnosti (6d); nárazy z IFS bez zručnosti → vietor len z ICON-D2 do 47 h alebo klimatológia; prahy stránky ostávajú definíciami | Fable (krok 6 schválený majiteľom 4. 10.) |
| 4. 10. 2026 | Krok 5a: každý čerstvý beh generátora pripíše riadok do `data/prospective/<sezóna>.jsonl` (strediská, šesť overovacích staníc, členovia ansámblu v okne); CI commituje `data/prospective`; vyhodnotenie až po sezóne 2026/27 | majiteľ (áno na plán), Fable |
| 4. 10. 2026 | Krok 4b: prah ALERTu p* = 0,20 (N = 4) ako predvolená hodnota, lebo majiteľ N nevedel určiť; stupne podľa poradia dňa (ALERT D0–D+1, POZOR D+2–D+3, VÝHĽAD D+4–D+9); horizont `short` ostáva 3 dni (D+3 bez stupňa) | Fable (majiteľ: „neviem“) |
| 4. 10. 2026 | Krok 4a: horizont D0 prepnutý z AROME na ICON-D2 (jediný krátkodobý model s overiteľným archívom); predstih od zverejnenia behu (IFS +7 h, ICON-D2 +1,5 h), bez metadát od času načítania; ansámbel zatiaľ bez pravdepodobnosti; snímka v2 s `powderSnow` | majiteľ (áno 4. 10.), Fable |
| 4. 10. 2026 | Krok 3: fyzika = dnešné pravidlo stránky (fitované fázy, pomer sneh/voda, výškový faktor a vietor nepridávajú zručnosť; výškový faktor ťahá jediná vrcholová stanica a zhoršuje pásmo 1 700–1 950 m); rozdelenie dvojdielne na √cm; zákon: len sklon b klesá s predstihom (6 parametrov) – zákon bez predstihu má rovnaké CV skóre, zvolený ten so závislosťou kvôli extrapolácii | Fable |
| 4. 10. 2026 | Krok 3: záporné ΔHS automatov = 0 cm; vzorka fitu = zimné dni, ručné stanice pri akejkoľvek pokrývke, automaty pri ≥ 30 cm; prah udalosti v spojitom rozdelení 15 cm (14,5 dáva to isté); kombinácia IFS + ICON-D2 pri 1 dni neprijatá (v šume) | Fable |
| 3. 10. 2026 | POWDER = ≥ 15 cm / 24 h; stupne ALERT / POZOR / VÝHĽAD; najprv len POWDER_SNEH pre D0–D+2 | majiteľ (prompt) |
| 3. 10. 2026 | Krok 0: audit dát bez zmien v repozitári; výsledok v `~/.cache/ztlzdrf/audit-2026-10-03/` | Fable |
| 3. 10. 2026 | LWD Kärnten: dáta používať, majiteľ píše LWD so žiadosťou o súhlas; kópia ostáva mimo verejného repozitára (`~/.cache/ztlzdrf/lwd-ktn/`) | majiteľ |
| 3. 10. 2026 | Návrh pravdy z auditu schválený (sekcia 3.6); hľadať ďalšie stanice eHYD pri strediskách | majiteľ |
| 3. 10. 2026 | Predpoklady kroku 1: sezóna prevádzky 1. 12. – 15. 4.; pokrývka = HS ≥ 30 cm; búrka = súvislé dni ≥ 15 cm | Fable |
| 3. 10. 2026 | Dátumové konvencie zdrojov určené empiricky proti INCA (3.9); eHYD = začiatok okna, GeoSphere ručný sneh = koniec okna, GeoSphere `rr` a SNOWGRID = začiatok | Fable (dáta) |
| 3. 10. 2026 | Pravda pre POWDER_SNEH v poradí: ručný nový sneh → ΔHS automatov o 06 UTC → SNOWGRID len ako kontext (3.9) | Fable, čaká na schválenie |
| 3. 10. 2026 | eHYD rozšírené o 9 staníc do 25 km (St. Oswald, Innerkrems, Afritz, Maitratten-Sonnleiten, Sirnitz, Thomatal, Kendlbruck, Hochegg, Dreifaltigkeit) | majiteľ (áno na hľadanie), Fable (výber) |
| 4. 10. 2026 | Krok 2: overovacie body = stanice s pravdou (nie lanovky); IFS zverejnenie +7 h; len 00z/12z; LOSO klimatológia na primárnom filtri; Katschberg preberá klimatológiu Kanzelhöhe, LWD preberajú eHYD Turracher; blokový bootstrap 10 dní | Fable (schválené body 1–3 majiteľom) |
| 4. 10. 2026 | Open-Meteo: 28 bodov × 11 premenných = ťažké volania → minútový limit čakáme, hodinový zastaví beh; Historical Forecast IFS kompletný, ICON-D2 do 12/2023 | Fable |
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

## 4. Model (krok 3, 4. 10. 2026)

Všetko počíta `npm run model` (`scripts/model-fit.ts`; čisté funkcie modelu v `scripts/lib/powder-model.ts`,
bez importov, aby ich stránka mohla prevziať doslovne). Úplné tabuľky sú v `data/model/REPORT.md`,
koeficienty pre stránku v `data/model/powder-model.json`. Pravda a vzorky ako v §3.9 a §5.1; naviac
**vzorka fitu** = zimné dni nov–apr s pravdou, ručný nový sneh pri akejkoľvek pokrývke, ΔHS automatov len
pri pokrývke ≥ 30 cm; záporné ΔHS (sadanie, topenie) = 0 cm. Skóre vždy mimo vzorky (pri predstihu 0
leave-one-season-out, pri predstihoch zima proti zime) a na primárnej vzorke z kroku 2, aby sa dalo
porovnať s bránou.

### 4.1 Tvar modelu (výsledok)

1. **Úhrn x** (cm) za 24 h okna = Σ hodín zrážky × 0,7 cm/mm, keď je teplota vo výške stanice
   (Open-Meteo `elevation=` výška stanice, tak to robí aj stránka) ≤ 1 °C – **presne dnešné pravidlo
   stránky**. Fitované alternatívy (fáza z wet-bulb, rampa, pomer sneh/voda podľa teploty, výškový
   faktor, vietor) nepridali zručnosť (§4.2).
2. **Rozdelenie pozorovaného úhrnu Y pri danom x** je dvojdielne:
   P(Y > 0) = Φ(h0 + h1·√x) a √Y | Y > 0 ~ N(a + b·√x, c) orezané v nule.
   **P(POWDER_SNEH) = P(Y > 0) · P(√Y ≥ √15 | Y > 0).** Medián a kvantily úhrnu sú z toho istého
   rozdelenia (`hurdleQuantileCm`).
3. **Predstih L** (hodiny od zverejnenia behu do konca okna): len sklon polohy klesá,
   b = b0 + b1·(L − L_ref)/24 h; ostatné koeficienty sú konštantné. L sa oreže na [0, L_max].

| Zdroj | L_ref | platnosť | h0 | h1 | a | b0 | b1 [/deň] | c | fit na |
|---|---|---|---|---|---|---|---|---|---|
| IFS 9 km (`ecmwf_ifs`) | 23 h | 23–131 h (pod 23 h extrapolácia, nad 131 h zafixované) | −1,339 | 0,896 | 1,419 | 0,570 | −0,032 | 0,891 | celé behy 00z/12z, zimy 2024/25 + 2025/26, 6 staníc, 6 460 staničných dní |
| ICON-D2 (`icon_d2`) | 0 h | 0–47 h | −1,594 | 1,700 | 0,933 | 0,875 | −0,086 | 0,727 | Historical Forecast 2022/23 → (14 staníc) + Previous Runs 1 d (6 staníc) |

Príklady pre IFS: x = 10 cm → P ≈ 0,22 (23 h); x = 20 cm → 0,54 (23 h), 0,41 (71 h), 0,27 (131 h);
x = 30 cm → 0,77 (23 h). Pri x = 0 je P(Y > 0) = Φ(−1,34) = 9 % a P(≥ 15 cm) ≈ 0.

### 4.2 Ako sa k tomu došlo (overené)

**Fyzika (3a, predstih 0, Historical Forecast IFS 2016/17–2025/26, 13 899 staničných dní, 381 udalostí,
14 staníc; ICON-D2 2022/23–2025/26, 3 551 dní, 108 udalostí; LOSO, cieľ fitu = stredná kvadratická chyba
√úhrnu):**

| Variant (IFS) | parametre | RMSE √cm | MAE sneh [cm] | bias [cm] | bias 1 700–1 950 m | bias ≥ 1 950 m | AUC@15 |
|---|---|---|---|---|---|---|---|
| surový `snowfall` modelu | 0 | 0,730 | 4,09 | −0,28 | −0,41 | −0,86 | 0,967 |
| **dnešné pravidlo** | 0 | 0,675 | 3,63 | −0,20 | −0,42 | +0,16 | 0,976 |
| fáza z T (rampa) | 2 (stred −0,2 °C, polšírka 1,8 °C) | 0,642 | 3,62 | −0,41 | −0,64 | +0,15 | 0,977 |
| fáza z wet-bulb + pomer podľa T | 4 | 0,642 | 3,63 | −0,41 | −0,68 | +0,16 | 0,977 |
| … + výškový faktor | 5 (β = −0,48/km) | 0,637 | 3,55 | −0,40 | −0,75 | −0,19 | 0,979 |
| … + vietor | 6 | 0,636 | 3,53 | −0,40 | −0,86 | −0,12 | 0,978 |

- Vlastný `snowfall` modelu je horší než zrážky × 0,7 pri T stanice ≤ 1 °C: IFS 9 km rozhoduje o fáze
  v nižšej a teplejšej bunke, teplota prepočítaná na výšku stanice je lepšia. Pri ICON-D2 to isté a navyše
  surový úhrn podhodnocuje o tretinu (násobok 1,35) – to v §4.1 absorbuje poloha rozdelenia.
- Rampa okolo 0 °C zlepší RMSE √cm o 5 %, ale na primárnej vzorke MAE snehových dní nie (4,42 → 4,45–4,59),
  a v pravdepodobnostnej fáze je pravidlo pri každom predstihu rovnako dobré alebo lepšie (cenzurované
  rozdelenie pri 23 h: BSS 0,22 pravidlo vs 0,14 rampa vs 0,14 wet-bulb + pomer + výška; dvojdielne 0,26 vs
  0,23 vs 0,23, pri 71 h 0,21 vs 0,18 vs 0,18). Wet-bulb oproti
  teplote nič nemení. Výškový faktor ťahá jediná vrcholová stanica (Villacher Alpe 2 140 m) a zhoršuje
  pásmo 1 700–1 950 m, kde ležia naše horné stanice – zamietnutý. Vietor nič.
- Ostáva nevyriešený bias pásma 1 700–1 950 m (−0,4 až −0,7 cm/deň, model podhodnocuje); spoločné
  koeficienty opravia len priemer. Overí sa prospektívne.

**Rodina rozdelenia (3b):** cenzurované normálne na √cm (jedna krivka pre nuly aj veľké úhrny) proti
dvojdielnemu. Empiricky (REPORT.md, tabuľka podľa predpovedaného úhrnu): pri x 1–3 cm je 46 % pozorovaní
0 cm, pri 3–6 cm 20 %, ale medián pozorovania je ≈ x (19 cm pri x 15–25). Cenzurované rozdelenie to rieši
strmou polohou (a −2,0, b 1,7) a pri veľkých x prestreľuje (bin p̄ 0,8 → pozorované 0,5–0,65). Dvojdielne
(fyzika = pravidlo, primárna vzorka, mimo vzorky):

| Zdroj | Predstih | n | udal. | BSS cenzurované (95 % CI) | **BSS dvojdielne** (95 % CI) | CRPSS cenz. | **CRPSS dvojdielne** (95 % CI) |
|---|---|---|---|---|---|---|---|
| IFS hist | 0 h | 4265 | 254 | 0,45 (0,36–0,53) | 0,42 (0,35–0,50) | 0,38 | 0,50 (0,47–0,54) |
| ICON-D2 hist | 0 h | 1572 | 81 | 0,57 (0,44–0,68) | 0,54 (0,43–0,64) | 0,54 | 0,58 (0,55–0,62) |
| IFS single | 23 h | 646 | 24 | 0,22 (−0,16–0,40) | **0,26 (0,01–0,42)** | 0,38 | 0,51 (0,39–0,57) |
| IFS single | 35 h | 646 | 24 | 0,23 (−0,10–0,41) | 0,26 (0,06–0,42) | 0,38 | 0,50 (0,41–0,57) |
| IFS single | 47 h | 646 | 24 | 0,06 (−0,25–0,26) | 0,19 (0,00–0,36) | 0,23 | 0,43 (0,33–0,52) |
| IFS single | 59 h | 646 | 24 | 0,20 (−0,03–0,34) | 0,25 (0,07–0,39) | 0,27 | 0,39 (0,26–0,51) |
| IFS single | 71 h | 646 | 24 | 0,16 (−0,15–0,36) | **0,21 (0,00–0,37)** | 0,25 | 0,39 (0,28–0,48) |
| IFS single | 83 h | 646 | 24 | 0,09 (−0,15–0,22) | 0,12 (−0,01–0,22) | 0,18 | 0,30 (0,18–0,40) |
| IFS single | 95 h | 646 | 24 | 0,04 (−0,17–0,24) | 0,09 (−0,05–0,26) | 0,22 | 0,33 (0,22–0,44) |
| IFS single | 107 h | 646 | 24 | 0,06 (−0,21–0,24) | 0,13 (−0,02–0,26) | 0,20 | 0,35 (0,24–0,44) |
| IFS single | 119 h | 646 | 24 | 0,08 (−0,12–0,26) | 0,10 (−0,02–0,24) | 0,14 | 0,22 (0,09–0,33) |
| IFS single | 131 h | 646 | 24 | −0,13 (−0,53–0,08) | −0,13 (−0,43–0,08) | 0,03 | 0,08 (−0,10–0,20) |
| ICON-D2 prev | 1 d (24–47 h) | 637 | 24 | 0,29 (0,01–0,46) | **0,34 (0,16–0,50)** | 0,34 | 0,55 (0,48–0,61) |

Pri predstihu 0 je cenzurované o 0,03 BSS lepšie (a dobre kalibrované), od 23 h je dvojdielne lepšie vo
všetkom a jeho CI pri 23–71 h neobsahuje nulu. Stránka predstih 0 nepoužíva, preto dvojdielne. Pozn.:
CRPSS = 1 − CRPS / CRPS nepodmieneného dvojdielneho rozdelenia fitovaného na tréningu; BSS proti LOSO
klimatológii po mesiacoch ako v §5.1. Prah udalosti v spojitom rozdelení 15 cm (14,5 cm dáva to isté).

**Zákon podľa predstihu (3c, IFS, krížová validácia zima proti zime, zlúčené cez 23–131 h):** voľných
6 parametrov na predstih vs. jeden fit so sklonmi v predstihu:

| Zákon | parametrov | BSS zlúčené (95 % CI) | CRPSS zlúčené (95 % CI) |
|---|---|---|---|
| h0, h1, b, c lineárne; a, d konštantné | 10 | 0,15 (0,02–0,25) | 0,36 (0,27–0,41) |
| d = 0 | 9 | 0,14 (0,03–0,25) | 0,36 (0,28–0,41) |
| h0 konštantné | 8 | 0,14 (0,03–0,25) | 0,36 (0,28–0,41) |
| h1 konštantné | 7 | 0,14 (0,03–0,25) | 0,35 (0,28–0,41) |
| **len b klesá s predstihom** | **6** | **0,15 (0,04–0,25)** | **0,36 (0,28–0,41)** |
| bez závislosti od predstihu | 5 | 0,14 (0,02–0,24) | 0,35 (0,27–0,41) |

Voľba: najjednoduchší zákon do 0,01 CRPSS od najlepšieho, ktorý zachováva pokles sklonu b (voľné fity:
b 0,69 pri 23 h → 0,25 pri 131 h, h1 1,25 → 0,67, c 0,48 → 0,99). Zákon bez predstihu má v dvoch zimách
rovnaké skóre, ale stránka extrapoluje na predstihy, kde má vzorka málo udalostí; to je rozhodnutie, nie
meranie, overí ho krok 5. Spoľahlivosť zvoleného zákona (primárna vzorka, všetky predstihy): p̄ 0,09 →
pozorované 0,21 (n 341), 0,21 → 0,28 (188), 0,39 → 0,30 (114), 0,57 → 0,60 (25), 0,77 → 0,50 (10);
pri 23–47 h: 0,10 → 0,18 (71), 0,22 → 0,30 (56), 0,40 → 0,41 (34), 0,58 → 0,45 (20), 0,79–0,94 → 0,40–0,50
(9). Nízke pravdepodobnosti sú podhodnotené, vysoké sú na málo prípadoch; nič sa nedolaďuje ručne.

**Kombinácia modelov (3d, tie isté okná, dvojdielne):** len IFS 35 h BSS 0,26 (0,07–0,41), CRPSS 0,50;
len ICON-D2 1 d 0,34 (0,17–0,50), 0,55; vážený priemer úhrnov (váha ICON-D2 0,7) 0,35 (0,17–0,49), 0,56.
Kombinácia je v šume → neprijatá; na D0–D+1 je najlepší samostatný ICON-D2, ďalej IFS.

**Brána z kroku 2:** splnená – pri 23 h 0,26 (0,01–0,42) proti 0,13 surového IFS a −0,04 pravidla;
pri 71 h 0,21 (0,00–0,37) a 83 h 0,12 (−0,01–0,22) proti −0,04 až −0,26; pri predstihu 0 0,42 (0,35–0,50)
proti 0,28–0,30. Dolné hranice CI pri 23–71 h ležia na nule, nie nad ňou – s 24 udalosťami viac nejde.

### 4.3 Predpoklady a hranice modelu

- Zverejnenie IFS = inicializácia + 7 h; len behy 00z/12z (predstihy 23, 35, …, 131 h). Stránka počíta
  predstih ako hodiny od zverejnenia behu, ktorý práve použila, do konca okna D−1 09:00 → D 09:00; pod
  23 h extrapoluje k predstihu 0 (archív pri 0 h dáva b 0,69, zákon 0,60 – konzistentné), nad 131 h drží
  hodnoty pre 131 h, kde je zručnosť ≈ 0 (BSS −0,13, CRPSS 0,08) – pre D+5 a ďalej treba v kroku 4
  rozhodnúť medzi klimatológiou a ensemblom (ENS archív členov neexistuje, nedá sa overiť).
- Koeficienty sú spoločné pre stanice (3 ručné: Villacher Alpe, Kanzelhöhe, Flattnitz; 3 automaty:
  Katschberg, LWD Turracher, LWD Falkert) a dve zimy, 24 udalostí na predstih; intervaly sú široké.
- Okno modelu končí 06 UTC, okno produktu 09:00 SEČ: posun o 2–3 h sa zanedbáva.
- AROME (dnešný model stránky pre D0) sa overiť nedá; návrh pre krok 4: ICON-D2 pre D0–D+1 (vlastný
  zákon, 0–47 h), IFS 9 km pre D+1–D+4 (23–131 h). Výber potvrdí majiteľ.
- Klimatológia v JSON (štyri vysoké ručné stanice): P(≥ 15 cm) po mesiacoch bez podmienky pokrývky
  (podmienka pokrývky v novembri necháva len dni hneď po búrkach) a sadzba v sezóne prevádzky s pokrývkou.
- Prah ALERTu p* závisí od pomeru nákladov N (zmeškaný powder deň : zbytočná cesta), p* ≈ 1/(N + 1);
  majiteľ rozhodne v kroku 4 z tabuľky zásahov/falošných poplachov za sezónu.

### 4.4 Zapojenie do stránky (krok 4a, 4. 10. 2026)

- **Kód:** funkcie modelu sú prenesené do `src/ski-core.js` (`normalCdf`, `powderLawAt`,
  `powderDistribution`, `powderProbAtLeast`, `powderCdf`, `powderQuantileCm`, `publishedAtMs`,
  `powderWindow`, `windowSnowCm`, `powderSnow`); test v `scripts/lib/powder-model.test.ts` porovnáva
  kópiu so `scripts/lib/powder-model.ts` na mriežke predstihov a úhrnov.
- **Koeficienty:** `src/powder-model.ts` (`version` 1, `fittedOn` 2026-10-04) je kópia zákonov z
  `data/model/powder-model.json`; test v `src/ski.test.ts` kontroluje rovnosť, a tiež že fyzika modelu
  (T ≤ 1 °C, 0,7 cm/mm) je presne pravidlo stránky. Do stránky idú v konfigurácii snímky.
- **Snímka v2:** každý deň deterministických horizontov má `powderSnow = { forecastCm, leadH,
  probability, medianCm, p90Cm }`, alebo `null` (medzera v okne, model bez zákona); horizont nesie
  `powderLaw` a `publishedAtMs`. Ansámbel (D+3–D+9) zatiaľ bez pravdepodobnosti – nemá archív členov,
  z ktorého by sa dal fitovať zákon.
- **Okno:** D−1 09:00 → D 09:00 miestneho času na hornej stanici, značky (začiatok, koniec] ako
  „predchádzajúca hodina“ Open-Meteo; úhrn = pravidlo stránky (ako `freshSnowCm`, iné okno).
- **Predstih** = koniec okna − (inicializácia behu + oneskorenie zverejnenia: IFS 7 h ako v backteste,
  ICON-D2 1,5 h, z meta.json); bez metadát behu sa použije čas načítania (predstih vyjde kratší, model
  mierne ostrejší, než je kalibrovaný). Záporný predstih znamená, že okno už skončilo (D0 doobeda) –
  zákon ho oreže na 0.
- **Zdroje:** horizont `now` (D0) prepnutý z GeoSphere AROME na **DWD ICON-D2 2,2 km** – jediný
  krátkodobý model s overiteľným zimným archívom (zákon 0–47 h); AROME archív nemá. Horizont `short`
  (IFS 9 km, D0–D+2) používa zákon IFS (23–131 h, pod 23 h extrapolácia). Overené naživo 4. 10. 2026:
  ICON-D2 cez forecast API vracia všetky štyri premenné v očakávaných jednotkách, minulé dni aj 48 h
  dopredu, CORS `*`, oneskorenie zverejnenia 1,4 h, beh každé 3 h.
- **Stupne a prah (4b, 4. 10. 2026):** `powderSnow.stage` = ALERT (D0–D+1), POZOR (D+2–D+3), VÝHĽAD
  (D+4–D+9) podľa poradia dňa od prvého lyžiarskeho dňa; `powderSnow.alert` = pravdepodobnosť ≥ p*.
  Majiteľ pomer nákladov N nevedel určiť („neviem“, 4. 10. 2026), preto je p* **predvolená hodnota,
  nie meranie**: strediská sú na krátku cestu od domu, zbytočná cesta je lacná a zmeškaný deň drahý,
  N = 4 → p* = 1/(N + 1) = 0,20. Mimo vzorky to deň vopred zachytí 3 zo 4 powder dní (POD 0,75) za
  cenu asi 2,7 falošného poplachu na stanicu a sezónu, tri dni vopred POD 0,38 pri 1,4 falošného
  (rozhodovacia tabuľka v `data/model/REPORT.md`). Jedno číslo v `src/powder-model.ts` (`alert`).
  Pokryté dni: D0 (ICON-D2 aj IFS), D+1 a D+2 (IFS); D+3 by potreboval štvrtý deň horizontu `short`
  (zmena tabuľky stránky), D+4–D+9 ansámbel bez zákona.
- **Ešte nie je:** zobrazenie v UI, pravdepodobnosť pre ansámbel, D+3.


### 4.5 Zložky lyžiarskeho dňa (krok 6)

**6a – dnešné pravidlá stránky proti staniciam (4. 10. 2026).** `npm run rules`
(`scripts/rules-verify.ts`, kalibrácia `scripts/lib/calibrate.ts`), úplné tabuľky v
`data/rules/REPORT.md`, čísla v `data/rules/rules-verification.json`; výsledky v §5.3.

- **Pravda** = hodinové dáta šiestich automatov GeoSphere (Weitensfeld 704 m, Arriach 890 m,
  Flattnitz 1 437 m, Kanzelhöhe 1 520 m, Katschberg 1 635 m, Villacher Alpe 2 117 m; rr, tl, ffx,
  so_h; zimy 2022/23–2025/26) zhrnuté na lyžiarsky deň 10:00–16:00 presne ako na stránke. Dážď na
  stanici = zrážky v hodinách s T > 1 °C (rovnaké pravidlo ako na model; zrážkomer typ nepozná).
  Hodinové značky GeoSphere sú „predchádzajúca hodina“ ako Open-Meteo (krížová korelácia s modelom má
  maximum pri posune 0 pre zrážky, slnko aj nárazy; denné zrážky 06–06 UTC sedia so súčtom značiek
  07..06 na r = 1,000) – overené, nie predpoklad.
- **Čo sa hodnotí:** každé pravidlo ako áno/nie na prahu stránky (deterministicky) a ako logistická
  krivka na hodnote modelu (dve čísla, fit bez testovanej sezóny). Nárazy len na horských staniciach.
- **Rozhodnutia:** (1) áno/nie pravidlá nahradia v kroku 6d kalibrované pravdepodobnosti podľa
  modelu a predstihu – vo všetkých piatich zložkách majú vyšší BSS, deterministické sú väčšinou pod
  nulou (§5.3). (2) Nárazy z IFS 9 km nemajú na vrcholoch zručnosť (AUC 0,74–0,79, bias −5,5 až −6,9
  km/h, kalibrovaný BSS ≈ 0 pri každom predstihu) – zložku vetra pre D+1 a ďalej treba buď vypustiť,
  alebo brať z ICON-D2 len do 47 h a potom z klimatológie; rozhodne 6d. (3) Prahy stránky ostávajú
  (sú to definície „zlého“ a „ujde“ dňa), mení sa len to, že sa k nim dá pravdepodobnosť.
- **Predpoklady:** stanice nestoja na vrcholoch lanoviek (Villacher Alpe je exponovaný vrchol, kde
  deterministický prah 60 km/h funguje, FAR 0,11; na 1 437–1 635 m má FAR 0,71–0,87 – naše horné
  stanice 1 832–2 197 m sú niekde medzi); slnko na stanici meria heliograf, model dáva
  `sunshine_duration`; predstih IFS +7 h ako v §5.1.

## 5. Výsledky podľa predstihu

### 5.1 Krok 2 – backtest a baseline (4. 10. 2026)

Všetko počíta `npm run backtest` z archívov, ktoré stiahol `npm run backtest:fetch`; úplné tabuľky
v `data/backtest/REPORT.md`, čísla v `data/backtest/summary.json`. Udalosť POWDER_SNEH = ≥ 15 cm za
deň merania M. Použité sú len predpovede zverejnené pred koncom okna (M 06 UTC): IFS 9 km celé behy 00z
a 12z zo Single Runs (zverejnenie = inicializácia + 7 h; jedno meranie dalo 6,5 h), Previous Runs ako
kompozity „pred N dňami“ (predstih 24N–24N+23 h podľa hodiny), Historical Forecast ako hranica predstihu 0.
Pravda: ručný nový sneh (Villacher Alpe, Kanzelhöhe, Flattnitz; eHYD Turracher Höhe do 2023 len pri
predstihu 0), inak ΔHS automatov o 06 UTC (Katschberg, Flattnitz 2025/26, LWD Turracher a Falkert
2025/26). Klimatológia = leave-one-season-out po staniciach a mesiacoch z dlhých radov (Katschberg
preberá Kanzelhöhe, LWD preberajú eHYD Turracher Höhe). Verzie predpovede: surový `snowfall` modelu
a **dnešné pravidlo stránky** (zrážky × 0,7 cm/mm, keď je T stanice ≤ 1 °C) – obe ako deterministické
áno/nie pri 15 cm, AUC však hodnotí samotný úhrn. CI = 95 % blokový bootstrap po dňoch (10-dňové bloky,
všetky stanice dňa spolu); BSS a AUC v bootstrape len z výberov s ≥ 5 udalosťami.

**Primárna vzorka** (sezóna prevádzky 1. 12. – 15. 4., pokrývka ≥ 30 cm, zimy 2024/25 a 2025/26;
pri predstihu 0 aj 2016/17 →): 646 staničných dní, 24 udalostí; výber riadkov (všetky v REPORT.md):

| Zdroj | Verzia | Predstih | n | udalostí | Brier | Brier klim. | **BSS** (95 % CI) | POD | FAR | CSI | AUC | bias [cm] | MAE / MAE klim. [cm] |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 23 h | 646 | 24 | 0,03 | 0,04 | **0,13 (-0,02–0,27)** | 0,25 (0,04–0,43) | 0,25 (0,00–0,50) | 0,23 | 0,96 (0,93–0,98) | -0,1 | 1,9 / 3,9 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 23 h | 646 | 24 | 0,04 | 0,04 | **-0,04 (-0,43–0,25)** | 0,29 (0,00–0,56) | 0,50 (0,25–1,00) | 0,23 | 0,97 (0,94–0,98) | 0,4 | 1,8 / 3,9 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 35 h | 646 | 24 | 0,04 | 0,04 | **-0,08 (-0,37–0,18)** | 0,13 (0,00–0,28) | 0,57 (0,00–1,00) | 0,11 | 0,97 (0,94–0,99) | -0,1 | 1,9 / 3,9 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 35 h | 646 | 24 | 0,04 | 0,04 | **0,00 (-0,43–0,29)** | 0,33 (0,09–0,50) | 0,47 (0,21–0,83) | 0,26 | 0,97 (0,95–0,98) | 0,3 | 1,8 / 3,9 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 47 h | 646 | 24 | 0,04 | 0,04 | **-0,04 (-0,22–0,20)** | 0,21 (0,00–0,45) | 0,50 (0,29–1,00) | 0,17 | 0,90 (0,79–0,97) | -0,1 | 2,0 / 3,9 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 47 h | 646 | 24 | 0,04 | 0,04 | **-0,08 (-0,47–0,27)** | 0,29 (0,00–0,60) | 0,53 (0,32–1,00) | 0,22 | 0,96 (0,94–0,98) | 0,2 | 1,8 / 3,9 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 71 h | 646 | 24 | 0,04 | 0,04 | **-0,04 (-0,22–0,16)** | 0,21 (0,00–0,46) | 0,50 (0,20–1,00) | 0,17 | 0,90 (0,80–0,97) | -0,1 | 2,1 / 3,9 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 71 h | 646 | 24 | 0,04 | 0,04 | **-0,08 (-0,49–0,23)** | 0,29 (0,00–0,56) | 0,53 (0,25–1,00) | 0,22 | 0,96 (0,92–0,98) | 0,3 | 2,0 / 3,9 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 83 h | 646 | 24 | 0,04 | 0,04 | **-0,08 (-0,28–0,09)** | 0,08 (0,00–0,18) | 0,60 (0,00–1,00) | 0,07 | 0,89 (0,77–0,95) | -0,1 | 2,3 / 3,9 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 83 h | 646 | 24 | 0,04 | 0,04 | **-0,26 (-0,63–0,01)** | 0,13 (0,00–0,24) | 0,73 (0,50–1,00) | 0,09 | 0,92 (0,83–0,96) | 0,3 | 2,3 / 3,9 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 107 h | 646 | 24 | 0,04 | 0,04 | **-0,26 (-0,50–-0,04)** | 0,13 (0,03–0,29) | 0,73 (0,67–0,80) | 0,09 | 0,91 (0,84–0,97) | 0,1 | 2,2 / 3,9 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 107 h | 646 | 24 | 0,05 | 0,04 | **-0,30 (-0,61–-0,05)** | 0,25 (0,07–0,50) | 0,67 (0,54–0,81) | 0,17 | 0,95 (0,92–0,97) | 0,5 | 2,2 / 3,9 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 131 h | 646 | 24 | 0,05 | 0,04 | **-0,52 (-1,47–-0,02)** | 0,08 (0,00–0,13) | 0,87 (0,50–1,00) | 0,05 | 0,78 (0,56–0,92) | 0,1 | 2,8 / 3,9 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 131 h | 646 | 24 | 0,06 | 0,04 | **-0,78 (-1,81–-0,24)** | 0,08 (0,00–0,13) | 0,90 (0,82–1,00) | 0,05 | 0,79 (0,56–0,93) | 0,6 | 2,9 / 3,9 |
| ICON-D2, previous runs | surový `snowfall` | 1 d (24–47 h) | 646 | 24 | 0,03 | 0,04 | **0,18 (-0,12–0,50)** | 0,38 (0,09–0,63) | 0,31 (0,00–0,62) | 0,32 | 0,98 (0,96–0,99) | -0,1 | 1,7 / 3,9 |
| ICON-D2, previous runs | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 1 d (24–47 h) | 637 | 24 | 0,03 | 0,04 | **0,09 (-0,20–0,35)** | 0,38 (0,08–0,64) | 0,40 (0,18–0,73) | 0,30 | 0,98 (0,97–0,99) | 0,1 | 1,6 / 3,8 |
| ICON-EU, previous runs | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 1 d (24–47 h) | 646 | 24 | 0,04 | 0,04 | **-0,04 (-0,32–0,23)** | 0,13 (0,00–0,28) | 0,50 (0,00–1,00) | 0,11 | 0,98 (0,96–0,99) | -0,2 | 1,7 / 3,9 |
| ICON-EU, previous runs | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 2 d (48–71 h) | 646 | 24 | 0,03 | 0,04 | **0,18 (-0,08–0,47)** | 0,33 (0,08–0,65) | 0,27 (0,00–0,67) | 0,30 | 0,96 (0,92–0,98) | -0,1 | 1,8 / 3,9 |
| IFS 0,25°, previous runs | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 1 d (24–47 h) | 646 | 24 | 0,03 | 0,04 | **0,05 (-0,24–0,24)** | 0,38 (0,17–0,57) | 0,44 (0,20–0,67) | 0,29 | 0,97 (0,94–0,98) | 0,3 | 1,8 / 3,9 |
| GFS, previous runs | surový `snowfall` | 1 d (24–47 h) | 646 | 24 | 0,03 | 0,04 | **0,05 (-0,12–0,20)** | 0,13 (0,00–0,22) | 0,25 (0,00–1,00) | 0,12 | 0,92 (0,81–0,98) | -0,5 | 2,0 / 3,9 |
| GFS, previous runs | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 1 d (24–47 h) | 646 | 24 | 0,04 | 0,04 | **-0,04 (-0,38–0,23)** | 0,25 (0,08–0,36) | 0,50 (0,00–0,80) | 0,20 | 0,96 (0,94–0,98) | 0,4 | 2,0 / 3,9 |
| IFS 9 km, Historical Forecast | surový `snowfall` | 0 h (zošité behy) | 3590 | 187 | 0,04 | 0,05 | **0,28 (0,19–0,39)** | 0,37 (0,28–0,48) | 0,14 (0,07–0,22) | 0,35 | 0,96 (0,95–0,98) | -0,7 | 1,7 / 4,0 |
| IFS 9 km, Historical Forecast | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 0 h (zošité behy) | 3590 | 187 | 0,04 | 0,05 | **0,30 (0,19–0,42)** | 0,47 (0,37–0,57) | 0,23 (0,15–0,33) | 0,41 | 0,97 (0,96–0,98) | -0,3 | 1,6 / 4,0 |
| ICON-D2, Historical Forecast | surový `snowfall` | 0 h (zošité behy) | 542 | 32 | 0,05 | 0,06 | **0,17 (-0,01–0,42)** | 0,19 (0,02–0,43) | 0,00 (0,00–0,00) | 0,19 | 0,97 (0,94–0,99) | -1,6 | 2,3 / 4,6 |
| ICON-D2, Historical Forecast | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 0 h (zošité behy) | 542 | 32 | 0,04 | 0,06 | **0,36 (0,13–0,61)** | 0,44 (0,19–0,67) | 0,13 (0,00–0,30) | 0,41 | 0,97 (0,95–0,99) | -1,0 | 1,9 / 4,6 |
| – | klimatológia (LOSO) | (vzorka IFS 23 h) | 646 | 24 | 0,04 | 0,04 | 0,00 | – | – | – | 0,64 (0,46–0,74) | 1,2 | 3,9 |

**Sekundárna vzorka** (všetky zimné dni s pravdou, bez pokrývky): 1 507 dní, 30 udalostí:

| Zdroj | Verzia | Predstih | n | udalostí | Brier | Brier klim. | **BSS** (95 % CI) | POD | FAR | CSI | AUC | bias [cm] | MAE / MAE klim. [cm] |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 23 h | 646 | 24 | 0,03 | 0,04 | **0,13 (-0,02–0,27)** | 0,25 (0,04–0,43) | 0,25 (0,00–0,50) | 0,23 | 0,96 (0,93–0,98) | -0,1 | 1,9 / 3,9 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 23 h | 1507 | 30 | 0,02 | 0,02 | **0,23 (0,11–0,37)** | 0,23 (0,06–0,41) | 0,22 (0,00–0,31) | 0,22 | 0,97 (0,95–0,99) | 0,2 | 1,4 / 3,6 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 23 h | 1507 | 30 | 0,02 | 0,02 | **0,04 (-0,21–0,32)** | 0,23 (0,04–0,47) | 0,53 (0,29–0,88) | 0,18 | 0,98 (0,97–0,99) | 0,4 | 1,4 / 3,6 |
| IFS 9 km, celé behy 00z/12z | surový `snowfall` | 71 h | 1507 | 27 | 0,02 | 0,02 | **0,12 (-0,01–0,30)** | 0,26 (0,07–0,46) | 0,46 (0,20–0,70) | 0,21 | 0,92 (0,84–0,98) | 0,2 | 1,5 / 3,6 |
| IFS 9 km, celé behy 00z/12z | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 71 h | 1507 | 27 | 0,02 | 0,02 | **0,09 (-0,17–0,37)** | 0,33 (0,10–0,58) | 0,50 (0,21–0,80) | 0,25 | 0,97 (0,96–0,99) | 0,4 | 1,5 / 3,6 |
| ICON-D2, previous runs | surový `snowfall` | 1 d (24–47 h) | 1787 | 34 | 0,02 | 0,02 | **0,24 (0,07–0,48)** | 0,29 (0,08–0,55) | 0,29 (0,00–0,50) | 0,26 | 0,99 (0,98–0,99) | 0,0 | 1,2 / 3,4 |
| ICON-D2, previous runs | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 1 d (24–47 h) | 1769 | 34 | 0,02 | 0,02 | **0,18 (0,02–0,37)** | 0,32 (0,13–0,54) | 0,39 (0,20–0,63) | 0,27 | 0,99 (0,98–0,99) | 0,2 | 1,1 / 3,4 |
| ICON-EU, previous runs | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 1 d (24–47 h) | 1787 | 34 | 0,02 | 0,02 | **0,07 (-0,07–0,24)** | 0,12 (0,00–0,24) | 0,50 (0,00–1,00) | 0,11 | 0,98 (0,97–0,99) | 0,0 | 1,2 / 3,4 |
| IFS 9 km, Historical Forecast | surový `snowfall` | 0 h (zošité behy) | 7481 | 275 | 0,03 | 0,04 | **0,23 (0,15–0,30)** | 0,32 (0,25–0,40) | 0,21 (0,14–0,31) | 0,30 | 0,96 (0,95–0,97) | -0,3 | 1,4 / 3,6 |
| IFS 9 km, Historical Forecast | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 0 h (zošité behy) | 7481 | 275 | 0,03 | 0,04 | **0,21 (0,10–0,31)** | 0,42 (0,35–0,50) | 0,33 (0,24–0,43) | 0,35 | 0,98 (0,97–0,98) | 0,0 | 1,4 / 3,6 |
| ICON-D2, Historical Forecast | surový `snowfall` | 0 h (zošité behy) | 1066 | 40 | 0,03 | 0,04 | **0,15 (-0,01–0,38)** | 0,15 (0,00–0,36) | 0,00 (0,00–0,00) | 0,15 | 0,98 (0,96–0,99) | -1,0 | 1,8 / 3,9 |
| ICON-D2, Historical Forecast | dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 0 h (zošité behy) | 1066 | 40 | 0,02 | 0,04 | **0,37 (0,15–0,59)** | 0,42 (0,20–0,64) | 0,11 (0,00–0,25) | 0,40 | 0,98 (0,96–1,00) | -0,5 | 1,5 / 3,9 |
| – | klimatológia (LOSO) | (vzorka IFS 23 h) | 1507 | 30 | 0,02 | 0,02 | 0,00 | – | – | – | 0,55 (0,42–0,66) | 2,1 | 3,6 |

**Podľa stanice** (IFS surový `snowfall`, primárna vzorka; CI pri 1–4 udalostiach nič nehovoria):

| Stanica | Predstih | n | udalostí | BSS (95 % CI) | POD | FAR | AUC | bias [cm] | MAE [cm] |
| Villacher Alpe 2140 m (ručne) | 23 h | 216 | 11 | 0,13 (-0,28–0,46) | 0,27 (0,00–0,50) | 0,25 (0,00–1,00) | 0,95 (0,91–0,98) | -0,9 | 1,5 |
| Villacher Alpe 2140 m (ručne) | 71 h | 216 | 11 | -0,07 (-0,48–0,32) | 0,18 (0,00–0,50) | 0,50 (0,00–1,00) | 0,86 (0,69–0,99) | -1,0 | 1,7 |
| Kanzelhöhe 1520 m (ručne, automat) | 23 h | 99 | 4 | -0,06 (-0,09–-0,06) | 0,00 (0,00–0,00) | – (–––) | 0,98 (0,96–1,00) | -1,7 | 1,7 |
| Kanzelhöhe 1520 m (ručne, automat) | 71 h | 99 | 4 | 0,20 (-0,08–0,79) | 0,25 (0,00–1,00) | 0,00 (0,00–0,00) | 0,93 (0,94–1,00) | -1,8 | 1,9 |
| Flattnitz 1437 m (ručne, automat) | 23 h | 73 | 2 | 0,53 (0,10–0,79) | 0,50 (0,00–1,00) | 0,00 (0,00–0,00) | 1,00 (1,00–1,00) | 1,1 | 1,9 |
| Flattnitz 1437 m (ručne, automat) | 71 h | 73 | 2 | 0,53 (0,14–0,82) | 0,50 (0,00–1,00) | 0,00 (0,00–0,00) | 1,00 (1,00–1,00) | 1,2 | 2,1 |
| Katschberg 1635 m (automat) | 23 h | 58 | 3 | 0,31 (0,09–0,79) | 0,33 (0,00–1,00) | 0,00 (0,00–0,00) | 0,94 (0,88–1,00) | 1,0 | 2,4 |
| Katschberg 1635 m (automat) | 71 h | 58 | 3 | -0,38 (-0,51–-0,06) | 0,00 (0,00–0,00) | 1,00 (1,00–1,00) | 0,96 (0,92–1,00) | 1,1 | 2,8 |
| LWD Turracherhoehe 1795 m (automat, 2025/26) | 23 h | 108 | 1 | -0,74 (-0,47–-0,26) | 0,00 (0,00–0,00) | 1,00 (1,00–1,00) | 0,99 (0,99–1,00) | 1,0 | 2,2 |
| LWD Turracherhoehe 1795 m (automat, 2025/26) | 71 h | 108 | 1 | -0,74 (-0,05–-0,05) | 0,00 (0,00–0,00) | 1,00 (1,00–1,00) | 0,96 (0,97–0,98) | 0,9 | 2,3 |
| LWD Falkert 1886 m (automat, 2025/26) | 23 h | 92 | 3 | 0,30 (-0,07–0,79) | 0,33 (0,00–1,00) | 0,00 (0,00–0,00) | 0,98 (0,95–1,00) | 1,0 | 2,5 |
| LWD Falkert 1886 m (automat, 2025/26) | 71 h | 92 | 3 | -0,04 (-0,48–0,79) | 0,33 (0,00–1,00) | 0,50 (0,00–1,00) | 0,91 (0,80–0,97) | 0,9 | 2,6 |

**Čo z toho plynie (overené):**

- Deterministický prah 15 cm na surovom úhrne má voči klimatológii malú alebo žiadnu Brierovu zručnosť
  pri každom predstihu: najlepšie IFS 23 h BSS 0,13 (−0,02 až 0,27) a ICON-D2 kompozit 1 d 0,18 (−0,12
  až 0,50); od ~80 h je záporná (FAR 0,6–0,9 – model hlási udalosti, ktoré neprídu). Dnešné pravidlo
  stránky dopadá rovnako alebo horšie (23 h: −0,04).
- Rozlišovacia schopnosť úhrnu je však výborná: AUC 0,96–0,98 do ~35 h, 0,90 pri 47–71 h, 0,86–0,91
  pri 95–119 h, 0,78 pri 131 h; klimatológia 0,64. MAE úhrnu 1,9 cm pri 23 h oproti 3,9 cm klimatológie
  a stále 2,8 cm pri 131 h. Informácia je v predpovedi do ~5 dní; chýba kalibrácia – prevod úhrnu
  a jeho neistoty na pravdepodobnosť. To je úloha kroku 3.
- Ani predstih 0 (zošité behy, 3 590 dní, 187 udalostí) nedá deterministickému prahu viac než POD 0,37
  (surový) / 0,47 (pravidlo) pri BSS 0,28–0,30: strop „áno/nie“ je nízky, pravdepodobnostný výstup
  je nutný, nie kozmetický.
- Bias závisí od výšky: IFS podhodnocuje na Villacher Alpe 2 140 m (−0,9 cm/deň) a nadhodnocuje na
  staniciach 1 400–1 900 m (+1,0 cm/deň). ICON-EU surový `snowfall` je sústavne nízky (−0,5 cm/deň,
  POD 0,04) – ako surový nepoužiteľný; pravidlo z jeho zrážok je lepšie.
- Previous Runs ICON-D2 (2,2 km) je pri ~1 dni najlepší surový zdroj (POD 0,38, FAR 0,31, AUC 0,98,
  MAE 1,7 cm) – kandidát na D0–D+1 namiesto AROME, ktorý archív nemá.

**Brána pre krok 3** (tá istá vzorka, tie isté CI): pri 23 h prekonať BSS 0,13 surového IFS aj −0,04
pravidla s CI nad nulou; pri 71–83 h prekonať −0,04 až −0,26; pri predstihu 0 prekonať 0,28–0,30.

**Predpoklady a limity kroku 2:** oneskorenie IFS 7 h; len behy 00z/12z (06z a 18z by dali predstihy
17 h a 29 h pre sloty CI 16:13 a 04:13 UTC – stiahnuť, keď dovolí denný limit); kompozity Previous Runs
miešajú predstihy v rámci dňa; ICON-D2 Historical Forecast zatiaľ len do 12/2023 (hodinový limit
Open-Meteo, dokončiť); 24 udalostí v primárnej vzorke – všetky intervaly sú široké a rozhodujúci test
ostáva sezóna 2026/27.


### 5.2 Krok 5 – prospektívne overovanie (od 11/2026, vyhodnotenie po sezóne 2026/27)

**5a – log predpovedí (4. 10. 2026).** Každý beh generátora, ktorý stiahol čerstvé dáta (CI 04:13,
10:13, 16:13 UTC, november–apríl; nie opakované renderovanie zo snímky), pripíše jeden riadok JSON do
`data/prospective/<sezóna>.jsonl` (sezóna „2026-27“ = august 2026 – júl 2027; CI ho commituje spolu so
stránkou). Riadok (`src/prospective.ts`, formát `v: 1`):

- `fetchedAtMs`, `firstDate`, `snapshotVersion`, `modelVersion` (verzia koeficientov);
- pre každý horizont `model`, `runAtMs`, `publishedAtMs`;
- `resorts`: pre každé stredisko a deň `date`, `status`, `freshSnowCm`, `rainBaseMm`, `maxGustKmh`,
  `sunHours` a celý `powderSnow` (úhrn okna, predstih, pravdepodobnosť, medián, p90, stupeň, značka);
  pri ansámbli `goodPct/fairPct/badPct`, `snowCm` (p10/p50/p90) a **`members`** – úhrn okna D−1 09:00
  → D 09:00 pre každého z 51 členov na 0,1 cm (D0 má `null`, ansámbel sa nesťahuje spätne); z toho sa
  po sezóne dá fitovať zákon pre D+3–D+9;
- `stations`: tá istá predpoveď (rovnaké premenné, dátumy, `elevation=` výška stanice, ten istý beh)
  pre šesť staníc s pravdou – Villacher Alpe 2 140 m, Kanzelhöhe 1 520 m, Flattnitz 1 437 m,
  Katschberg 1 635 m, LWD Turracherhoehe 1 795 m, LWD Falkert 1 886 m – s `powderSnow` na deň, pre
  horizonty ICON-D2 a IFS (dve požiadavky navyše na beh, 6 bodov, v limitoch). Keď sa stanice
  nepodarí stiahnuť, riadok sa zapíše bez nich a generátor to vypíše; log nikdy nezastaví stránku.

Veľkosť: ~20 kB na riadok, ~3 riadky denne, ~10 MB za sezónu v jednom textovom súbore. Riadok
s rovnakým `fetchedAtMs` sa nezdvojí. Overené naživo 4. 10. 2026 (`SKI_LOG_DIR` do scratch adresára).

**Čo sa z toho po sezóne vyhodnotí (5b, `npm run verify`, skript napísaný 4. 10. 2026 a testovaný na syntetických riadkoch; ostré spustenie po sezóne 2026/27):** pravda zo staníc (GeoSphere ručný nový
sneh a ΔHS automatov o 06 UTC, LWD po súhlase) cez `npm run truth:fetch`; pre každý horizont, deň
poradia (D0, D+1, D+2) a stanicu BSS proti klimatológii, spoľahlivosť, CRPS a rozhodovacia tabuľka
pri použitom p*, s blokovým bootstrapom po dňoch ako v §5.1; stupne ALERT/POZOR a značka presne tak,
ako ich stránka mala v čase behu (nič sa neprepočítava z neskorších dát). Horné stanice lanoviek
nemajú vlastnú pravdu: Turracher Höhe a Falkert sa porovnajú s LWD stanicami 1,4–1,6 km od lanoviek,
Hochrindl a Bad Kleinkirchheim len orientačne s najbližšími stanicami (10–15 km, viď §3.9 – polovica
udalostí sa nezdieľa). Počas sezóny sa nič nefituje; prekalibrovanie (§7) až po sezóne.


### 5.3 Krok 6a – dnešné pravidlá stránky podľa predstihu (4. 10. 2026)

Sezóna prevádzky, zimy 2022/23–2025/26 (IFS celé behy a ICON-D2 previous runs len 2024/25–2025/26,
štyri horské stanice); „det.“ = BSS áno/nie na prahu stránky, „kal.“ = BSS logistickej kalibrácie mimo
vzorky; klimatológia = početnosť udalosti na stanici a v mesiaci z ostatných sezón.

| Zložka | Zdroj | Predstih | n | udal. | POD | FAR | **BSS det.** (CI) | AUC | bias | **BSS kal.** (CI) |
|---|---|---|---|---|---|---|---|---|---|---|
| dážď ≥ 1 mm | IFS hist | 0 h | 3215 | 108 | 0,84 | 0,61 | −0,55 (−1,21–−0,12) | 0,94 | +0,2 mm | 0,40 (0,30–0,50) |
| dážď ≥ 1 mm | ICON-D2 hist | 0 h | 3209 | 108 | 0,74 | 0,34 | 0,34 (0,10–0,53) | 0,95 | 0,0 | **0,56 (0,42–0,68)** |
| dážď ≥ 1 mm | ICON-D2 prev | 1 d | 1071 | 24 | 0,58 | 0,53 | −0,09 (−0,59–0,26) | 0,93 | 0,0 | 0,34 (0,15–0,56) |
| dážď ≥ 1 mm | IFS behy | 12 h | 1079 | 24 | 0,63 | 0,65 | −0,55 (−1,64–0,02) | 0,92 | +0,1 | 0,24 (0,08–0,40) |
| dážď ≥ 1 mm | IFS behy | 24 h | 1079 | 24 | 0,71 | 0,60 | −0,38 (−1,33–0,11) | 0,94 | +0,1 | 0,18 (0,04–0,30) |
| dážď ≥ 1 mm | IFS behy | 72 h | 1079 | 24 | 0,54 | 0,73 | −0,93 (−1,74–−0,35) | 0,82 | +0,1 | 0,21 (0,10–0,32) |
| dážď ≥ 1 mm | IFS behy | 120 h | 1079 | 24 | 0,38 | 0,78 | −0,93 (−2,15–−0,24) | 0,78 | 0,0 | −0,06 (−0,15–0,03) |
| dážď ≥ 0,2 mm | IFS hist | 0 h | 3215 | 202 | 0,87 | 0,67 | −1,06 (−1,63–−0,67) | 0,92 | +0,2 | 0,37 (0,27–0,44) |
| dážď ≥ 0,2 mm | ICON-D2 hist | 0 h | 3209 | 202 | 0,72 | 0,37 | 0,23 (0,03–0,39) | 0,87 | 0,0 | 0,45 (0,34–0,54) |
| dážď ≥ 0,2 mm | ICON-D2 prev | 1 d | 1071 | 52 | 0,63 | 0,41 | 0,12 (−0,15–0,44) | 0,82 | 0,0 | 0,41 (0,23–0,59) |
| náraz > 60 km/h | IFS hist | 0 h | 2161 | 214 | 0,18 | 0,61 | −0,37 (−0,55–−0,22) | 0,74 | −5,5 km/h | −0,03 (−0,10–0,06) |
| náraz > 60 km/h | ICON-D2 hist | 0 h | 2161 | 214 | 0,64 | 0,55 | −0,43 (−0,62–−0,25) | 0,91 | +3,4 | 0,18 (0,11–0,26) |
| náraz > 60 km/h | ICON-D2 prev | 1 d | 1088 | 102 | 0,59 | 0,52 | −0,30 (−0,57–−0,04) | 0,91 | +1,1 | 0,17 (0,05–0,30) |
| náraz > 60 km/h | IFS behy | 12–72 h | 1088 | 102 | 0,14–0,20 | 0,49–0,59 | −0,23 až −0,32 | 0,76 | −6,5 | −0,01 až −0,03 |
| náraz > 40 km/h | IFS hist | 0 h | 2161 | 676 | 0,44 | 0,32 | −0,35 (−0,48–−0,21) | 0,75 | −5,5 | 0,03 (−0,06–0,12) |
| náraz > 40 km/h | ICON-D2 hist | 0 h | 2161 | 676 | 0,77 | 0,35 | −0,11 (−0,25–0,03) | 0,88 | +3,4 | 0,26 (0,18–0,35) |
| náraz > 40 km/h | ICON-D2 prev | 1 d | 1088 | 321 | 0,76 | 0,30 | 0,05 (−0,10–0,20) | 0,90 | +1,1 | 0,34 (0,25–0,43) |
| náraz > 40 km/h | IFS behy | 12–72 h | 1088 | 321 | 0,38–0,45 | 0,26–0,30 | −0,19 až −0,30 | 0,76–0,79 | −6,5 | 0,06–0,11 |
| slnko < 1 h | IFS hist | 0 h | 3253 | 996 | 0,52 | 0,07 | 0,27 (0,17–0,34) | 0,91 | +1,4 h | **0,54 (0,47–0,59)** |
| slnko < 1 h | ICON-D2 hist | 0 h | 3253 | 996 | 0,34 | 0,02 | 0,07 (−0,01–0,15) | 0,91 | +1,9 h | 0,54 (0,47–0,59) |
| slnko < 1 h | ICON-D2 prev | 1 d | 1087 | 316 | 0,33 | 0,10 | 0,01 (−0,10–0,11) | 0,87 | +1,9 h | 0,41 (0,32–0,48) |

Po staniciach (ICON-D2, predstih 0): dážď ≥ 1 mm je najlepší v údolí (Weitensfeld det. 0,43, kal.
0,50; Arriach 0,25 / 0,62), kde na tom záleží; náraz > 60 km/h deterministicky funguje len na Villacher
Alpe (det. 0,36, FAR 0,11, bias −8 km/h), na Flattnitzi, Kanzelhöhe a Katschbergu má FAR 0,71–0,87
(bias +7 až +9 km/h; det. −0,99 až −4,70, kal. 0,09–0,41); zamračenie má kalibrované 0,46–0,62 všade.

**Čo z toho plynie (overené):** áno/nie pravidlá stránky sú zle kalibrované – dážď varuje príliš
často (IFS FAR 0,6), vietor je bez zručnosti z IFS a s vysokým FAR z ICON-D2 pod 1 700 m, zamračenie
varuje príliš málo (modely majú o 1,4–1,9 h slnka viac než stanice). Kalibrovaná pravdepodobnosť má
pri predstihu 0 a 1 d kladný BSS s intervalom nad nulou pre dážď, zamračenie a náraz z ICON-D2;
z IFS má zmysel pre dážď do ~3 dní a pre zamračenie pri predstihu 0 (pre dlhšie predstihy slnko v archíve
behov nie je). Slnko z IFS celých behov sa nedá overiť podľa predstihu (premenná v Single Runs chýba).

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
- Deterministický prah na surovom úhrne nemá zručnosť (BSS ≤ 0,13 pri 23 h, záporná od ~80 h), hoci AUC
  je 0,9–0,98: bez kalibrovanej pravdepodobnosti sa POWDER ALERT postaviť nedá (§5.1).
- Kalibrovaný model (§4) má pri 23–71 h BSS 0,19–0,26 s dolnou hranicou CI na nule a od ~83 h zručnosť
  slabne (BSS ≈ 0,1, pri 131 h ≈ 0); jeho spoľahlivosť pri vysokých pravdepodobnostiach stojí na jednotkách
  prípadov. Rozhodujúce overenie príde až zo sezóny 2026/27.

## 7. Prekalibrovanie

Po sezóne 2026/27: `npm run verify` nad `data/prospective/2026-27.jsonl` (§5.2) rozhodne, či koeficienty
v `src/powder-model.ts` ostanú (BSS a spoľahlivosť v medziach §4), alebo sa `npm run model` spustí znova
aj s novou zimou v archíve a `version` koeficientov sa zvýši. Prah p* (§4.4) sa zmení len rozhodnutím
majiteľa z rozhodovacej tabuľky. Počas sezóny sa nič nemení.

## 8. Reprodukcia

```sh
npm test                  # testy stránky aj parserov (fixtúry zo skutočných odpovedí)
npm run check:scripts     # typová kontrola offline skriptov
npm run truth:fetch       # stiahne históriu pravdy do ~/.cache/ztlzdrf (s cache)
npm run truth             # zarovnanie, búrky, klimatológia, zhoda zdrojov → data/truth/{storms,summary}.json, REPORT.md
npm run backtest:fetch    # archív predpovedí: --only=single,prev,hist (obnoviteľné z cache)
npm run backtest          # baseline podľa predstihu → data/backtest/{summary.json,REPORT.md}
npm run model             # fyzika, rozdelenie, zákon podľa predstihu, kombinácia → data/model/{powder-model.json,REPORT.md}; --only=physics,explore,lead,law,blend
npm run verify            # po sezóne: data/prospective/<sezóna>.jsonl proti pravde → data/prospective/REPORT-<sezóna>.md; --season=2026-27, --log=súbor
npm run rules             # krok 6a: pravidlá stránky (dážď, nárazy, slnko) proti staniciam podľa predstihu → data/rules/{REPORT.md,rules-verification.json}
```
