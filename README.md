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
