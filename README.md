# ztlzdrf

Predpoved pocasia na vhodny termin natierania terasy.

Terasu v **Zedlitzdorf (Gnesau, Feldkirchen, Kärnten, Rakúsko)** je vhodné natrieť iba ak nastane
súvislé suché okno: **24 h bez dažďa pred štartom**, **12 h maľovania**, **24 h bez dažďa po
maľovaní (schnutie)**. Projekt denne porovnáva predpoveď z piatich meteorologických modelov
(ICON, GFS, ECMWF, GEM, Météo-France cez [Open-Meteo](https://open-meteo.com/), bez API kľúča)
a keď nájde takéto okno na najbližší víkend, pošle e-mailový alert cez [Resend](https://resend.com/).

## Ako to funguje

- `src/openMeteo.ts` – stiahne hodinovú predpoveď zrážok pre 5 modelov naraz.
- `src/analyze.ts` – čistá funkcia, ktorá pre kandidátske štarty (sobota/nedeľa 08:00) overí,
  či je celé 60-hodinové okno suché vo všetkých modeloch naraz (konzervatívny prienik).
- `src/email.ts` – zostaví a odošle e-mail cez Resend API s porovnaním modelov.
- `src/state.ts` – `state.json` v repozitári zabraňuje opakovanému alertu pre ten istý víkend.
- `src/index.ts` – orchestrácia celého behu; spúšťa ho `.github/workflows/watchdog.yml` denne
  cez GitHub Actions cron (aj ručne cez `workflow_dispatch`).

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
