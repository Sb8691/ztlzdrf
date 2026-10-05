# Úloha: čo najpresnejšia predpoveď lyžovačky a POWDER ALERT

Pracuješ v Claude Code v repozitári `ztlzdrf`. So mnou hovor po slovensky; kód, komentáre a commit
správy píš po anglicky ako doteraz. Ide **len o logický model** – výpočet, predpoveď, overovanie
a využitie dát z minulosti. UI/UX nerieš.

## 1. Cieľ

Štyri strediská v Nockbergoch: **Bad Kleinkirchheim / St. Oswald, Falkert, Turracher Höhe,
Hochrindl**. Večer a ráno sa rozhodujem, či a kam ísť lyžovať. Na najbližších 10 lyžiarskych dní
chcem čo najpresnejšie vedieť:

1. **POWDER ALERT** – to je najdôležitejšie;
2. **super lyžovačku** – dobrý sneh, relatívne dobrá viditeľnosť, žiadny silný nárazový vietor,
   žiadny dážď;
3. prečo (zložky zvlášť) a ktoré stredisko je v daný deň najlepšie.

„Presne“ znamená pravdepodobnosti overené na minulých sezónach mimo vzorky, zvlášť pre každý
predstih, a kalibrované všade, kde na to máme pravdu. Nie dojem a nie jeden pekný príklad.

## 2. Definície

Toto je východisko. Zmeny navrhni s číslami z dát a nechaj ma ich schváliť.

- **D0** = najbližší lyžiarsky deň (po 16:00 je to zajtrajšok, ako `firstSkiDate` v kóde).
  Horizont je D0 až D+9. Lanovky 09:00–16:00, Europe/Vienna.
- **POWDER_SNEH** (jadro, ktoré sa dá overiť) = aspoň **15 cm nového snehu za 24 h**.
  - Pri overovaní: v bodoch, kde sa sneh meria, do termínu merania (ručné merania sú o 06 UTC,
    teda 07:00 SEČ), s predpoveďou pre súradnice a výšku týchto bodov.
  - V produkte: na **hornej stanici** lanovky za D−1 09:00 → D 09:00. Z bodov merania prenášaj na
    horné stanice len korekcie, ktoré od miesta nezávisia.
- **POWDER ALERT** = POWDER_SNEH, ktorý je navyše
  - **suchý** – odhadni z teploty a vetra počas sneženia (na jar ho oťaží slnko aj pri mínuse);
  - **nezničený vetrom** – podľa priemerného vetra počas sneženia a po ňom (vietor začína sneh
    prenášať okolo 5 m/s); nárazy rozhodujú len o lanovkách;
  - a **lanovky pôjdu** – nárazy hore počas dňa D.

  Na kvalitu pravdu nemáme, preto prahy ber z literatúry a nefituj ich. Zvlášť označ „fresh
  tracks“ (väčšina snehu napadla po 16:00 D−1) a „bluebird powder“ (po sneženiach svieti slnko).
- **Stupne:** ALERT (D0–D+1), POZOR (D+2–D+3), VÝHĽAD (D+4–D+9, len keď je šanca výrazne nad
  klimatológiou).
  - Prah ALERT odvoď z môjho pomeru nákladov: keď na to príde, opýtaj sa ma, koľkokrát horší je
    pre mňa zmeškaný powder deň ako zbytočná cesta (N, potom p* ≈ 1/(N+1)), a ukáž aj relatívnu
    ekonomickú hodnotu.
  - Hysteréza (aby stupeň medzi behmi neskákal) stačí ako jednoduché pravidlo.
  - Výstup navrhni tak, aby sa naň neskôr dalo napojiť upozornenie. Samotné upozornenia teraz
    nerob.
- **Super lyžovačka:** počas lanoviek žiadny dážď na zjazdovkách; nárazy hore pod prahom (dnes
  40 km/h = ujde, 60 km/h = zlé); horná stanica väčšinu dňa nie je v oblaku ani v hmle; dobrý
  povrch (prašan alebo upravený sneh – nie premočený, nie ľad ani krusta po daždi a mraze).
  Kalibruj len zložky, pre ktoré máš pravdu. Celok skladaj zo zložiek (pri ensembli člen po
  člene, napr. ensemble copula coupling) a nevydávaj ho za kalibrovaný.

