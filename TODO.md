# TODO – ako pokračovať

Stav k 5. 10. 2026: kroky 0–7 zadania (`prompts/fable-presna-predpoved.md`) sú hotové a pushnuté
(`origin/main` = `0c4cf25`). Stránka ukazuje kalibrované pravdepodobnosti, POWDER ALERT a očakávaný nový
sneh; CI loguje predpovede od novembra. Rozhodujúci test modelu je sezóna 2026/27. Čísla, definície a
rozhodnutia sú v [METODIKA.md](METODIKA.md), denník krokov v [README.md](README.md); tu je len to,
čo treba urobiť a kedy.

## Na začiatku každej relácie

1. Prečítať [METODIKA.md](METODIKA.md) (aspoň §1 definície, §2 denník rozhodnutí, §4.1 tvar modelu,
   §4.4 zapojenie, §4.6 zobrazenie, §6 limity, §7 prekalibrovanie) a tento súbor.
2. `npm ci && npm run build && npm test && npm run check:scripts` – musí prejsť (62 testov).
3. Pracovný postup ostáva: krátky plán → „Áno“ → práca po malých krokoch, každý krok jeden commit →
   správa (výsledok jednou vetou, tabuľka s CI, čo je overené a čo predpoklad) → push až po schválení.
   Slovenčina s majiteľom; kód, komentáre a commity po anglicky. Každý podstatný krok dostane riadok v
   README (tabuľka krokov) a zápis v METODIKA §2.

## Čaká na majiteľa

- [ ] **LWD Kärnten** – list so žiadosťou o súhlas s nekomerčným použitím staníc Turracherhöhe 2900265 a
      Falkert 2900240 (Abteilung 3, abt3.katastrophenschutz@ktn.gv.at). Kým nepríde, dáta sa používajú len
      súkromne (`~/.cache/ztlzdrf/lwd-ktn/`), nie sú v gite a na stránke sa neuvádzajú.
- [ ] **Prah POWDER ALERT** p* = 0,20 (N = 4) je predvolená hodnota, nie meranie. Potvrdiť alebo zmeniť
      jedno číslo `alert.minProb` v `src/powder-model.ts` podľa rozhodovacej tabuľky v
      `data/model/REPORT.md` (p* = 1/(N + 1), N = koľko zbytočných ciest stojí za jeden zmeškaný powder deň).
- [ ] **Spätná väzba na zobrazenie** po pozretí živej stránky (sb8691.github.io/ztlzdrf): slová, poradie
      riadkov, prahy 20 % (dôvody), 5 % (prašan v tabuľke), 50 % (inverzia) – sú to voľby, nie merania.
- [ ] Rozhodnúť, či `prompts/` (zadanie) patrí do gitu; zatiaľ je necommitnuté.

## Kalendár sezóny 2026/27

- **1. 11. 2026 – CI štartuje** (`.github/workflows/ski.yml`, 04:13 / 10:13 / 16:13 UTC, len nov–apr).
  Po prvom behu skontrolovať: pribudol commit s `docs/` a `data/prospective/2026-27.jsonl`; riadok má
  `stations` (6 staníc) aj `members` (51 hodnôt na deň D+1 a ďalej); ~3 riadky za deň, 17–24 kB na riadok.
  Ak v logu CI svieti „log bude bez staníc“, pozrieť `pointsUrl` a limity Open-Meteo.
- **Počas sezóny** – koeficienty sa nemenia (METODIKA §7). Opravy kódu a UI sú možné; pri zmene tvaru
  snímky zvýšiť `SKI_SNAPSHOT_VERSION`, log nesie `v` a `snapshotVersion`, takže vyhodnotenie to rozlíši.
- **Január 2027** – priebežná kontrola oproti dojmu: `npm run verify` beží aj na čiastočnom logu, ak je v
  cache pravda (`npm run truth:fetch`, `npm run truth`); čísla budú hrubé, ale ukážu hrubé chyby.
- **Najneskôr marec 2027** – `npm run truth:fetch -- --only=lwd`: SMET súbory LWD držia len posledných
  12 mesiacov, zimu treba stiahnuť, kým v nich celá je (len so súhlasom LWD).
- **Máj 2027 – vyhodnotenie sezóny:** `npm run truth:fetch` → `npm run truth` → `npm run verify`
  (→ `data/prospective/REPORT-2026-27.md`, `summary-2026-27.json`): BSS, spoľahlivosť a CRPS podľa
  predstihu a slotu CI, stanice vs. strediská (strediská cez náhradné stanice `RESORT_PROXY`), rozhodovacia
  tabuľka pre p*. Potom podľa METODIKA §7: buď koeficienty ostanú, alebo `npm run backtest:fetch` +
  `npm run model` s novou zimou v archíve a `version` v `src/powder-model.ts` + 1; to isté pre krivky
  kvality (`npm run rules`, `npm run quality` → `src/quality-model.ts`). Správa majiteľovi, až potom zmena.

## Ďalšie kroky (nie sú schválené – najprv plán a „Áno“)

