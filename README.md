# ztlzdrf – lyžiarske podmienky

Jedna stránka na **https://sb8691.github.io/ztlzdrf/**: oplatí sa lyžovať a kde? Sleduje štyri
strediská pri Gnesau (Korutánsko) – **Bad Kleinkirchheim / St. Oswald, Falkert, Turracher Höhe a
Hochrindl** – v troch horizontoch:

| Časť stránky | Model (cez [Open-Meteo](https://open-meteo.com/)) | Čo ukazuje |
|---|---|---|
| Najbližší lyžiarsky deň | DWD ICON-D2 2,2 km (do 4. 10. 2026 GeoSphere AROME; ICON-D2 je jediný krátkodobý model so zimným archívom, takže jeho POWDER_SNEH je overený) | kartu na stredisko: pruh a pravdepodobnosť dobrého / ujde / zlého dňa, čo ho môže pokaziť (s pravdepodobnosťou), šanca na prašan (≥ 15 cm do rána) s POWDER ALERT, očakávaný nový sneh, nový sneh za 3 dni, teploty, vietor, slnko, odkazy na snehovú správu a webkameru |
| Najbližšie 3 dni | ECMWF IFS 9 km | tabuľku deň × stredisko (pruh, dobré %, teplota hore, šanca na prašan, nový sneh, silnejší vietor) a hodinový graf (teplota hore/dole, sneh, nárazy) |
| Výhľad na 10 dní | ECMWF ensemble 0,25°, 51 scenárov | podiel scenárov s dobrým / priemerným / zlým dňom (nekalibrovaný) a rozpätie snehu |

„Najbližší lyžiarsky deň" je dnešok, kým lanovky bežia (9:00–16:00), potom zajtrajšok.

## Ako sa hodnotí deň

Každé stredisko sa počíta pri **najnižšej a najvyššej stanici lanovky** (súradnice z OpenStreetMap,
výšky staníc, nie marketingové rozpätia – tie často uvádzajú vrchol, kam lanovka nevedie). Za čas
prevádzky lanoviek je deň:

- **zlý** – dážď dole aspoň 1 mm, alebo nárazy vetra nad 60 km/h;
- **ujde** – slabý dážď dole (od 0,2 mm), nárazy nad 40 km/h, aspoň polovica dňa dole nad 3 °C
  (mäkký sneh), alebo menej ako hodina slnka;
- **dobrý** – nič z toho.

Od 5. 10. 2026 (krok 7) stránka pri najbližšom dni a pri troch dňoch neukazuje áno/nie, ale
**pravdepodobnosti**: pruh dobré / ujde / zlé a číslo „dobré X %“, rovnako ako 10-dňový výhľad. Pre
každé pravidlo je to logistická krivka na hodnote modelu (dážď dole, náraz hore, slnko, pri ICON-D2 aj
nízka oblačnosť a vlhkosť), kalibrovaná na šiestich automatoch GeoSphere za štyri zimy mimo vzorky;
„dobré“ je súčin, že nenastane ani jedno (mäkký sneh ostáva z teploty áno/nie a dobré vynuluje), „zlé“
súčin dažďa ≥ 1 mm alebo nárazu > 60 km/h. Áno/nie verdikty mali ako pravdepodobnosť Brierovu zručnosť
okolo nuly, kalibrované 0,3–0,6 pri 0–1 dni (METODIKA §5.3–5.4). Pod názvom strediska sú zložky od
20 % („dážď dole 40 %“), mäkký sneh a pri najbližšom dni inverzia od 50 % („hore teplejšie než dole“).

**Prašan** = aspoň 15 cm nového snehu pri hornej stanici od 9:00 predošlého dňa do 9:00. Karta aj
tabuľka ukazujú kalibrovanú pravdepodobnosť (`powderSnow`); od 20 % svieti **POWDER ALERT** (prvé dva
dni) alebo **POWDER POZOR** (tretí deň). Pri očakávanom snehu je „okolo“ medián a „až“ 90. percentil,
k tomu suchý / vlhší / mokrý podľa teploty počas sneženia. Stará značka „prašan“ pri 10 cm za 72 h zo
stránky zmizla; súčet za 3 dni ostal ako údaj.

Prahy sú v `src/config.ts` (`SKI_CONFIG.rules`), krivky v `src/quality-model.ts` a zákon prašanu v
`src/powder-model.ts`; stránka všetko vypisuje z konfigurácie vloženej do snímky.

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
len denník. Čo ďalej, kedy a čo čaká na majiteľa: [TODO.md](TODO.md).

| Krok | Stav | Čo vzniklo |
|---|---|---|
| 0 – audit dát | hotovo 3. 10. 2026 | zdroje predpovedí a pravdy, archívy, licencie, CORS: METODIKA §3.1–3.8 |
| 1 – pravda a klimatológia | hotovo 3. 10. 2026 | `npm run truth:fetch` + `npm run truth`; 10 ručných staníc nového snehu (eHYD, GeoSphere), automaty, LWD, SNOWGRID; dátumové konvencie overené proti INCA; búrky ≥ 15 cm 3–5 za sezónu na stanicu, regionálne 7,4; ΔHS automatov = pravda, SNOWGRID nie: [data/truth](data/truth), METODIKA §3.9 |
| 2 – backtest a baseline | hotovo 4. 10. 2026 | `npm run backtest:fetch` + `npm run backtest`: IFS 9 km celé behy, Previous Runs ICON-D2/ICON-EU/IFS 0,25°/GFS, Historical Forecast; len predpovede zverejnené pred koncom okna. Výsledok: deterministický prah 15 cm nemá zručnosť (BSS 0,13 pri 23 h, záporný od ~80 h) ani v dnešnom pravidle, ale AUC úhrnu 0,96–0,98 do 35 h a 0,9 do 71 h – informácia je, chýba kalibrácia: [data/backtest](data/backtest), METODIKA §5.1 |
| 3 – model | hotovo 4. 10. 2026 | `npm run model`: fyzika pri predstihu 0 na 10 sezónach IFS a 4 ICON-D2 (14 staníc) – dnešné pravidlo stránky je rovnako dobrý vstup ako fitované varianty (wet-bulb, pomer sneh/voda, výška, vietor); zisk dáva kalibrovaná neistota: dvojdielne rozdelenie (P(sneží) a √úhrn okolo √x) so sklonom klesajúcim s predstihom, overené zima proti zime: BSS 0,26 (0,01–0,42) pri 23 h, 0,21 pri 71 h, 0,42 pri 0 h, ICON-D2 0,34 pri 1 dni; kombinácia modelov v šume. Koeficienty v `data/model/powder-model.json`: [data/model](data/model), METODIKA §4 |
| 4 – zapojenie do stránky | hotovo 4. 10. 2026 | snímka v2: každý deň horizontov D0 (ICON-D2, nahradil AROME) a D0–D+2 (IFS 9 km) nesie `powderSnow` – úhrn okna D−1 09:00 → D 09:00, predstih, P(≥ 15 cm), medián a 90. percentil; koeficienty v `src/powder-model.ts` (kópia `data/model/powder-model.json`, test rovnosti); stupeň dňa (ALERT D0–D+1, POZOR D+2–D+3) a značka `alert` od p* = 0,20 (predvolené N = 4, majiteľ N neurčil; jedno číslo v `src/powder-model.ts`): METODIKA §4.4 |
| 5 – prospektívne overovanie | 5a hotovo 4. 10. 2026, vyhodnotenie po sezóne 2026/27 | každý čerstvý beh CI pripíše riadok do `data/prospective/<sezóna>.jsonl`: strediská, šesť staníc s pravdou (rovnaká požiadavka, ten istý beh), 51 členov ansámblu v okne; `npm run verify` po sezóne: METODIKA §5.2 |
| 6 – kvalita dňa | hotovo 4. 10. 2026 | `npm run rules` + `npm run quality`: dnešné áno/nie pravidlá sú zle kalibrované (dážď varuje priveľa, vietor z IFS bez zručnosti, zamračenie primálo), kalibrované pravdepodobnosti majú BSS 0,3–0,6 pri 0–1 d; teplota počas sneženia z ICON-D2 presná, z IFS +1 °C; inverziu vidí len ICON-D2; vietor pri powderi a slnečný vrchol nad hmlou sa predpovedať nedajú. Snímka v3 nesie `quality` (P dážď, P veterno / stojace lanovky, P zamračené, P dobrý deň = súčin, inverzia, teplota počas sneženia s pásmom, náraz v okne); deterministické horizonty doťahujú nízku oblačnosť a vlhkosť: [data/rules](data/rules), [data/quality](data/quality), METODIKA §4.5, §5.3–5.4 |
| 7 – zobrazenie pravdepodobností | hotovo 5. 10. 2026 | rozhodnutie majiteľa 5. 10.: stránka ukazuje pravdepodobnosti namiesto áno/nie. Snímka v4: deterministické dni nesú `goodPct / fairPct / badPct` (zlé = súčin P dážď ≥ 1 mm a P náraz > 60 km/h, overené proti priamemu fitu: ICON-D2 BSS 0,24–0,29, IFS 0,05; dobré = overený súčin, mäkký sneh ho vynuluje). Karta a tabuľka: pruh + „dobré X %“, dôvody s pravdepodobnosťou od 20 %, riadok „Prašan do rána (≥ 15 cm)“ s POWDER ALERT / POZOR, „Nový sneh do rána: okolo / až“ s pásmom suchý / vlhší / mokrý, inverzia od 50 % pri najbližšom dni; text „Ako sa počítajú percentá?“ prepísaný; pätička uvádza GeoSphere a eHYD; `docs/` obnovené živým načítaním: METODIKA §4.6 |

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
npm run verify           # po sezóne: log predpovedí proti pravde → data/prospective/REPORT-*.md
npm run rules            # pravidlá stránky proti staniciam → data/rules/
npm run quality          # kvalita powderu, inverzie, oblak, dobrý deň; krivky pre stránku → data/quality/
```

## Lokálne

```sh
npm ci
npm test
npm run ski                                     # stiahne a zapíše docs/
SKI_DOCS_DIR=/tmp/ski npm run ski               # zapíše inam ako do docs/
SKI_DOCS_DIR=/tmp/ski SKI_LOG_DIR=/tmp/ski/log npm run ski   # aj log predpovedí mimo data/prospective/
SKI_DOCS_DIR=/tmp/ski SKI_RENDER_ONLY=true npm run ski   # bez siete, z uloženej snímky
```

`SKI_RENDER_ONLY` použije konfiguráciu uloženú v snímke – po zmene `src/config.ts` treba stiahnuť
znova. Do `docs/` generujte cez `npm run build && node dist/ski.js`, presne ako CI.

Pôvodná aplikácia na natieranie terasy (august – október 2026) je v histórii gitu pred commitom
„Judge ski days at four nearby resorts over three horizons".