## 3. Čo už existuje – prečítaj si to ako prvé

- `README.md` – ako sa deň hodnotí dnes.
- `src/ski-core.js` – celý dnešný výpočet. Čisté ESM bez importov; beží v Node (generátor,
  testy) aj v prehliadači, kde ho tlačidlo Obnoviť spúšťa znova. Má časové pomôcky
  (`localTimeMs`, `firstSkiDate`…) a parsovanie Open-Meteo, ktoré môžeš použiť.
- `src/config.ts` – strediská (dolná a horná stanica lanovky so súradnicami a výškou)
  a pravidlá.
- `src/ski.ts` – generátor; CI `.github/workflows/ski.yml` ho púšťa od novembra do apríla
  o 04:13, 10:13 a 16:13 UTC. `src/fetch-json.ts` – sťahovanie s timeoutom a opakovaním.
  `src/ski.test.ts` – testy.
- `src/ski-ui.js`, `src/ski-page.ts` – UI. Nemeň ich, okrem minima, aby stránka ďalej
  fungovala.

**Baseline, ktorý treba poraziť:**
- D0 GeoSphere AROME 2,5 km; D0–D+2 ECMWF IFS 9 km; D0–D+9 ECMWF ENS 0,25° (51 členov,
  % členov).
- Dva body na stredisko (dolná a horná stanica).
- Sneh = zrážky bunky × 0,7 cm/mm, ak má stanica ≤ 1 °C.
- Dobré / ujde / zlé podľa dažďa dole (0,2 / 1 mm), nárazov hore (40 / 60 km/h), mäkkého snehu
  (dole > 3 °C aspoň pol dňa) a slnka (< 1 h).
- Dnešný „prašan“ (≥ 10 cm za 72 h pred otvorením plus čas lanoviek) je iná udalosť. Pri
  porovnaní prepočítaj dnešné pravidlá na tú istú udalosť.

**Overené fakty o Open-Meteo:**
- `elevation=` prepočíta **len teplotu**. Zrážky, nárazy a slnko sú hodnoty bunky modelu,
  rovnaké dole aj hore. `elevation=nan` vráti výšku bunky.
- `end_date` končí o 23:00. Akumulované premenné sú za predchádzajúcu hodinu. Používame
  `timeformat=unixtime`.
- Požiadavky posielaj **postupne**. Dávka paralelných dostane chybové telo pod HTTP 200.
- V mriežke ENS 0,25° padnú Bad Kleinkirchheim a Falkert do tej istej bunky.

## 4. Dáta (živý audit 3. 10. 2026 – v kroku 0 over znova)

**Časovo kritické:**
- Stanice lavínovej služby Korutánska (LWD Kärnten) sú online len za posledných 12 mesiacov.
  Kópia z 3. 10. 2026 je v `~/.cache/ztlzdrf/lwd-ktn/{ID}_12m_2026-10-03.smet` (10-min dáta od
  októbra 2025, november–apríl kompletné). Je len na tomto počítači: zisti licenciu a opýtaj sa
  ma, kde ju archivovať natrvalo.
- Členy ensemblov drží Open-Meteo len ~3 dni a ich archív neexistuje. Jediná cesta je vlastný
  log (krok 5).

**Archív predpovedí (Open-Meteo):**
- **Single Runs API** – celé jednotlivé behy so všetkými predstihmi. IFS 9 km od 14. 3. 2024
  (obe zimy 2024/25 a 2025/26, 0–360 h), ostatné modely až od 2. 4. 2026. Príklad:
  `https://single-runs-api.open-meteo.com/v1/forecast?latitude=46.9156&longitude=13.8559&hourly=temperature_2m,snowfall&models=ecmwf_ifs&run=2024-12-01T00:00&forecast_days=16`
