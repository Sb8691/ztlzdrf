# ztlzdrf – lyžiarske podmienky

Jedna stránka na **https://sb8691.github.io/ztlzdrf/**: oplatí sa lyžovať a kde? Sleduje štyri
strediská pri Gnesau (Korutánsko) – **Bad Kleinkirchheim / St. Oswald, Falkert, Turracher Höhe a
Hochrindl** – v troch horizontoch:

| Časť stránky | Model (cez [Open-Meteo](https://open-meteo.com/)) | Čo ukazuje |
|---|---|---|
| Najbližší lyžiarsky deň | GeoSphere Austria AROME 2,5 km | kartu na stredisko: verdikt, dôvod, nový sneh, teploty, vietor, slnko, odkazy na snehovú správu a webkameru |
| Najbližšie 3 dni | ECMWF IFS 9 km | tabuľku deň × stredisko a hodinový graf (teplota hore/dole, sneh, nárazy) |
| Výhľad na 10 dní | ECMWF ensemble 0,25°, 51 scenárov | podiel scenárov s dobrým / priemerným / zlým dňom a rozpätie snehu |

„Najbližší lyžiarsky deň" je dnešok, kým lanovky bežia (9:00–16:00), potom zajtrajšok.

## Ako sa hodnotí deň

Každé stredisko sa počíta pri **najnižšej a najvyššej stanici lanovky** (súradnice z OpenStreetMap,
výšky staníc, nie marketingové rozpätia – tie často uvádzajú vrchol, kam lanovka nevedie). Za čas
prevádzky lanoviek platí najhoršie z pravidiel:

- **Zlé** – dážď dole aspoň 1 mm, alebo nárazy vetra nad 60 km/h.
- **Ujde** – slabý dážď dole (od 0,2 mm), nárazy nad 40 km/h, aspoň polovica dňa dole nad 3 °C
  (mäkký sneh), alebo menej ako hodina slnka.
- **Dobré** – nič z toho. Nový sneh za 72 h od 10 cm pridá značku „prašan", deň nikdy nezhorší.

Prahy sú v `src/config.ts` (`SKI_CONFIG.rules`) a stránka ich vypisuje z konfigurácie.

Dôležité, overené 3. 10. 2026: parameter `elevation=` v Open-Meteo prepočíta **len teplotu**.
Zrážky, nárazy a slnko sú hodnoty celej bunky modelu, rovnaké dole aj hore. Preto o tom, či na
stanici prší alebo sneží, rozhoduje jej vlastná teplota (do +1 °C sneh, 7 cm snehu = 10 mm vody ako
v Open-Meteo). Ansámbel má hrubú mriežku, takže v 10-dňovom výhľade sa strediská líšia hlavne
teplotou.

Predpoveď nevie, či je stredisko otvorené, ani aký je sneh na zjazdovke – na to sú odkazy na
snehovú správu a webkameru pri každom stredisku.

## Ako to funguje

GitHub Pages servuje statické súbory, server tu nie je. `docs/index.html` preto nesie snímku dát aj
kód, ktorý ju vypočítal a nakreslí – tlačidlo **Obnoviť predpoveď** sťahuje priamo z prehliadača a
otvorená stránka sa obnoví sama, keď sú dáta staršie ako hodina.

- `src/ski-core.js` – **celý výpočet**, čisté ESM JavaScript bez importov. Beží v Node (generátor
  aj testy) a ten istý súbor sa vkladá do stránky.
- `src/ski-ui.js` – vykreslenie stránky ako čistá funkcia zo snímky na HTML; v prehliadači aj
  obnova dát.
- `src/ski-page.ts` – poskladá `docs/index.html`; obsah predkreslí tým istým klientskym kódom
  (spusteným vo `vm`), takže stránka je čitateľná aj pred načítaním JavaScriptu.
- `src/ski.ts` – generátor: postupne stiahne tri horizonty, uloží `docs/data/ski.json`, zapíše
  stránku. Snímku mladšiu ako 20 min použije znova; keď sťahovanie zlyhá, publikuje poslednú platnú.
- `src/config.ts` – strediská (stanice, odkazy) a pravidlá.

Chýbajúce dáta sa nikdy nepočítajú ako nula: deň bez potrebnej hodnoty je „Nedostatok dát" a
percentá ansámblu majú vždy menovateľ 51.

## Automatické obnovovanie

`.github/workflows/ski.yml` beží **len od novembra do apríla**, trikrát denne (04:13, 10:13 a
16:13 UTC): build, testy, `node dist/ski.js` a commit `docs/`, ak sa niečo zmenilo. Dá sa spustiť aj
ručne (Actions → Ski Conditions → Run workflow). Žiadne e-maily sa neposielajú.

## Presnejšia predpoveď a POWDER ALERT (prebieha)

Cieľ: kalibrovaná pravdepodobnosť **POWDER_SNEH** (aspoň 15 cm nového snehu za 24 h) pre štyri strediská
na 10 lyžiarskych dní dopredu, overená na minulých sezónach mimo vzorky a zvlášť pre každý predstih,
neskôr aj kvalita powderu a „super lyžovačka“. Postup ide po krokoch, každý krok je samostatný commit
schválený majiteľom. Definície, rozhodnutia, dáta a všetky čísla sú v [METODIKA.md](METODIKA.md); tu je
len denník.

| Krok | Stav | Čo vzniklo |
|---|---|---|
| 0 – audit dát | hotovo 3. 10. 2026 | zdroje predpovedí a pravdy, archívy, licencie, CORS: METODIKA §3.1–3.8 |
| 1 – pravda a klimatológia | hotovo 3. 10. 2026 | `npm run truth:fetch` + `npm run truth`; 10 ručných staníc nového snehu (eHYD, GeoSphere), automaty, LWD, SNOWGRID; dátumové konvencie overené proti INCA; búrky ≥ 15 cm 3–5 za sezónu na stanicu, regionálne 7,4; ΔHS automatov = pravda, SNOWGRID nie: [data/truth](data/truth), METODIKA §3.9 |
| 2 – backtest a baseline | hotovo 4. 10. 2026 | `npm run backtest:fetch` + `npm run backtest`: IFS 9 km celé behy, Previous Runs ICON-D2/ICON-EU/IFS 0,25°/GFS, Historical Forecast; len predpovede zverejnené pred koncom okna. Výsledok: deterministický prah 15 cm nemá zručnosť (BSS 0,13 pri 23 h, záporný od ~80 h) ani v dnešnom pravidle, ale AUC úhrnu 0,96–0,98 do 35 h a 0,9 do 71 h – informácia je, chýba kalibrácia: [data/backtest](data/backtest), METODIKA §5.1 |
| 3 – model | hotovo 4. 10. 2026 | `npm run model`: fyzika pri predstihu 0 na 10 sezónach IFS a 4 ICON-D2 (14 staníc) – dnešné pravidlo stránky je rovnako dobrý vstup ako fitované varianty (wet-bulb, pomer sneh/voda, výška, vietor); zisk dáva kalibrovaná neistota: dvojdielne rozdelenie (P(sneží) a √úhrn okolo √x) so sklonom klesajúcim s predstihom, overené zima proti zime: BSS 0,26 (0,01–0,42) pri 23 h, 0,21 pri 71 h, 0,42 pri 0 h, ICON-D2 0,34 pri 1 dni; kombinácia modelov v šume. Koeficienty v `data/model/powder-model.json`: [data/model](data/model), METODIKA §4 |
| 4 – zapojenie do stránky | čaká | koeficienty v malom JSON, výpočet v `src/ski-core.js`, nové polia snímky |
| 5 – prospektívne overovanie | čaká | CI od novembra 2026 loguje každú predpoveď aj ensemble, vyhodnotenie po sezóne 2026/27 |
| 6 – kvalita powderu, povrch, inverzie, super lyžovačka | čaká na schválenie | |

Offline skripty bežia cez `npm run` (tsx), surové dáta držia v `~/.cache/ztlzdrf` mimo gitu
(`ZTLZDRF_CACHE` ho presmeruje), do gitu idú len malé odvodené JSON a správy. Dáta: Open-Meteo (CC BY 4.0,
nekomerčne), GeoSphere Austria Data Hub (CC BY 4.0), eHYD („Datenquelle: ehyd.gv.at“, CC BY 4.0), LWD
Kärnten (bez zverejnenej licencie – používa sa súkromne, majiteľ žiada o súhlas; súbory nie sú v gite).

```sh
npm test                 # testy stránky aj parserov
npm run truth:fetch      # história pravdy do cache (s cache zadarmo)
npm run truth            # búrky, klimatológia, zhoda zdrojov → data/truth/
npm run backtest:fetch   # archív predpovedí s predstihom do cache
npm run backtest         # baseline podľa predstihu → data/backtest/
npm run model            # fit a výber modelu úhrnu → data/model/
```

## Lokálne

```sh
npm ci
npm test
npm run ski                                     # stiahne a zapíše docs/
SKI_DOCS_DIR=/tmp/ski npm run ski               # zapíše inam ako do docs/
SKI_DOCS_DIR=/tmp/ski SKI_RENDER_ONLY=true npm run ski   # bez siete, z uloženej snímky
```

`SKI_RENDER_ONLY` použije konfiguráciu uloženú v snímke – po zmene `src/config.ts` treba stiahnuť
znova. Do `docs/` generujte cez `npm run build && node dist/ski.js`, presne ako CI.

Pôvodná aplikácia na natieranie terasy (august – október 2026) je v histórii gitu pred commitom
„Judge ski days at four nearby resorts over three horizons".
