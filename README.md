# ztlzdrf

Rozhodovacia pomôcka pre maľovanie/moridlovanie drevenej terasy na **Zedlitzdorf 74 (Gnesau,
Feldkirchen, Kärnten, Rakúsko)**: nie je to všeobecný predpovedný dashboard, ale odpoveď na otázku
*„oplatí sa ísť natierať terasu a kedy presne"*.

Všetko sa točí okolo jedného okna **1.–5. 10. 2026** a jednej otázky: *ktorú hodinu si vybrať na
8 h práce*. Sú to dva výstupy z tej istej snímky dát, oba z jedného GitHub Actions workflowu:

1. **Stránka** (`docs/index.html`) – jediná obrazovka s piatimi grafmi nad spoločnou časovou osou.
2. **Denný e-mail** cez [Resend](https://resend.com/) – tabuľka piatich dní a jeden obrázok,
   presne tie isté čísla ako na stránke.

## Stránka: okno na natieranie

`docs/index.html` je celá aplikácia v jednom súbore: nesie snímku dát ako JSON aj kód, ktorý tie
dáta vypočítal a nakreslí. Preto tlačidlo **Obnoviť predpoveď** dokáže na statickom GitHub Pages
skutočne stiahnuť čerstvú predpoveď – priamo z prehliadača, lebo žiadny server tu nie je.

- `src/window-core.js` – **celý výpočet**, čisté ESM JavaScript bez závislostí. Beží v Node
  (generátor aj testy) a **doslova ten istý súbor** sa vkladá do stránky, takže algoritmus existuje
  len raz a obnova v prehliadači nemôže dať iné číslo než generátor.
- `src/window-ui.js` – päť SVG grafov, výber začiatku, spoločný kurzor a tooltip, obnova dát.
- `src/window-page.ts` – poskladá HTML: shell, štýly, snímka a vložený klientsky kód (`export` sa
  pri vkladaní odstráni, lebo vložený modul nemá komu exportovať).
- `src/window-data.ts` – sťahovanie a snímka v `docs/data/window.json`.
- `src/window-theme.ts` – **jediná paleta** pre stránku, e-mail aj obrázok. Tri média nevedia
  zdieľať štýly (stránka má CSS premenné a sama prepína na tmavý motív, e-mail musí mať každú farbu
  inline, PNG nemá CSS vôbec), takže farby žijú na jednom mieste, aby sa vzhľad nerozišiel.
- `src/outlook.ts` – beh generátora (`npm run window`, v CI `node dist/outlook.js`). **Meno súboru
  je historické**: workflow volá `dist/outlook.js` a premenovanie by ho rozbilo.

### Čo stránka ukazuje

Päť grafov nad jednou časovou osou 1. 10. 00:00 – 6. 10. 00:00 (Europe/Vienna): vhodnosť počasia
pri začiatku náteru (%), dážď (mm / 6 h), teplota a rosný bod (°C) s hranicou 7 °C, vietor (km/h) a
sila slnka (W/m²). Modrý pás je zvolená dĺžka práce, oranžový nasledujúcich 24 h sledovania; výber
dňa, hodiny a dĺžky posúva pásy vo všetkých grafoch naraz, ale **nikdy nemení rozsah osí ani mierku
zrážok** – päť dní musí ostať porovnateľných.

Snímka nesie skóre pre **každú povolenú dĺžku** seansy, nie surových členov ansámblu – preto sa dá
prepnúť z 8 h na 3 h bez nového sťahovania, a stránka pritom ostáva malá.

### Jedna vrstva nemusí byť naraz

Vrstva je 8 hodín práce, ale pokojne 3 hodiny jeden deň a 5 hodín iný. Preto sa na stránke vyberá
**dĺžka práce** (1–11 h) a každá takáto seansa sa hodnotí samostatne – nesie si vlastných 24 h
sledovania, lebo to, čo bolo práve natreté, ich potrebuje. Koľko hodín ešte chýba do ôsmich, si
stráži človek; aplikácia to nepočíta a nerobí plán za neho.

Natiera sa len **8:00–19:00** (`workDayStartHour` / `workDayEndHour`), takže sa ponúkajú iba
začiatky, pri ktorých sa zvolená dĺžka do pracovného času zmestí: pri 8 h sú to 8:00–11:00, pri 3 h
8:00–16:00. Hodina mimo pracovného času nie je „zlé počasie" ani „nedostatok dát" – jednoducho nie
je možnosťou a graf ju neukazuje.

### Percento vhodnosti

Priehľadný filter meteorologických scenárov, **nie model schnutia dreva**. Pre každý ponúkaný
začiatok prejde každý člen ansámblu tým istým testom (`PAINT_WINDOW` v `src/config.ts`):

- teplota vzduchu aspoň **7 °C** vo všetkých hodinových bodoch práce vrátane oboch hraníc (pri 8 h
  je to 9 bodov, pri 3 h štyri),
- súčet zrážok **< 0,2 mm** za celý čas práce aj nasledujúcich 24 h, čo je `dĺžka + 24` hodinových
  značiek od `začiatok+1 h` (hodinové úhrny Open-Meteo sú za *predchádzajúcu* hodinu).

`score = 100 × vyhovujúci / očakávaný počet členov`. Menovateľ je **očakávaná zostava produktu**
(51 členov ECMWF IFS ENS: control + `member01…member50`), nie počet stĺpcov, ktoré náhodou prišli.
Ak chýba čo i len jedna potrebná hodnota, hodina je **„Nedostatok dát"** – nikdy nie 0 %, 100 % ani
potichu zmenšený menovateľ. Hranica 0,2 mm je pracovná tolerancia algoritmu, nie potvrdenie, že taký
dážď náteru neuškodí; teplota sa kontroluje len počas nanášania.

Zmena na 48 h sledovania je zmena jedného čísla v `PAINT_WINDOW.postApplicationHours` – rozsah
sťahovaných dní sa dopočíta sám (žiadna seansa nesmie skončiť po 19:00, takže pri 24 h sledovania
musia dáta siahať do 6. 10. 19:00).

### Dáta

- Grafy: `https://api.open-meteo.com/v1/forecast`, model `ecmwf_ifs025`, hodinovo
  `temperature_2m, relative_humidity_2m, dew_point_2m, precipitation, wind_speed_10m,
  shortwave_radiation`. Jednotky sa overujú v odpovedi.
- Percentá: `https://ensemble-api.open-meteo.com/v1/ensemble`, ten istý model, jednotliví členovia
  pre `temperature_2m` a `precipitation`. Členovia sa objavujú z odpovede vzorom, nie z pevného
  zoznamu názvov.
- Čas vydania behu modelu sa berie **len** z `.../data/{domain}/static/meta.json` a zobrazí sa iba
  vtedy, keď ho zdroj naozaj potvrdí – nikdy sa nezamieňa s časom načítania.
- `timeformat=unixtime`: vnútri sú výhradne epoch ms, miestny čas je len na popisky. Žiadne natvrdo
  pripočítané dve hodiny.
- Mriežkový bod ECMWF 0,25° je 46,75/14,0 (1055 m), teda ~8 km od domu – vlastnosť modelu, uvedená
  v metadátach snímky.
- `_2m` je predpoveď 2 m nad zemou, `wind_speed_10m` vietor v 10 m – nie meranie na terase.
  Hodinový výstup neznamená hodinové natívne rozlíšenie; vzdialenejšia predpoveď je interpolovaná.

`docs/data/window.json` je posledná platná snímka. Keď sťahovanie zlyhá, beh publikuje ju
(označenú časom, kedy bola naozaj stiahnutá) namiesto prázdnej stránky; cache sa nikdy netvári ako
nový beh modelu.

## Denný e-mail

- `src/index.ts` – denný beh. **Nesťahuje nič**: prečíta `docs/data/window.json`, ktorý zapísal
  generátor stránky o pár minút skôr, vykreslí obrázok a pošle e-mail. Bez snímky sa e-mail
  neposiela – nikdy sa nevymyslí. Po skončení okna sa beh sám stíši.
- `src/window-email.ts` – tabuľka piatich dní: deň · najlepší začiatok · % scenárov (a „x z 51") ·
  denný úhrn dažďa. Deň bez vypočítateľného začiatku je „nedostatok dát", nie nula.
- `src/window-image.ts` – obrázok `docs/chart.png`: vhodnosť a dážď za celé okno, kreslené tvarmi
  (rasterizér v CI nemá emoji font). Gmail odmieta inline SVG aj `data:` URI, takže obrázok musí
  byť skutočne hosťovaný; meno súboru zostalo, lebo workflow čaká práve naň, kým ho Pages začnú
  servovať.
- `src/email.ts` – rám e-mailu a predmet s najlepším štartom, aby sa okno dalo posúdiť rovno zo
  zoznamu správ.
- `src/email-gate.ts` – **ktorý beh pošle dnešný e-mail.** Každý plánovaný beh smie; pošle ho prvý
  beh viedenského dňa od 02:00, ktorý nenájde záznam `docs/data/email-sent.json` s dnešným
  dátumom. Záznam sa zapíše až po úspešnom odoslaní a obsahuje len dátum, čas, druh spustenia a
  číslo behu (je verejný). E-mail poslaný medzi polnocou a 02:00 sa počíta k predošlému dňu, takže
  neskorý ručný test nezruší ranný e-mail. Každá pochybnosť – chýbajúci či poškodený záznam, chyba API – vedie k odoslaniu:
  najhoršie, čo sa môže stať, je druhý e-mail, nikdy žiadny. `src/should-send-email.ts` je len
  jeho obal pre krok `gate` vo workflowe.

## Odložená vrstva

Pôvodné denné rozhodnutie z GeoSphere (`src/geosphere.ts`, `src/painting.ts`, `src/astronomy.ts`,
`src/dashboard.ts`), podrobný dashboard aj strednodobý výhľad (`src/outlook-core.ts`,
`src/outlook-plain.ts`, `src/outlook-dashboard.ts`, `docs/outlook/history.json`) **už nebežia**:
`docs/outlook.html` ani `docs/outlook.png` sa negenerujú, GeoSphere sa nesťahuje a premenné
`WOOD_MOISTURE_PCT` / `WOOD_MOISTURE_MEASURED_AT` už nikam nevstupujú. Kód aj jeho testy zostali v
repozitári nedotknuté, ale nič ich nevolá a z navigácie sa k nim nedá dostať. `src/charts.ts` ostáva
živý – kreslí z neho obrázok do e-mailu.

## Lokálne spustenie

```bash
npm install
cp .env.example .env   # doplň RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM
npm run window                 # stiahne predpoveď -> docs/data/window.json + docs/index.html
open docs/index.html
SEND_EMAIL=false npm run dev   # z tej istej snímky vyrobí docs/chart.png, e-mail neodošle
npm test
```

Ladenie vzhľadu bez siete a bez dotyku `docs/` (rovnaká štruktúra `data/window.json`):

```bash
mkdir -p /cesta/scratch/data && cp docs/data/window.json /cesta/scratch/data/
OUTLOOK_DOCS_DIR=/cesta/scratch WINDOW_RENDER_ONLY=true npm run window
```

Náhľad presne toho HTML, ktoré by odišlo e-mailom (obrázok sa ťahá z Pages, takže ukazuje stav
posledného publikovaného behu):

```bash
EMAIL_PREVIEW_PATH=/cesta/scratch/mail.html SEND_EMAIL=false npm run dev
```

## Nasadenie na GitHub Actions

Stránka sa publikuje cez **Settings → Pages → Source: Deploy from a branch → Branch: `main`,
folder `/docs`** na `https://sb8691.github.io/ztlzdrf/`.

V nastaveniach repozitára (Settings → Secrets and variables → Actions) treba pridať:

- `RESEND_API_KEY` – API kľúč z [resend.com](https://resend.com/)
- `ALERT_EMAIL_TO` – e-mail, na ktorý má prísť alert
- `ALERT_EMAIL_FROM` – odosielajúca adresa overená v Resend

Workflow `.github/workflows/watchdog.yml` sa budí trikrát denne: o 00:13 UTC (02:13 letného času;
v zime 01:13 UTC), o 11:13 a o 23:13 UTC – posledné dva zachytia 00z a 12z beh ECMWF. Každý beh
obnoví stránku; **e-mail pošle prvý plánovaný beh dňa od 02:00 viedenského času**, ktorý ešte
nenájde záznam o dnešnom e-maile (`src/email-gate.ts`). GitHub spúšťa plánované behy s meškaním
(merané 28. 8. – 22. 9. 2026: medián 5,3 h, najviac 12,2 h) a občas niektorý vynechá, preto e-mail
v praxi chodí zhruba medzi 04:30 a 09:00 a vynechaný beh nahradí ďalší.

Ručne sa dá spustiť cez *Actions → Terrace Painting Watchdog → Run workflow*. Voľba „Send the
e-mail now“ je predvolene vypnutá; keď ju zaškrtneš, e-mail odíde hneď a **počíta sa ako dnešný**,
takže plánované behy v ten deň už ďalší nepošlú.

## Poznámka na záver

Predpoveď nepotvrdí vlhkosť ani teplotu dreva – tie treba pred natieraním zmerať. Čistenie a
brúsenie prebehlo 5. 9. 2026, odvetrávalo sa odvtedy rôzne; z dátumu prípravy sa dnešná vlhkosť
dreva odvodiť nedá. Nasledujúcich 24 h po dokončení je **sledované obdobie, nie záruka vyschnutia**.