- **Previous Runs API** – `{premenná}_previous_dayN` (napr. `snowfall_previous_day1`) je
  predpoveď spred N×24 h (N = 1…7).
  - ICON-D2 (len N = 1) a ICON-EU (N = 1–4) od 19. 1. 2024.
  - GFS (snowfall od 2025); ICON-CH2 (N = 1–4) od 7/2025; ICON-2I (N = 1–2) od 4/2025.
  - IFS 0,25° od 2/2024, ale bez snowfall a nárazov.
  - AROME až od 25. 3. 2026 – **dnešný model pre D0 nemá zimný archív**.
  - Nulová izoterma, nízka oblačnosť a viditeľnosť tu chýbajú pri všetkých modeloch.
- **Historical Forecast API** – zošité prvé hodiny behov, **bez predstihu**: IFS 9 km od 2017,
  ICON-D2 a ICON-EU od 11/2022, GFS od 3/2021. Priemer a rozptyl ensemblov (`*_ensemble_mean`)
  až od 20. 2. 2026.

**Živé predpovede (Open-Meteo, overené v našich bodoch):**
- Deterministické modely:
  - ICON-D2 2,2 km (66 h);
  - GeoSphere AROME 2,5 km (75 h);
  - MeteoSwiss ICON-CH1 1 km (51 h) a ICON-CH2 2,1 km (132 h);
  - ICON-2I (84 h);
  - ECMWF IFS 9 km a 0,25° (~15 dní).
- Všetky majú `snowfall`, `snowfall_water_equivalent`, `wet_bulb_temperature_2m`,
  `dew_point_2m`, `cloud_cover_low`, `cloud_cover_mid`, `sunshine_duration`, `weather_code`;
  existuje aj `snowfall_height`.
- Nulovú izotermu majú len ICON-D2, ICON-CH1/CH2 a ICON-2I. Z testovaných tlakových hladín
  (800 a 700 hPa) má ICON-D2 obe, IFS 0,25° a ICON-2I len 700 hPa, AROME, IFS 9 km a ICON-CH
  žiadnu.
- Ensembly:
  - ICON-D2-EPS 20 členov (63 h);
  - ICON-CH1-EPS 11 (51 h) a ICON-CH2-EPS 21 (132 h), oba s nulovou izotermou a nízkou
    oblačnosťou;
  - ICON-EU-EPS 40 (132 h);
  - IFS 9 km ENS `ecmwf_ifs_europe_ensemble` 51 (150 h); IFS ENS 0,25° 51 (~15 dní);
  - AIFS 51, GEFS 31, UKMO 18, GEM 21.
- Bunky modelov ležia ~100–900 m pod hornými stanicami (`elevation=nan`).
  - Turracher (2 197 m): ICON-D2 1 962 m, AROME 1 823 m, IFS 9 km 1 864 m, IFS 0,25° 1 618 m.
  - Bad Kleinkirchheim (2 043 m) v IFS 0,25°: 1 143 m.
- Limity: menej ako 10 000 volaní denne, 5 000 za hodinu a 600 za minútu. Volanie s viac ako 10
  premennými, viac ako 14 dňami alebo viacerými bodmi sa ráta ako viac volaní; ensemble ešte viac.

**Pravda (pozorovania a analýzy):**
- **LWD Kärnten** – 10-min dáta, bez zrážok. Prístup: `https://smet.hydrographie.info/{ID}_12m.smet`.
  - Turracherhöhe (ID 2900265): 1 795 m, 1,4 km od hornej stanice; výška snehu, teplota,
    vlhkosť, vietor aj nárazy, žiarenie.
  - Falkert (ID 2900240): 1 886 m, 1,6 km od hornej stanice; len výška snehu, teplota, vlhkosť.
  - Súbory majú `tz = +01` (bez letného času) a `nodata = -777`. HS je surové: Turracher ukazuje
    aj v lete 0,2–0,3 m a Falkert má v októbri 2025 skok na 1,66 m. Bez kontroly kvality ho
    nepoužívaj.
- **eHYD** (hydrografická služba; CC BY 4.0; sťahuj len ponúkané súbory). Dáta končia
  31. 8. 2023. Prístup: `https://ehyd.gv.at/services/MessstellenExtraData/nlv?id={HZB}&file={n}`.
  - Turracher Höhe (HZB 123133, 1 777 m): denne o 7:00 ručne meraný nový sneh, výška snehu
    a zrážky, 1998–2023.
  - Falkert (HZB 114652, 1 887 m): zrážky 1985–2023.
