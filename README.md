# ztlzdrf – lyžiarske podmienky pri Gnesau

**Stránka: https://sb8691.github.io/ztlzdrf/** – oplatí sa lyžovať, kedy a kde? Štyri strediská
v Nockbergoch (Korutánsko): **Bad Kleinkirchheim / St. Oswald, Falkert, Turracher Höhe a Hochrindl**.
Statická stránka na GitHub Pages; predpovede z Open-Meteo, lavínový stupeň zo správy LWD Kärnten,
pravdepodobnosti kalibrované na meraniach staníc z minulých zím.

Tento súbor je vstupný bod: čo stránka robí, ako beží, ako na nej pracovať a čo čaká v sezóne.
Definície, dáta, overenie a všetky čísla sú v [METODIKA.md](METODIKA.md).

## Čo stránka ukazuje

| Časť | Model (cez [Open-Meteo](https://open-meteo.com/)) | Čo ukazuje |
|---|---|---|
| Najbližší lyžiarsky deň | DWD ICON-D2 2,2 km | karta na stredisko: pravdepodobnosť dobrého / ujde / zlého dňa a čo ho môže pokaziť, šanca na prašan s POWDER ALERT, očakávaný nový sneh, teploty, vietor, slnko, lavínový stupeň; odkazy na snehovú správu, webkameru a lavínovú správu |
| Najbližšie 3 dni | ECMWF IFS 9 km | tabuľka deň × stredisko (pruh, dobré %, teplota hore, šanca na prašan, nový sneh, silnejší vietor) a hodinový graf (teplota hore a dole, sneh, nárazy) |
| Výhľad na 10 dní | ECMWF ENS 0,25°, 51 scenárov | podiely scenárov dobré / ujde / zlé (nekalibrované) a rozpätie snehu |

„Najbližší lyžiarsky deň“ je dnešok, kým lanovky bežia (9:00–16:00), potom zajtrajšok. Keď model
nevidí pri hornej stanici aspoň 30 cm snehu, deň sa nehodnotí a karta ukáže **Bez snehu**. Predpoveď
nevie, či je stredisko otvorené ani aký je sneh na zjazdovke – na to sú odkazy pri každom stredisku.

## Ako sa počíta

- **Dve stanice na stredisko:** najnižšia a najvyššia stanica lanovky (súradnice z OpenStreetMap,
  výšky staníc, nie marketingové rozpätia). Open-Meteo pri `elevation=` prepočíta len teplotu; zrážky,
  nárazy a slnko sú hodnoty bunky modelu. O daždi či snehu preto rozhoduje teplota stanice (do +1 °C
  sneh, 7 cm snehu = 10 mm vody).
- **Deň** sa posudzuje za čas prevádzky lanoviek. Zlý = dážď dole aspoň 1 mm alebo nárazy hore nad
  60 km/h; ujde = slabý dážď (od 0,2 mm), nárazy nad 40 km/h, mäkký sneh (dole aspoň pol dňa nad 3 °C)
  alebo menej ako hodina slnka; dobrý = nič z toho. Stránka neukazuje áno/nie, ale pravdepodobnosti:
  každé pravidlo má logistickú krivku kalibrovanú na staniciach GeoSphere, „dobré“ je súčin, že nenastane
  žiadne z nich. Pod názvom strediska sú zložky od 20 % a pri najbližšom dni inverzia od 50 %
  (METODIKA §4.5–4.6).
- **Predpoklad snehu:** modelová výška snehu ICON-D2 pri hornej stanici o 9:00 dáva pravdepodobnosť
  pokrývky aspoň 30 cm; pod 50 % „Bez snehu“. Ďalšie dni berú túto úroveň a pridajú k nej zmenu podľa
  svojho modelu (§4.7).
- **Prašan** = aspoň 15 cm nového snehu pri hornej stanici od 9:00 predošlého dňa do 9:00.
  Pravdepodobnosť je z kalibrovaného rozdelenia, ktoré sa s predstihom rozširuje; od 20 % svieti
  **POWDER ALERT** (prvé dva dni) alebo **POWDER POZOR** (tretí deň). „Okolo / až“ = medián a
  90. percentil, k tomu suchý / vlhší / mokrý podľa teploty počas sneženia (§4.1–4.4).
- **Lavíny:** stupeň 1–5 mikroregiónu EAWS, v ktorom leží horná stanica, zo správy LWD Kärnten
  ([lawinen.report](https://lawinen.report/)), s výškou, denným chodom a tendenciou. Len pre najbližší
  deň a len pre voľný terén mimo zjazdoviek (§4.8).
- **10-dňový výhľad:** podiely 51 scenárov ansámblu, nekalibrované; kalibrácia príde z logu sezóny
  2026/27.

Chýbajúce dáta sa nikdy nepočítajú ako nula: deň bez potrebnej hodnoty je „Nedostatok dát“ a percentá
ansámblu majú vždy menovateľ 51. Prahy sú v `src/config.ts` (`SKI_CONFIG.rules`), krivky a zákony v
`src/quality-model.ts`, `src/powder-model.ts` a `src/cover-model.ts`; stránka ich vypisuje z
konfigurácie uloženej v snímke.

## Zdroje dát a licencie

| Zdroj | Na čo | Licencia | Na stránke |
|---|---|---|---|
| [Open-Meteo](https://open-meteo.com/) (ICON-D2, IFS, ENS, archívy predpovedí) | predpovede, backtest | CC BY 4.0, bezplatne len nekomerčne | pätička |
| [GeoSphere Austria Data Hub](https://data.hub.geosphere.at/) | merania na kalibráciu | CC BY 4.0 | pätička |
| [eHYD](https://ehyd.gv.at/) | merania na kalibráciu (do 2023) | CC BY 4.0, „Datenquelle: ehyd.gv.at“ | pätička |
| LWD Kärnten cez [avalanche.report](https://avalanche.report/) | lavínový stupeň (CAAML v6) | CC BY 4.0 | pätička |
| LWD Kärnten, staničné súbory SMET | merania Turracherhöhe a Falkert na kalibráciu | bez zverejnenej licencie, majiteľ požiadal o súhlas 16. 10. 2026 | neuvádza sa |
| OpenStreetMap | súradnice staníc lanoviek | ODbL | – |

Surové súbory LWD nie sú v gite (`~/.cache/ztlzdrf/lwd-ktn/`). Odvodené súhrny z nich (počty búrok,
skóre podľa staníc) v `data/` sú; majiteľ požiadal LWD o súhlas aj s ich použitím.

## Ako to funguje

GitHub Pages servuje statické súbory, server tu nie je. `docs/index.html` nesie snímku dát aj kód,
ktorý ju vypočítal a nakreslí:

```
Open-Meteo ───────┐                              ┌─> docs/data/ski.json   (snímka, verzia 6)
                  ├─> src/ski.ts (CI 3× denne) ──┼─> docs/index.html      (predkreslená stránka + kód)
avalanche.report ─┘                              └─> data/prospective/<sezóna>.jsonl (log na overenie)

prehliadač: tlačidlo „Obnoviť predpoveď“, alebo sám (pri otvorení, návrate na stránku a každú minútu),
keď sú dáta staršie ako 60 min, keď sa po 16:00 zmení najbližší lyžiarsky deň alebo keď skončí platnosť
lavínovej správy → ten istý výpočet znova
```

- `src/ski-core.js` – **celý výpočet**, čisté ESM bez importov. Beží v Node (generátor, testy) a ten
  istý súbor sa vkladá do stránky.
- `src/ski-ui.js` – kreslenie (snímka → HTML) a v prehliadači obnova dát.
- `src/ski-page.ts` – HTML, CSS, pätička; obsah predkreslí tým istým kódom vo `vm`, takže stránka je
  čitateľná aj bez JavaScriptu.
- `src/ski.ts` – generátor: stiahne tri horizonty a lavínovú správu, uloží snímku, zapíše stránku.
  Snímku mladšiu ako 20 min použije znova (ak sa medzitým nezmenil najbližší deň); keď sťahovanie zlyhá,
  publikuje poslednú platnú.
- `src/prospective.ts` – pri každom čerstvom stiahnutí pripíše riadok do sezónneho logu predpovedí.
- `src/config.ts` – strediská (stanice, odkazy, sezóna, lavínový región), horizonty, pravidlá, zdroje.
  `src/*-model.ts` sú kópie `data/*/…-model.json`, z ktorých ich vyrábajú offline skripty.
- `src/fixtures/` – skutočné odpovede (lavínové správy 2025/26) pre testy; testy sú v `src/*.test.ts`
  a `scripts/lib/*.test.ts`.
- `scripts/` a `scripts/lib/` – offline skripty (nižšie); `data/<oblasť>/REPORT.md` – ich výsledky;
  `prompts/fable-presna-predpoved.md` – pôvodné zadanie modelu z 3. 10. 2026.
- `.github/workflows/ski.yml` – CI **len november až apríl** o 04:13, 10:13 a 16:13 UTC: build, testy,
  generátor, commit `docs/` a `data/prospective/`, ak sa niečo zmenilo; beh má limit 20 minút. Ručne:
  Actions → Ski Conditions → Run workflow (alebo `gh workflow run ski.yml`); mimo novembra až apríla
  taký beh obnoví stránku, ale riadok logu zapíše len do dočasného priečinka.

Pri zmene tvaru snímky treba zvýšiť `SKI_SNAPSHOT_VERSION` v `src/ski-core.js`; starú snímku generátor
odmietne a stiahne znova.

## Vývoj

Node 24 ako v CI.

```sh
npm ci
npm run build && npm test && npm run check:scripts             # musí prejsť
npm run ski                                                    # stiahne, zapíše docs/ aj riadok logu
SKI_DOCS_DIR=/tmp/ski SKI_LOG_DIR=/tmp/ski/log npm run ski     # všetko mimo repozitára
SKI_DOCS_DIR=/tmp/ski SKI_RENDER_ONLY=true npm run ski         # bez siete, z uloženej snímky
```

- `docs/` generovať ako CI: `npm run build && node dist/ski.js`. Mimo novembra až apríla ide riadok logu
  sám do dočasného priečinka systému (`logDirFor` v `src/ski.ts`), v sezóne do `data/prospective/` –
  ručné behy v sezóne preto spúšťať so `SKI_LOG_DIR` mimo repozitára.
- `SKI_RENDER_ONLY=true` berie konfiguráciu zo snímky – po zmene `src/config.ts` treba stiahnuť znova.
- V sezóne CI commituje trikrát denne: pred prácou `git pull --rebase`, `docs/` pregenerovať až potom.
- Testy stránky počítajú vnútri `<main id="sk-main">` a odstraňujú modulový skript (vložený kód má tie
  isté názvy tried). Fixtúra s rovnakou teplotou hore aj dole dáva inverziu 62 % – správne.
- Zabitý `tsx` beh môže nechať proces `node`, ktorý zožerie procesor; ďalšie behy sú potom 100× pomalšie.
- Dátumové konvencie zdrojov (eHYD, GeoSphere, LWD) sú overené proti INCA v METODIKA §3.9.

## Offline modely

Ťažké výpočty bežia offline cez `npm run` (tsx). Surové dáta sú v `~/.cache/ztlzdrf` mimo gitu
(`ZTLZDRF_CACHE` ho presmeruje); do gitu idú len malé odvodené JSON a správy `REPORT.md`.

| Príkaz | Čo robí | Výstup |
|---|---|---|
| `npm run truth:fetch`, potom `npm run truth` | história meraní (eHYD, GeoSphere, LWD), búrky, klimatológia | `data/truth/` |
| `npm run backtest:fetch`, potom `npm run backtest` | archív predpovedí s predstihom, skóre surových modelov | `data/backtest/` |
| `npm run model` | zákon prašanu podľa predstihu | `data/model/` → `src/powder-model.ts` |
| `npm run rules`, `npm run quality` | pravidlá dňa a krivky kvality proti staniciam | `data/rules/`, `data/quality/` → `src/quality-model.ts` |
| `npm run cover` (najprv `npm run backtest:fetch -- --only=snow`) | modelová výška snehu proti nameranej | `data/cover/` → `src/cover-model.ts` |
| `npm run regions` | mikroregióny EAWS staníc lanoviek proti `src/config.ts` | chyba pri nezhode |
| `npm run verify` | po sezóne: log predpovedí proti pravde | `data/prospective/REPORT-<sezóna>.md` |

Open-Meteo sa volá postupne; `scripts/lib/cache.ts` pri minútovom limite čaká a pri hodinovom skončí
(exit 2) – potom pokračovať neskôr z cache. Prepínače jednotlivých skriptov: METODIKA §8.

## Stav a denník krokov

Stav k 23. 10. 2026: kroky 0–9 sú hotové a nasadené, krok 10 (opravy z review) prebieha. Rozhodujúci
test modelu je sezóna 2026/27. Každý krok je samostatný commit schválený majiteľom; rozhodnutia s
dátumom sú v METODIKA §2.

| Krok | Hotovo | Čo pribudlo | METODIKA |
|---|---|---|---|
| 0 – audit dát | 3. 10. 2026 | zdroje predpovedí a meraní, archívy, licencie, CORS | §3.1–3.8 |
| 1 – pravda a klimatológia | 3. 10. 2026 | 10 ručných staníc nového snehu, automaty, dátumové konvencie; 3–5 búrok ≥ 15 cm za sezónu na stanicu | §3.9 |
| 2 – backtest | 4. 10. 2026 | pevný prah 15 cm nemá zručnosť, úhrn ale áno (AUC 0,96–0,98 do 35 h) | §5.1 |
| 3 – model prašanu | 4. 10. 2026 | dvojdielne rozdelenie podľa predstihu: BSS 0,26 pri 23 h, ICON-D2 0,34 pri 1 dni | §4.1–4.3 |
| 4 – zapojenie | 4. 10. 2026 | `powderSnow` v snímke, prvý deň z ICON-D2 (predtým AROME), ALERT od p* = 0,20 | §4.4 |
| 5 – prospektívny log | 4. 10. 2026 | riadok na každý čerstvý beh CI, `npm run verify` po sezóne | §5.2 |
| 6 – kvalita dňa | 4. 10. 2026 | kalibrované krivky dažďa, vetra, slnka a inverzie (BSS 0,3–0,6 pri 0–1 d) | §4.5, §5.3–5.4 |
| 7 – pravdepodobnosti na stránke | 5. 10. 2026 | pruh dobré / ujde / zlé namiesto áno/nie | §4.6 |
| 8 – predpoklad snehu | 16. 10. 2026 | „Bez snehu“ z modelovej pokrývky ICON-D2 (BSS 0,31, AUC 0,95) | §4.7, §5.5 |
| 9 – lavínový stupeň | 16. 10. 2026 | stupeň EAWS regiónu hornej stanice na karte najbližšieho dňa | §4.8 |
| 10 – review a opravy | 23.–24. 10. 2026 | review kódu, skriptov, dokumentácie a CI; 10a jeden README (TODO.md zlúčené), opravy METODIKA; 10b stránka a log: platná lavínová správa, obnova otvorenej stránky, časové limity, log bez straty riadku; 10c CI: akcie v7, limit 20 min, ručný beh mimo sezóny mimo logu; 10d čísla: BSS brány pokrývky 0,31 namiesto 0,46 (klimatológia z dlhých radov), backtest na úplnom archíve ICON-D2 s orezaným ΔHS, krivky bez zmeny | §2, §4.7, §4.8, §5.1, §5.2, §5.5 |

## Sezóna 2026/27

- **Pred 1. 11.** – `npm run regions` (polygóny EAWS majú dátumy platnosti, skript skončí chybou, keď
  `avalancheRegion` nesedí). Po každej zmene workflow alebo generátora skúšobný beh (`gh workflow run
  ski.yml`).
- **1. 11. – CI štartuje.** Po prvom behu: pribudol commit s `docs/` a `data/prospective/2026-27.jsonl`;
  riadok má `stations` (6 staníc) aj `members` (51 hodnôt od D+1); ~3 riadky denne po 17–24 kB. Ak log CI
  hlási „log bude bez staníc“, pozrieť `pointsUrl` a limity Open-Meteo.
- **Koniec novembra – prvá lavínová správa** (2025/26 vyšla 28. 11.): karty ukazujú stupeň a odkaz
  „Lavínová správa“. Ak nie, overiť, či existuje
  `https://static.avalanche.report/bulletins/<dátum>/<dátum>_AT-02_de_CAAMLv6.json`; pri zmene adresy
  stačí upraviť `avalanche` v `src/config.ts`.
- **Počas sezóny** sa koeficienty nemenia (METODIKA §7). Opravy kódu a UI sú možné; pri zmene tvaru
  snímky zvýšiť `SKI_SNAPSHOT_VERSION` – log nesie `v` aj `snapshotVersion`.
- **Január 2027** – priebežná kontrola: `npm run verify` beží aj na čiastočnom logu, ak je v cache pravda
  (`npm run truth:fetch`, `npm run truth`); čísla budú hrubé, ale ukážu hrubé chyby.
- **Najneskôr marec 2027** – `npm run truth:fetch -- --only=lwd`: súbory LWD držia len 12 mesiacov
  (len so súhlasom LWD).
- **Máj 2027 – vyhodnotenie:** `npm run truth:fetch` → `npm run truth` → `npm run verify`
  (→ `data/prospective/REPORT-2026-27.md`: BSS, spoľahlivosť a CRPS podľa predstihu a slotu CI, strediská
  cez náhradné stanice `RESORT_PROXY`, rozhodovacia tabuľka pre p*). Potom podľa METODIKA §7 koeficienty
  ostanú, alebo sa po opravách „na prefit“ (Otvorené) a s novou zimou v archíve (`npm run backtest:fetch`)
  prefitujú: `model` → `src/powder-model.ts`, `rules` + `quality` → `src/quality-model.ts`,
  `backtest:fetch -- --only=snow` + `cover` → `src/cover-model.ts`, a `version` sa zvýši. Z logu overiť
  aj kotvenú zmenu pokrývky (`snowCover` staníc na D+1, D+2 a vo výhľade proti nameranej výške snehu).
  Najprv správa majiteľovi, až potom zmena.
- **Pred zimou 2027/28** – GitHub po 60 dňoch bez commitu vypína plánované workflow: v októbri
  skontrolovať, že Ski Conditions je zapnutý; obnoviť `season` v `src/config.ts`; `npm run regions`.

## Otvorené

**Čaká na majiteľa:**

- **LWD Kärnten** – odpoveď na žiadosť zo 16. 10. 2026 (staničné dáta Turracherhöhe 2900265 a Falkert
  2900240 a odvodené čísla v `data/`; Abteilung 3, abt3.katastrophenschutz@ktn.gv.at). Dovtedy sa surové
  súbory používajú len súkromne a LWD sa ako zdroj meraní na stránke neuvádza. Lavínová správa je iný
  prípad (CC BY 4.0, už na stránke).
- **Prah POWDER ALERT** p* = 0,20 (N = 4) je predvolená hodnota, nie meranie: potvrdiť alebo zmeniť
  `alert.minProb` v `src/powder-model.ts` podľa rozhodovacej tabuľky v `data/model/REPORT.md`
  (p* = 1/(N + 1), N = koľko zbytočných ciest stojí za jeden zmeškaný powder deň).
- **Spätná väzba na zobrazenie** – slová, poradie riadkov, prahy 20 % (dôvody), 5 % (prašan v tabuľke) a
  50 % (inverzia) sú voľby, nie merania.

**Na prefit po sezóne (máj 2027), teraz nemeniť:** stopové úhrny (eHYD 0,001 cm, šum ΔHS LWD) sa v
`scripts/model-fit.ts` rátajú ako „snežilo“ – jeden prah 1 cm pre všetky zdroje; sklon predstihu ICON-D2
fitovať na rovnakej vzorke staníc pri 0 h aj pri 1 dni; v `scripts/truth-fetch.ts` opraviť `yearChunks`
(na jar 2028 by poslal zlú požiadavku), v `scripts/backtest-fetch.ts` dopĺňať čiastočne stiahnuté mesiace,
v `scripts/lib/cache.ts` zapisovať atomicky.

**Nápady (neschválené – najprv plán a „Áno“):**

1. **„Kam zajtra“** – jeden riadok navrchu s najlepším strediskom na najbližší deň (cieľ zo zadania,
   stránka ho dnes nerieši).
2. **Kalibrácia 10-dňového výhľadu** z `members` v logu (dvojdielne rozdelenie na priemer a rozptyl
   členov), potom aj pravdepodobnosť prašanu D+3–D+9 (stupeň VÝHĽAD). Potrebuje aspoň jednu sezónu logu.
3. **Predstih v krivkách kvality** – dnes sú z predstihu 0; na logu overiť, či na D+1 a D+2 držia.
4. **D+3 so stupňom POZOR** – štvrtý deň tabuľky (rozhodnutie majiteľa); IFS pri ~95 h má BSS len ~0,1.
5. **Zo zadania nedorobené:** hysteréza stupňa ALERT medzi behmi, značky „fresh tracks“ a „bluebird powder“.
6. **Stav povrchu snehu** (vek snehu, dážď na sneh, topenie a mrznutie za 14–30 dní) – chýba pravda
   (SNOWGRID udalosti nevidí, výška snehu a teploty LWD by mohli stačiť na jednoduchý index); najprv audit,
   potom plán.
7. **Namerané hodnoty a snehová správa** v snímke cez generátor („koľko napadlo naozaj“; zdroje bez CORS
   prehliadač načítať nevie) – nový zdroj = nová licencia = najprv otázka.
8. **Technické:** jedna spoločná sekvencia sťahovania pre generátor aj prehliadač (dnes dve kópie, ktoré sa
   rozišli); nesťahovať 10-dňový ansámbel (~2,3 MB), keď nepribudol nový beh; test obnovy v prehliadači a
   testy na dňoch zmeny času; upratať zdvojené konštanty v skriptoch.
9. **Pokrývka ďalej:** výška snehu v údolí (dolná stanica) ako druhá brána alebo poznámka; `npm run verify`
   rozšíriť o skóre pokrývky.
10. **UI drobnosti** podľa spätnej väzby: tooltipy v hodinovom grafe, náraz v powder okne (dnes skrytý, bez
    zručnosti), vrstva „pre mamu“ (majiteľ zatiaľ nechcel).

## Pravidlá práce na projekte

- **Postup:** krátky plán → „Áno“ → malé kroky, každý jeden commit → správa (výsledok, overenie, čo je
  predpoklad) → push až po schválení. Podstatný krok dostane riadok v denníku krokov tu a zápis v
  METODIKA §2.
- **Jazyk:** slovenčina s majiteľom a v dokumentoch; kód, komentáre a commity po anglicky.
- **Architektúra:** statická stránka bez servera; živý výpočet len v `src/ski-core.js` (čistý, bez
  importov a Node API); zdroj pre prehliadač musí mať CORS a rozumnú veľkosť. Ťažké veci offline v
  TypeScripte, surové dáta v cache mimo gitu, Python len po dohode.
- **Dáta:** Open-Meteo bezplatne len nekomerčne a šetrne; žiadne API kľúče, platené služby ani scraping
  bez súhlasu majiteľa; licencie dodržať; nikam neposielať osobné údaje.
- **Testy:** `npm run build && npm test` musí prejsť; nová logika má deterministické testy na fixtúrach
  zo skutočných odpovedí.
- **Zastaviť sa a opýtať:** na konci kroku, pred novým zdrojom dát, licenciou alebo veľkým sťahovaním a
  keď dáta vyvrátia predpoklad kroku. Drobnosti v schválenom kroku rozhodnúť a zapísať ako predpoklad.
- **Na začiatku relácie:** tento súbor a METODIKA §1, §2, §4 a §6–7; potom
  `npm ci && npm run build && npm test && npm run check:scripts`.

## História

Do októbra 2026 bola v repozitári aplikácia na natieranie terasy; je v histórii gitu pred commitom
„Judge ski days at four nearby resorts over three horizons“ (0eb2896).
