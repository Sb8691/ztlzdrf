# ztlzdrf

Predpoved pocasia na vhodny termin natierania terasy.

Terasu v **Zedlitzdorf (Gnesau, Feldkirchen, Kärnten, Rakúsko)** je vhodné natrieť iba ak nastane
súvislé suché okno: **24 h bez dažďa pred štartom**, **6 h maľovania**, **12 h bez dažďa po
maľovaní (schnutie)**. Projekt denne porovnáva predpoveď z piatich meteorologických modelov
(ICON, GFS, ECMWF, GEM, Météo-France cez [Open-Meteo](https://open-meteo.com/), bez API kľúča)
a keď nájde takéto okno na najbližší víkend, pošle e-mailový alert cez [Resend](https://resend.com/).

## Ako to funguje

- `src/openMeteo.ts` – stiahne hodinovú predpoveď zrážok pre 5 modelov naraz.
- `src/analyze.ts` – čistá funkcia, ktorá pre kandidátske štarty (piatok/sobota/nedeľa 08:00) overí,
  či je celé 42-hodinové okno suché vo všetkých modeloch naraz (konzervatívny prienik).
- `src/dashboard.ts` – vygeneruje `docs/index.html`: jednoduchý prehľad (odznak + jedna veta)
  pre každý kandidátsky víkend, so skrytou sekciou "Viac info" s grafom zrážok (pás = rozptyl
  5 modelov, čiara = medián) po 3-hodinových úsekoch. Sekcia "Dážď" ukazuje rovnaký typ grafu
  za posledné/najbližšie dni (s vyznačeným "teraz") pre rýchly odhad, ako rýchlo uschnú
  borovicové dosky.
- `src/email.ts` – zostaví a odošle e-mail cez Resend API s porovnaním modelov.
- `src/state.ts` – `state.json` v repozitári zabraňuje opakovanému alertu pre ten istý víkend.
- `src/index.ts` – orchestrácia celého behu; spúšťa ho `.github/workflows/watchdog.yml` denne
  cez GitHub Actions cron (aj ručne cez `workflow_dispatch`).

## Dashboard

Každý beh vygeneruje `docs/index.html` – jednoduchý prehľad stavu (vhodné/nevhodné + jedna veta
vysvetlenia) pre najbližšie kandidátske víkendy, s grafom zrážok schovaným v sekcii "Viac info".
Lokálne si ho vieš pozrieť cez `open docs/index.html` po `npm run dev`.

Na GitHub ho sprístupníš cez **Settings → Pages → Source: Deploy from a branch → Branch: `main`,
folder `/docs`** – dostaneš stálu URL (`https://sb8691.github.io/ztlzdrf/`), ktorá sa aktualizuje
pri každom behu workflow.

## Lokálne spustenie

```bash
npm install
cp .env.example .env   # doplň RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM
npm test                # unit testy analyze.ts
SEND_EMAIL=false npm run dev   # vypíše výsledok do konzoly bez odoslania e-mailu
```

## Nasadenie na GitHub Actions

V nastaveniach repozitára (Settings → Secrets and variables → Actions) treba pridať:

- `RESEND_API_KEY` – API kľúč z [resend.com](https://resend.com/)
- `ALERT_EMAIL_TO` – e-mail, na ktorý má prísť alert
- `ALERT_EMAIL_FROM` – odosielajúca adresa overená v Resend

Workflow beží denne (cron) a dá sa spustiť aj ručne cez záložku *Actions → Terrace Painting
Watchdog → Run workflow*.