- **GeoSphere Data Hub, stanice** (CC BY 4.0; max. 240 požiadaviek za hodinu) – denne
  s oneskorením 1–2 dni.
  - Premenné: `shneu_manu` (nový sneh), `sh` / `sh_manu` (výška snehu) o 06 UTC, −1 = bez
    snehu; ďalej `rr`, `ffx` (náraz), `so_h` (slnko).
  - Stanice 12–37 km od stredísk, väčšinou nižšie: Kanzelhöhe 1 520 m (ID 122), Flattnitz
    1 437 m (186), Katschberg 1 635 m (15715), Villacher Alpe 2 117 m (20021) a ručná 2 140 m
    (20020; tu aj SYNOP viditeľnosť).
  - Prístup: `https://dataset.api.hub.geosphere.at/v1/station/historical/klima-v2-1d?parameters=…&station_ids=…&start=…&end=…`.
- **GeoSphere gridy 1 km**, pixel priamo pri hornej stanici (CC BY 4.0):
  - `inca-v1-1h-1km` – hodinovo od 2011: teplota, zrážky, vietor bez nárazov, vlhkosť, žiarenie;
  - `snowgrid_cl-v2-1d-1km` – denne od 1961: výška snehu, SWE;
  - `spartacus-v2-1d-1km` – denne: zrážky, slnko.
  - Prístup: `https://dataset.api.hub.geosphere.at/v1/timeseries/historical/{id}?parameters=…&start=…&end=…&lat_lon=46.9156,13.8559`.
    Pre viac bodov zopakuj `lat_lon`.
  - Sú to analýzy čiastočne z modelov, nie nezávislá pravda.
- **Slnko zo satelitu:** Open-Meteo Satellite API (`https://satellite-api.open-meteo.com/v1/archive`).
  SARAH-3 od 1983 s oneskorením ~2 dni; takmer živé DWD SIS od 7/2026.
- **Klimatológia:** Open-Meteo Archive – ERA5 od 1940, CERRA 1985–2021, IFS analýza od 2017.
  Sú to hrubé bunky, oveľa nižšie ako horné stanice.
- **Ručné kontroly:** archív webkamier foto-webcam.eu (kaiserburg, falkert, turrach-ost/west…).
- Strojovo čitateľnú históriu prevádzky lanoviek sme nenašli. Verejný archív bergfex sme
  nenašli a jeho robots.txt zakazuje export.

**Čo z toho vyplýva (over):**
- **Bez predstihu** sa dá na ~6 zimách učiť fáza zrážok, pomer sneh/voda a bias bunka → stanica:
  Historical Forecast IFS 9 km (od 2017) a ICON-D2 (od 11/2022) proti eHYD Turracher Höhe
  (do 2023).
- **Predstih** sa dá overiť na zimách 2024/25 a 2025/26: Single Runs IFS a Previous Runs
  ICON-D2/ICON-EU proti GeoSphere staniciam a gridom, v zime 2025/26 aj proti LWD.
- Pre D0–D+1 zváž ICON-D2 / ICON-D2-EPS namiesto AROME, ktorý sa zatiaľ overiť nedá.

**Pravda o powder je najťažšia časť.** Postav „najlepší odhad pravdy“ s neistotou z viacerých
zdrojov:
- ručne meraný nový sneh;
- zmena výšky snehu z automatických staníc, s korekciou na sadanie;
- gridované analýzy.

Dôležité závery otestuj proti viac ako jednej verzii pravdy.

## 5. Rozsah a poradie

1. **Najprv len POWDER_SNEH pre D0–D+2.** Dážď, vietor a slnko ostávajú pravidlá; len ich over.
2. Kvalita powderu, stav povrchu snehu, inverzie a super lyžovačka prídu **až po mojom
   schválení**.
3. VÝHĽAD z ensemblu ostane zatiaľ nekalibrovaný. Od novembra ho loguj. Pre D+3 až D+9 máš na
   overenie aspoň deterministický IFS (Single Runs).

