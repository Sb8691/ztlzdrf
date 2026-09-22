# ztlzdrf

Rozhodovacia pomôcka pre maľovanie/moridlovanie drevenej terasy na **Zedlitzdorf 74 (Gnesau,
Feldkirchen, Kärnten, Rakúsko)**: nie je to všeobecný predpovedný dashboard, ale odpoveď na otázku
*"dá sa dnes maľovať terasa a kedy presne"*.

Projekt každé ráno o 9:00 (Europe/Vienna) stiahne počasie za okno **−24 h / +60 h** okolo
aktuálneho času z [GeoSphere Austria](https://www.geosphere.at/) (INCA analýza pre minulosť, AROME
+ ensemble predpoveď pre budúcnosť – pozri `src/geosphere.ts` pre presné endpointy/parametre),
vyhodnotí vhodnosť na maľovanie (`src/painting.ts`) a pošle rozhodnutie e-mailom cez
[Resend](https://resend.com/) aj na dashboard. Rozhodnutie je vždy na prvom mieste – graf počasia
je až pod ním, pre tých, čo chcú vidieť prečo.

## Ako to funguje

- `src/geosphere.ts` – `fetchWeatherWindow()` stiahne minulú časť z INCA (zrážky, teplota,
  vlhkosť, žiarenie, rosný bod, vietor), budúcu z AROME (to isté okrem rosného bodu, ten sa
  dopočítava) a obohatí budúcu časť o percentily zrážok z ensemble predpovede
  (`ensemble-v2-1h-1km`, GeoSphere-in C-LAEF-triedy AlpeAdria produkt). Horizont AROME/ensemble je
  61 h od každého referenčného času (nový cyklus každé 3 h), takže reálne dostupných je z "teraz"
  typicky ~52-58 h – o pár hodín menej než požadovaných 60 h tesne pred novým cyklom. Toto sa nič
  neopravuje: chýbajúce hodiny sa jednoducho nevracajú (nikdy sa nevymýšľajú).
- `src/astronomy.ts` – čisto matematický výpočet východu/západu slnka (bez externého API),
  používaný na zatienenie noci v grafoch a na vylúčenie maľovania v tme.
- `src/painting.ts` – **jadro rozhodovania**: `evaluatePaintingConditions()` je jediný vstupný bod;
  všetko ostatné (rosný bod, potenciál vysychania, najlepšie okno, odhad stavu terasy,
  pravdepodobnosť zrážok z ensemble percentilov) sú čisté funkcie, ktoré skladá dohromady. Pravidlá
  (teplota/vlhkosť/rosný bod/vietor/potrebný bezdažďový čas) sú konfigurovateľné konštanty v
  `src/config.ts` (`PAINTING_RULES`) – nie sú to certifikované požiadavky výrobcu náteru, len
  rozumný predvolený odhad.
- `src/dashboard.ts` – rozdelené grafy (zrážky / teplota+rosný bod / vlhkosť / žiarenie+vietor,
  každý s vlastnou osou), časová os vhodnosti na maľovanie, karta s rozhodnutím a panely s
  detailmi. Rovnaké komponenty (okrem interaktivity) sa používajú aj pri rasterizácii
  `docs/chart.png` pre e-mail.
- `src/email.ts` – rozhodnutie na prvom mieste (do ~5 sekúnd čítania), potom kompaktný súhrn a
  jeden hosťovaný obrázok so všetkými štyrmi grafmi (Gmail a väčšina klientov odmieta inline SVG aj
  `data:` URI, takže obrázok musí byť skutočne hosťovaný na `docs/chart.png`).
- `src/index.ts` – orchestrácia behu; spúšťa ho `.github/workflows/watchdog.yml` denne cez GitHub
  Actions cron (aj ručne cez `workflow_dispatch`). Voliteľne prijme ručne nameranú vlhkosť dreva
  cez `WOOD_MOISTURE_PCT` (a `WOOD_MOISTURE_MEASURED_AT`) – ak je nastavená, prepíše
  meteorologický odhad stavu terasy.

## Dashboard

Každý beh vygeneruje `docs/index.html` s rozhodnutím, časovou osou a podrobnými grafmi počasia.
Lokálne si ho vieš pozrieť cez `open docs/index.html` po `npm run dev`.

Na GitHub ho sprístupníš cez **Settings → Pages → Source: Deploy from a branch → Branch: `main`,
folder `/docs`** – dostaneš stálu URL (`https://sb8691.github.io/ztlzdrf/`), ktorá sa aktualizuje
pri každom behu workflow.

## Výhľad na konkrétne dni (strednodobý ensemble)

GeoSphere končí pri +60 h, takže na otázku *"dá sa maľovať o desať dní?"* odpovedá samostatný beh
`src/outlook.ts` (`npm run outlook`, v CI `node dist/outlook.js`):

- Okno maľovania je v `src/config.ts` (`OUTLOOK.window`, aktuálne 1.–4.10.2026) a dá sa prepísať
  cez `OUTLOOK_START` / `OUTLOOK_END`. Pri zmene okna sa stará história odloží vedľa do
  `docs/outlook/history-<od>_<do>.json` a začne sa nová.
- Dáta idú z [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api) (bez kľúča):
  primárne ECMWF IFS ENS (51 členov, 15 dní), pre kontrolu zhody ECMWF AIFS ENS a GEFS; európsky
  9 km IFS ENS sa pripojí sám, keď jeho ~6-dňový horizont dosiahne okno. Pozri `src/openmeteo.ts`
  (vrátane toho, prečo sa beh nedá určiť len z metadát – 06z/18z cykly ECMWF siahajú iba 144 h).
- **Žiadne nové pravidlá**: každý člen ensemblu prejde tým istým hodinovým hodnotením ako denné
  rozhodnutie (`evaluateHourForPainting`). Deň je pre člena *maľovateľný*, ak má aspoň
  `OUTLOOK.minGoodHours` (4 h) súvisle GOOD hodín, a *aspoň hraničný*, ak toľko hodín nie je BAD.
  Podiel takých členov je pravdepodobnosť; verdikt dňa (🟢/🟡/🔴) dávajú prahy v
  `OUTLOOK.dayStatus`. Jadro je čisté (`src/outlook-core.ts`) a pokryté `src/outlook.test.ts`.
- Každý beh modelu (00z/12z) sa uloží ako malý súhrn do `docs/outlook/history.json` – ukladanie je
  idempotentné (rovnaký beh alebo rovnaké čísla sa nezapíšu dvakrát), surové série členov sa
  neukladajú.
- `docs/outlook.html` má dve vrstvy. Navrchu **jednoduchá vrstva** (`src/outlook-plain.ts`): pre
  každý deň okna semafor so slovom (🟢 Pravdepodobne áno / 🟡 Neisté / 🔴 Skôr nie), piktogram
  počasia so slovom, teplota cez deň, šanca ako „áno v 6 z 10 predpovedí“, trend slovami a malý graf
  toho, ako sa šanca menila deň po dni. Je to čistá funkcia `history.json`, bez percent, názvov
  modelov a čísel behov – aby to pochopil aj netechnický čitateľ. Pod jedným rozbaľovačom
  „Podrobnosti pre technika“ ostáva všetko ostatné: podiely členov, **vývoj predpovede beh po behu**
  (jeden panel na cieľový deň: pravdepodobnosť maľovateľného dňa, aspoň hraničného dňa, dažďa a
  názory ostatných modelov), tabuľka všetkých behov a ensemble meteogram posledného behu (mediánový
  scenár, konsenzuálny pás vhodnosti).
- Mapovanie čísel na slová (`OUTLOOK.plain`): P(dážď ≥ 1 mm) ≥ 0,5 → 🌧️ „skôr dážď“, ≥ 0,3 → 🌦️
  „možno prehánky“, inak ☀️ „sucho“ (ak medián GOOD okna dosahuje `minGoodHours`) alebo 🌤️
  „sucho, ale chladno / vlhko / nie ideálne“. Šanca je `floor(P × 10)`, aby „6 z 10“ vždy sedelo
  so zeleným semaforom (🟢 od 0,6); žltý deň, ktorý za verdikt vďačí podielu „aspoň hraničných“
  členov, to dopovie („áno v 1 z 10 predpovedí, aspoň čiastočne v 7 z 10“). Trend „od včera lepšie /
  horšie / bez zmeny“ je ten istý ±10 p. b. výpočet ako šípka v detailoch; bez porovnania (prvá
  snímka, zmena modelu) sa píše „zatiaľ nie je s čím porovnať“. Piktogram vyjadruje riziko dažďa a
  vhodnosť, nie oblačnosť.
- Karta na hlavnom dashboarde aj blok v rannom e-maile hovoria tou istou jednoduchou rečou (spoločné
  funkcie z `src/outlook-plain.ts`, takže si nikdy neodporujú): karta je zoznam štyroch dní, e-mail
  dvojstĺpcová tabuľka (deň + počasie | verdikt + šanca + trend). Technické údaje sú na karte pod
  rozbaľovačom „Zdroj“ a v e-maile vôbec nie sú – tam vedie len odkaz na stránku.
- `docs/outlook.png` je ten istý prehľad štyroch dní ako obrázok (480 px, rasterizované 2×) –
  jediné, čo pridáva navyše, sú grafy šance. Piktogramy aj semafor sú kreslené SVG tvary, **nie
  emoji**: rasterizér na CI nemá emoji font a nakreslil by prázdne štvorčeky (stráži test). Adresa
  obrázka nesie hash jeho vlastného obsahu, takže Gmail ho pretiahne presne vtedy, keď sa zmenil.
  `alt` obsahuje všetky štyri vety, aby e-mail dával zmysel aj s vypnutými obrázkami.
- Oboje sa ukazuje len kým okno trvá, potom zmiznú samy. Prešlé dni okna sú na stránke sivé („už je za nami“);
  po skončení okna sa stránka ešte raz prerenderuje do stavu „okno už uplynulo“ (história ostáva
  v detailoch) – s pevnou pečiatkou polnoci po konci okna, takže ďalšie behy už nič nemenia.
- Workflow beží navyše o 11:13 a 23:13 UTC bez e-mailu, aby zachytil 00z a 12z beh ECMWF.

Výhľad na 9–12 dní je orientačný: sleduj trend a zhodu modelov, nie jednotlivé čísla. Keď sa okno
dostane do horizontu +60 h, rozhoduje hlavný dashboard (AROME/INCA).

## Lokálne spustenie

```bash
npm install
cp .env.example .env   # doplň RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM
SEND_EMAIL=false npm run dev   # vypíše výsledok do konzoly bez odoslania e-mailu
npm run outlook                # snímka strednodobého výhľadu -> docs/outlook/history.json, docs/outlook.html
npm test
```

Ladenie vzhľadu výhľadu bez siete a bez dotyku živej histórie v `docs/` (rovnaká štruktúra
`outlook/history.json` ako v `docs/`):

```bash
mkdir -p /cesta/scratch/outlook && cp docs/outlook/history.json /cesta/scratch/outlook/
OUTLOOK_DOCS_DIR=/cesta/scratch OUTLOOK_RENDER_ONLY=true npm run outlook   # -> /cesta/scratch/outlook.html + .png
```

Meteogram posledného behu vtedy chýba (potrebuje čerstvo stiahnutých členov).
`OUTLOOK_FORCE_RENDER=true` prerenderuje aj bez nového behu.

Náhľad presne toho HTML, ktoré by odišlo e-mailom (obrázky sa ťahajú z Pages, takže ukazujú stav
posledného publikovaného behu):

```bash
EMAIL_PREVIEW_PATH=/cesta/scratch/mail.html SEND_EMAIL=false npm run dev
```

## Nasadenie na GitHub Actions

V nastaveniach repozitára (Settings → Secrets and variables → Actions) treba pridať:

- `RESEND_API_KEY` – API kľúč z [resend.com](https://resend.com/)
- `ALERT_EMAIL_TO` – e-mail, na ktorý má prísť alert
- `ALERT_EMAIL_FROM` – odosielajúca adresa overená v Resend

Workflow beží denne o 9:00 (Europe/Vienna) a dá sa spustiť aj ručne cez záložku *Actions →
Terrace Painting Watchdog → Run workflow* – vtedy tiež pošle aktuálny e-mail.