1. **Kalibrácia 10-dňového výhľadu.** Podiely scenárov ansámblu sú nekalibrované; z `members` v logu sa
   po sezóne dá fitovať zákon pre ansámbel (dvojdielne rozdelenie na priemer / rozptyl členov) a dať
   pravdepodobnosť prašanu aj D+3–D+9 (stupeň VÝHĽAD). Potrebuje aspoň jednu sezónu logu.
2. **Predstih v krivkách kvality.** Krivky dažďa, vetra a slnka sú z predstihu 0; po sezóne overiť na
   logu, či na D+1 a D+2 držia (§5.3 naznačuje, že do ~3 dní áno), inak pridať závislosť od predstihu.
3. **D+3 so stupňom POZOR.** Horizont `short` má 3 dni; štvrtý deň znamená širšiu tabuľku stránky
   (rozhodnutie majiteľa) a predstih IFS ~95 h, kde je BSS už len ~0,1.
4. **Stav povrchu snehu** (krok 6 zadania, nerobené): vek snehu, dážď na sneh, topenie a mrznutie za
   14–30 dní. Chýba pravda – SNOWGRID udalosti nevidí, LWD HS a teploty by mohli stačiť na jednoduchý
   index; najprv audit, potom plán.
5. **Pozorovania a snehová správa** do snímky cez generátor (zdroje bez CORS sa v prehliadači načítať
   nedajú): „koľko napadlo naozaj“ vedľa predpovede. Nový zdroj = nová licencia = najprv otázka.
6. **UI drobnosti** podľa spätnej väzby: tooltipy v hodinovom grafe, zobrazenie nárazu v okne (dnes
   skryté, bez zručnosti), vrstva „pre mamu“ (majiteľ zatiaľ nechcel).

## Kde čo je

- Stránka: `src/ski-core.js` (celý výpočet, bez importov, vkladá sa do stránky), `src/ski-ui.js`
  (kreslenie), `src/ski-page.ts` (HTML, CSS, pätička), `src/config.ts` (strediská, horizonty, pravidlá),
  koeficienty `src/powder-model.ts` a `src/quality-model.ts` (kópie `data/model/powder-model.json` a
  `data/quality/quality-model.json`, testy rovnosti), generátor `src/ski.ts`, log `src/prospective.ts`.
- Offline skripty `scripts/*.ts`, knižnica `scripts/lib/`; príkazy v METODIKA §8 a v README.
- Výsledky: `data/truth`, `data/backtest`, `data/model`, `data/rules`, `data/quality`,
  `data/prospective` (každý má `REPORT.md`).
- Surové dáta: `~/.cache/ztlzdrf` (presmerovateľné cez `ZTLZDRF_CACHE`), mimo gitu.
- Zadanie: `prompts/fable-presna-predpoved.md`.

## Čo sa osvedčilo nezabudnúť

- `docs/` generovať ako CI: `npm run build && node dist/ski.js`; mimo sezóny s `SKI_LOG_DIR` mimo
  repozitára, aby sa do sezónneho logu nedostali ručné behy. `SKI_RENDER_ONLY=true` berie konfiguráciu zo
  snímky – po zmene `src/config.ts` treba načítať znova.
- Open-Meteo: požiadavky sekvenčne; 28 bodov × 11 premenných sú ťažké volania – `scripts/lib/cache.ts`
  čaká na minútový limit a pri hodinovom končí (exit 2), potom pokračovať neskôr z cache.
- Zabitý `tsx` beh môže nechať proces `node`, ktorý zožerie procesor; ďalšie behy sú potom 100× pomalšie.
- Testy stránky počítajú vnútri `<main id="sk-main">` a odstraňujú modulový skript (vložený kód má tie isté
  názvy tried). Fixtúra s rovnakou teplotou hore aj dole dáva inverziu 62 % (správne).
- GeoSphere hodinové značky = predchádzajúca hodina ako Open-Meteo; `shneu_manu` a `sh` majú −1 = bez
  snehu; eHYD denná značka = začiatok okna, GeoSphere ručný sneh = koniec (overené proti INCA).

## Pravidlá, ktoré platia stále

- Statická stránka, žiadny server; živý výpočet len v `src/ski-core.js` (čistý, deterministický, bez
  importov a Node API); zdroj pre prehliadač musí mať CORS a rozumnú veľkosť.
- Ťažké veci offline v TypeScripte cez npm, surové dáta v cache mimo gitu, do gitu malé JSON. Python len
  po dohode.
- Bezplatné Open-Meteo len nekomerčne a šetrne; žiadne API kľúče, platené služby ani scraping bez súhlasu
  majiteľa; licencie dodržať (GeoSphere a eHYD sú v pätičke stránky, LWD až po súhlase); nikam neposielať
  osobné údaje.
- `npm run build && npm test` musí prejsť; nová logika má deterministické testy na fixtúrach zo skutočných
  odpovedí.
- Zastaviť sa a opýtať: na konci kroku, pred novým zdrojom dát, licenciou alebo veľkým sťahovaním, a keď
  dáta vyvrátia predpoklad kroku. Drobnosti v schválenom kroku rozhodnúť a zapísať ako predpoklad.