Zoznamy kandidátov v krokoch nie sú povinnosť – ber, čo dáta podporia.

## 6. Postup

Každý krok: krátky plán → práca → správa → počkaj na moje „Áno“. Väčší krok rozdeľ na podkroky,
každý = jeden commit. Pushuj až po schválení.

0. **Audit dát** – v repozitári nič nemeň a uloženú kópiu LWD (sekcia 4) nemaž. Over sekciu 4,
   doplň chýbajúce a zisti CORS. Výstup: tabuľka zdrojov a návrh, čo bude pravda pre
   každú zložku.
1. **Pravda a klimatológia.** Stiahni (s cache) históriu za čo najviac zím. Spočítaj
   **nezávislé búrky** s ≥ 15 cm (len dni so snehovou pokrývkou v sezóne prevádzky stredísk)
   a zisti, ako sa zdroje pravdy zhodujú.
2. **Backtest a baseline.** Harness, ktorý pre každý minulý deň a predstih použije len to, čo
   bolo v čase vydania známe, a vyhodnotí klimatológiu, surové modely (aj ich vlastné
   `snowfall`) a dnešné pravidlá.
3. **Model.** Ak je búrok menej ako ~30, nekalibruj binárnu udalosť. Modeluj spojitý 24 h úhrn
   (1–3 parametre spoločné pre strediská, predstih ako prediktor), P(≥ 15 cm) z neho odvoď
   a vyberaj podľa CRPS. Fázu, pomer sneh/voda a bias bunka → stanica uč na dlhom archíve
   bez predstihu. Kandidáti:
   - fáza zrážok z wet-bulb teploty alebo z nulovej izotermy, pre každú stanicu zvlášť;
   - pomer sneh/voda podľa teploty a vetra namiesto pevných 0,7 cm/mm;
   - korekcia zrážok na rozdiel výšky stanice a bunky modelu;
   - viac modelov a váhy podľa minulej presnosti;
   - vietor hore z tlakových hladín interpolovaných na výšku stanice.
4. **Zapojenie.** Nový model do `src/ski-core.js`, koeficienty do malého verzovaného JSON,
   testy, nové polia v snímke (zvýš `SKI_SNAPSHOT_VERSION`). Stránka musí ďalej fungovať.
5. **Prospektívne overovanie.** CI od novembra uloží každú predpoveď (aj ensemble a stupeň)
   s časom behu a neskôr pravdu. Skript po sezóne vyhodnotí presnosť a prekalibruje.
   **Rozhodujúci test je sezóna 2026/27.**
6. Až po schválení: kvalita powderu, stav povrchu snehu z posledných 14–30 dní (vek snehu,
   topenie a zamŕzanie, dážď na sneh, vietor), horná stanica v oblaku a inverzie, super
   lyžovačka.

## 7. Overovanie

- **Predstih** = hodiny od vydania (časy behov CI) do konca okna udalosti. Použi len beh, ktorý
  bol v tom čase už zverejnený (zohľadni oneskorenie zverejnenia).
- Archív bez predstihu použi len na fyziku, ktorá od predstihu nezávisí.
- Mimo vzorky: leave-one-season-out; ak je sezón málo, bloková krížová validácia po mesiacoch.
  Klimatológiu, prahy aj výber modelu rob bez testovanej sezóny. Žiadny leakage.
- Všetky metriky podľa predstihu a strediska, s 95 % CI z bootstrapu po búrkach (strediská
  zasahujú tie isté búrky).
- Metriky:
  - pravdepodobnosti: Brier score, Brier skill score oproti klimatológii, tabuľka spoľahlivosti,
    ROC AUC;
  - ALERT: POD, FAR, CSI, počet alertov a zmeškaných powder dní za sezónu;
  - množstvo snehu: bias, MAE, CRPS;
  - teplota a vietor: bias, MAE.
- **Brána na zapojenie:** pri predstihoch ~20–40 h a ~70–90 h nižšie Brier skóre ako
  klimatológia, surový model aj dnešné pravidlá (na tej istej udalosti), a 95 % CI zlepšenia
  nad nulou. Ak to dáta nerozlíšia, povedz to a odporuč jednoduchší model.
