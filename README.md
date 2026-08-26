# ztlzdrf

Predpoveď počasia pre **Zedlitzdorf 74 (Gnesau, Feldkirchen, Kärnten, Rakúsko)**.

Projekt každé ráno o 9:00 (Europe/Vienna) vygeneruje jeden graf počasia – **zrážky** (stĺpce),
**slnečné žiarenie** (plocha) a **teplotu** (čiara) – v okne od **24 hodín dozadu** po **24 hodín
dopredu** od aktuálneho času, a pošle ho e-mailom cez [Resend](https://resend.com/). Rovnaký graf
je vidieť aj na dashboarde. Minulá časť okna pochádza z [GeoSphere Austria](https://www.geosphere.at/)
INCA analýzy (skutočne namerané/analyzované dáta, nie predpoveď), budúca časť z ich AROME
predpovede (1 km, hodinová) – oboje cez ich verejné Data Hub API, bez API kľúča.

## Ako to funguje

- `src/geosphere.ts` – `fetchWeatherWindow()` stiahne minulú časť okna z INCA
  (`timeseries/historical/inca-v1-1h-1km`, parametre `RR`/`T2M`/`GL`) a budúcu časť z AROME
  (`timeseries/forecast/nwp-v2-1h-1km`, parametre `tp`/`2t`/`ssrd`), zlúči ich do jedného hodinového
  radu a UTC časy prevedie na miestny (Europe/Vienna) čas. Slnečné žiarenie (W/m²) je spoločný
  parameter oboch datasetov a slúži ako priebežná náhrada za "slnečné svetlo".
- `src/dashboard.ts` – `buildWeatherChart()` vykreslí jeden SVG graf (zrážky = stĺpce na ľavej osi
  v mm, teplota = čiara na pravej osi v °C, slnečné žiarenie = jemná vyplnená plocha bez vlastnej
  číselnej osi, so skutočnou hodnotou vo W/m² dostupnou po prejdení myšou) so zvislou čiarou
  označujúcou "teraz". Táto funkcia sa používa nezmenená aj v e-maile aj na dashboarde, aby mali
  presne rovnaký vizuál (v e-maile bez interaktívnej vrstvy – hover tooltip funguje iba na
  dashboarde).
- `src/email.ts` – zostaví a odošle e-mail cez Resend API s tým istým grafom vloženým ako inline
  SVG, plus krátky súhrn (súčet zrážok, rozsah teploty za celé okno).
- `src/index.ts` – orchestrácia celého behu; spúšťa ho `.github/workflows/watchdog.yml` denne cez
  GitHub Actions cron (aj ručne cez `workflow_dispatch`). E-mail sa posiela pri každom behu.

## Dashboard

Každý beh vygeneruje `docs/index.html` s grafom počasia za posledných/najbližších 24 hodín.
Lokálne si ho vieš pozrieť cez `open docs/index.html` po `npm run dev`.

Na GitHub ho sprístupníš cez **Settings → Pages → Source: Deploy from a branch → Branch: `main`,
folder `/docs`** – dostaneš stálu URL (`https://sb8691.github.io/ztlzdrf/`), ktorá sa aktualizuje
pri každom behu workflow.

## Lokálne spustenie

```bash
npm install
cp .env.example .env   # doplň RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM
SEND_EMAIL=false npm run dev   # vypíše výsledok do konzoly bez odoslania e-mailu
```

## Nasadenie na GitHub Actions

V nastaveniach repozitára (Settings → Secrets and variables → Actions) treba pridať:

- `RESEND_API_KEY` – API kľúč z [resend.com](https://resend.com/)
- `ALERT_EMAIL_TO` – e-mail, na ktorý má prísť alert
- `ALERT_EMAIL_FROM` – odosielajúca adresa overená v Resend

Workflow beží denne o 9:00 (Europe/Vienna) a dá sa spustiť aj ručne cez záložku *Actions →
Terrace Painting Watchdog → Run workflow* – vtedy tiež pošle aktuálny e-mail.