- Čísla uvádzaj tak, ako vyšli, aj neúspechy.

## 8. Obmedzenia

- Stránka je statická (GitHub Pages), server nie je. Výpočet za behu ostáva
  v `src/ski-core.js`: čistý, deterministický, bez importov a bez Node API.
- Prehliadač pri Obnoviť sťahuje dáta sám. Zdroj, ktorý tam má byť, musí mať CORS a rozumnú
  veľkosť (ENS dnes 2,3 MB). Zdroje bez CORS (napr. pozorovania) sťahuj len v generátore
  a výsledok vlož do snímky. Živý výpočet smie použiť len vstupy definované rovnako ako
  v archíve, na ktorom sa kalibroval.
- Ťažké veci (história, backtest, fitovanie) rob offline v TypeScript skriptoch spúšťaných cez
  npm, so surovými dátami v cache mimo gitu. Výsledok je malý JSON s koeficientmi. Python len
  po dohode.
- Pravidlá pre dáta:
  - Bezplatné Open-Meteo je len na nekomerčné použitie a má limity – buď šetrný.
  - Žiadne API kľúče, platené služby ani scraping bez môjho súhlasu.
  - Licencie dodrž (GeoSphere aj eHYD chcú uviesť zdroj); keď treba zdroj uviesť na stránke,
    povedz mi to.
  - Nikam neposielaj osobné údaje.
- `npm run build && npm test` musí prejsť. Nová logika má deterministické testy na fixtures zo
  skutočných odpovedí.
- **Kedy sa zastaviť a opýtať:** na konci kroku; pred novým zdrojom dát, licenciou alebo veľkým
  sťahovaním; keď dáta vyvrátia predpoklad kroku. Drobnosti v schválenom kroku rozhoduj sám
  a zapíš ich ako predpoklad.

## 9. Hypotézy na overenie (nie fakty)

- **Odkiaľ prichádza sneh.** Nockberge sú vnútroalpské a dosť suché. Veľké sneženia sem nosí
  hlavne južné prúdenie (stredomorské tlakové níže), pri severozápadnom sú v závetrí. Južné
  situácie však často prinášajú teplý ťažký sneh – veľký úhrn a suchý prašan idú často proti
  sebe. Smer vetra v 700 hPa počas zrážok môže vysvetľovať chyby modelov.
- **Chyby modelov hore.** Chyba zrážok hore má obe znamienka; vo vnútroalpských a závetrných
  polohách modely často nadhodnocujú. Náraz bunky nereprezentuje vrchol ani stanicu.
- **Snehová hranica.** Býva 200–400 m pod nulovou izotermou a pri silných zrážkach klesá aj
  nulová izoterma. Pri inverzii býva hladín 0 °C viac (hore dážď, v kotline sneh či mrznúci
  dážď), preto fázu urči z wet-bulb, nie zo suchej teploty.
- **Pomer sneh/voda.** Studený sneh v pokoji má okolo 15:1 a viac, mokrý pri 0 °C okolo 8:1;
  vietor a námraza dávajú 7–10:1 aj v mraze. Nameraný 24 h sneh je po sadnutí menší ako súčet
  hodinových úhrnov.
- **Inverzie.** V zime sú časté: hmla v kotlinách a údoliach, slnko na vrcholoch.

## 10. Správy a výstup

- Správa po kroku: výsledok jednou vetou, tabuľka s CI, čo je overené a čo predpoklad.
- `METODIKA.md` (po slovensky): definície, rozhodnutia a predpoklady (prečítaj ju na začiatku
  každej session), dáta, model, výsledky podľa predstihu, limity, postup prekalibrovania.
- Kód, testy, kalibračný JSON a skripty, ktoré všetko zopakujú jedným príkazom.
- Na konci krátke zhrnutie: o koľko je predpoveď lepšia ako dnes a kedy jej neveriť.
- Voliteľne navrhni (nerob bez súhlasu) denník mojich lyžovačiek (CSV s hodnotením) ako ďalšiu
  pravdu pre super lyžovačku.
