## Krok 8 – snehová pokrývka: modelová výška snehu proti nameranej

Pravda: nameraná výška snehu ráno (06 UTC) – ručné stanice (eHYD do 8/2023, GeoSphere), automaty GeoSphere, LWD; SNOWGRID vynechaný. Model: Historical Forecast `snow_depth` o 06 UTC, predstih 0, mesiace nov–apr. Udalosť: stanica ≥ 30 cm (podmienka pokrývky z kroku 1). „det.“ = model ≥ 30 cm ako áno/nie; „kal.“ = logistická krivka na √(model cm), fit bez testovanej sezóny. BSS proti klimatológii radu a mesiaca z jeho dlhého záznamu od 1998/99 bez testovanej sezóny; krátke rady (automaty, LWD) ju berú z dlhého ručného radu na tom istom mieste alebo z blízkej stanice. CI blokový bootstrap po 60-dňových blokoch (pokrývka trvá týždne). Sezóna s menej ako 30 dňami dvojíc sa vynecháva.

### ICON-D2 2,2 km

Dvojíc 6971, sezóny 2022/23, 2023/24, 2024/25, 2025/26, 17 radov na 15 miestach, podiel dní so stanicou ≥ 30 cm 0,30.

| Prah stanice | n | udalostí | klim. | **BSS det.** (model ≥ prah) (CI) | POD / FAR det. | **BSS kal.** (CI) | AUC | spoľahlivosť kal. |
|---|---|---|---|---|---|---|---|---|
| ≥ 20 cm | 6971 | 2874 | 0,39 | **0,13 (-0,07–0,30)** | 0,89 / 0,14 | **0,33 (0,17–0,47)** | 0,96 | 0,01→0,02 (2561), 0,09→0,05 (441), 0,21→0,19 (503), 0,40→0,40 (568), 0,60→0,61 (535), 0,81→0,83 (960), 0,97→0,97 (1403) |
| ≥ 30 cm | 6971 | 2076 | 0,29 | **0,02 (-0,18–0,20)** | 0,81 / 0,19 | **0,31 (0,17–0,43)** | 0,95 | 0,01→0,01 (3061), 0,09→0,06 (670), 0,22→0,15 (624), 0,40→0,45 (649), 0,60→0,57 (560), 0,81→0,84 (683), 0,96→0,99 (724) |
| ≥ 50 cm | 6971 | 1029 | 0,18 | **-0,02 (-0,34–0,19)** | 0,68 / 0,22 | **0,29 (0,06–0,44)** | 0,95 | 0,01→0,01 (4147), 0,09→0,04 (951), 0,21→0,13 (600), 0,39→0,50 (432), 0,60→0,61 (346), 0,81→0,90 (371), 0,93→1,00 (124) |

Podiel dní so stanicou ≥ 30 cm podľa modelovej výšky snehu (všetky stanice / len > 1 700 m / 1 200–1 700 m / údolie):

| Model [cm] | n | P(stanica ≥ 30) | n > 1 700 m | P | n 1 200–1 700 | P | n údolie | P | medián stanice [cm] |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 2227 | 0,01 | 137 | 0,11 | 603 | 0,01 | 1487 | 0,00 | 0 |
| 1–10 | 887 | 0,03 | 90 | 0,17 | 327 | 0,03 | 470 | 0,00 | 3 |
| 11–20 | 980 | 0,08 | 99 | 0,22 | 663 | 0,08 | 218 | 0,02 | 12 |
| 21–30 | 872 | 0,35 | 191 | 0,52 | 561 | 0,33 | 120 | 0,19 | 26 |
| 31–50 | 1147 | 0,70 | 253 | 0,88 | 777 | 0,64 | 117 | 0,72 | 39 |
| 51–100 | 852 | 0,98 | 465 | 0,99 | 385 | 0,96 | 2 | 1,00 | 66 |
| > 100 | 6 | 1,00 | 6 | 1,00 | 0 | – | 0 | – | 110 |

| Rad | výška | n | sezóny | podiel ≥ 30 | klim. | bias model − stanica [cm] | MAE [cm] | BSS kal. | AUC kal. |
|---|---|---|---|---|---|---|---|---|---|
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 2140 | 711 | 4 | 0,76 | 0,65 | -27,8 | 29,0 | -0,28 | 0,95 |
| LWD Falkert (1886 m), ΔHS automat | 1886 | 181 | 1 | 0,52 | 0,56 | -0,1 | 5,5 | 0,49 | 0,96 |
| LWD Turracherhoehe (1795 m), ΔHS automat | 1795 | 181 | 1 | 0,60 | 0,56 | -2,6 | 5,9 | 0,22 | 0,99 |
| eHYD Turracher Höhe (1777 m), ručne | 1777 | 168 | 1 | 0,57 | 0,60 | 8,4 | 12,5 | 0,24 | 0,89 |
| GeoSphere Katschberg (1635 m), ΔHS automat | 1635 | 693 | 4 | 0,28 | 0,36 | 6,5 | 8,0 | 0,41 | 0,95 |
| GeoSphere Kanzelhöhe (1520 m), ručne | 1520 | 711 | 4 | 0,41 | 0,37 | 2,0 | 8,3 | 0,24 | 0,91 |
| GeoSphere Kanzelhöhe (1520 m), ΔHS automat | 1520 | 709 | 4 | 0,39 | 0,36 | 3,3 | 7,6 | 0,27 | 0,93 |
| GeoSphere Flattnitz (1437 m), ručne | 1437 | 500 | 3 | 0,30 | 0,31 | 2,4 | 8,2 | 0,42 | 0,91 |
| GeoSphere Flattnitz (1437 m), ΔHS automat | 1437 | 703 | 4 | 0,30 | 0,30 | -1,6 | 7,9 | 0,36 | 0,89 |
| eHYD Dreifaltigkeit (1096 m), ručne | 1096 | 168 | 1 | 0,12 | 0,10 | 0,9 | 2,9 | 0,65 | 0,99 |
| eHYD Thomatal (1071 m), ručne | 1071 | 168 | 1 | 0,19 | 0,14 | -2,4 | 3,3 | 0,51 | 1,00 |
| eHYD Hochegg (1026 m), ručne | 1026 | 168 | 1 | 0,10 | 0,07 | 4,7 | 5,3 | 0,49 | 0,98 |
| eHYD Maitratten-Sonnleiten (976 m), ručne | 976 | 168 | 1 | 0,15 | 0,07 | 0,2 | 3,7 | 0,62 | 0,99 |
| eHYD Kendlbruck (940 m), ručne | 940 | 168 | 1 | 0,05 | 0,02 | 1,0 | 3,4 | 0,16 | 0,95 |
| GeoSphere Arriach (890 m), ΔHS automat | 890 | 700 | 4 | 0,01 | 0,07 | 0,9 | 1,3 | 0,54 | 1,00 |
| eHYD Sirnitz (823 m), ručne | 823 | 168 | 1 | 0,02 | 0,04 | 1,7 | 2,3 | – | 0,92 |
| GeoSphere Weitensfeld (704 m), ΔHS automat | 704 | 706 | 4 | 0,00 | 0,04 | 0,4 | 0,6 | – | – |

| Pásmo | n | bias [cm] | MAE [cm] | podiel ≥ 30 stanica / model |
|---|---|---|---|---|
| > 1 700 m | 1241 | -15,2 | 19,9 | 0,68 / 0,60 |
| údolie < 1 200 m | 2414 | 0,8 | 2,0 | 0,05 / 0,05 |
| 1 200–1 700 m | 3316 | 2,5 | 8,0 | 0,34 / 0,36 |

Krivka na všetkých sezónach: a = -6.727, b = 1.219 na √cm; P(≥ 30 cm) pri modeli 0 / 10 / 20 / 30 / 50 cm = 0,00 / 0,05 / 0,22 / 0,49 / 0,87; P = 0,5 pri 30,5 cm modelu. Fity bez sezón: (-6.80, 1.20), (-6.34, 1.15), (-6.68, 1.24), (-7.09, 1.28).

### IFS 9 km

Dvojíc 1609, sezóny 2025/26 (vynechané pre málo dní: 2024/25 (7 dní)), 9 radov na 8 miestach, podiel dní so stanicou ≥ 30 cm 0,34.
Len jedna zima: krivka sa nedá overiť mimo vzorky, „kal.“ je fit na tých istých dňoch (optimistické).

| Prah stanice | n | udalostí | klim. | **BSS det.** (model ≥ prah) (CI) | POD / FAR det. | **BSS kal.** (CI) | AUC | spoľahlivosť kal. |
|---|---|---|---|---|---|---|---|---|
| ≥ 20 cm | 1609 | 795 | 0,46 | **-1,70 (-3,84–-1,13)** | 0,50 / 0,04 | **-0,67 (-1,23–-0,43)** (v rámci vzorky) | 0,84 | 0,17→0,19 (598), 0,41→0,41 (293), 0,59→0,51 (241), 0,80→0,78 (171), 0,96→1,00 (306) |
| ≥ 30 cm | 1609 | 551 | 0,36 | **-1,09 (-1,79–-0,78)** | 0,49 / 0,18 | **-0,50 (-0,68–-0,38)** (v rámci vzorky) | 0,82 | 0,10→0,08 (538), 0,22→0,30 (393), 0,37→0,28 (275), 0,59→0,63 (118), 0,78→0,74 (176), 0,95→1,00 (109) |
| ≥ 50 cm | 1609 | 299 | 0,22 | **-0,70 (-0,95–-0,66)** | 0,47 / 0,32 | **-0,24 (-0,36–-0,09)** (v rámci vzorky) | 0,81 | 0,04→0,04 (538), 0,10→0,11 (549), 0,21→0,19 (195), 0,41→0,26 (172), 0,58→0,52 (52), 0,80→1,00 (103) |

Podiel dní so stanicou ≥ 30 cm podľa modelovej výšky snehu (všetky stanice / len > 1 700 m / 1 200–1 700 m / údolie):

| Model [cm] | n | P(stanica ≥ 30) | n > 1 700 m | P | n 1 200–1 700 | P | n údolie | P | medián stanice [cm] |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 538 | 0,08 | 92 | 0,34 | 238 | 0,05 | 208 | 0,00 | 0 |
| 1–10 | 504 | 0,29 | 97 | 0,45 | 280 | 0,37 | 127 | 0,00 | 16 |
| 11–20 | 164 | 0,29 | 47 | 0,55 | 100 | 0,22 | 17 | 0,00 | 20 |
| 21–30 | 76 | 0,59 | 44 | 0,52 | 32 | 0,69 | 0 | – | 32 |
| 31–50 | 134 | 0,65 | 84 | 0,45 | 50 | 0,98 | 0 | – | 35 |
| 51–100 | 106 | 0,90 | 92 | 0,88 | 14 | 1,00 | 0 | – | 49.3 |
| > 100 | 87 | 1,00 | 87 | 1,00 | 0 | – | 0 | – | 69 |

| Rad | výška | n | sezóny | podiel ≥ 30 | klim. | bias model − stanica [cm] | MAE [cm] | BSS kal. | AUC kal. |
|---|---|---|---|---|---|---|---|---|---|
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 2140 | 181 | 1 | 0,70 | 0,64 | -43,4 | 43,4 | -2,11 | 0,80 |
| LWD Falkert (1886 m), ΔHS automat | 1886 | 181 | 1 | 0,52 | 0,56 | 18,0 | 21,4 | 0,03 | 0,93 |
| LWD Turracherhoehe (1795 m), ΔHS automat | 1795 | 181 | 1 | 0,60 | 0,56 | 22,9 | 23,7 | -0,27 | 0,98 |
| GeoSphere Katschberg (1635 m), ΔHS automat | 1635 | 171 | 1 | 0,24 | 0,36 | 1,5 | 2,8 | 0,07 | 1,00 |
| GeoSphere Kanzelhöhe (1520 m), ručne | 1520 | 181 | 1 | 0,30 | 0,36 | -20,0 | 20,1 | -0,56 | 0,82 |
| GeoSphere Kanzelhöhe (1520 m), ΔHS automat | 1520 | 181 | 1 | 0,29 | 0,36 | -18,7 | 18,8 | -0,66 | 0,76 |
| GeoSphere Flattnitz (1437 m), ΔHS automat | 1437 | 181 | 1 | 0,40 | 0,29 | -14,0 | 14,2 | 0,03 | 0,80 |
| GeoSphere Arriach (890 m), ΔHS automat | 890 | 171 | 1 | 0,00 | 0,07 | 0,7 | 1,5 | – | – |
| GeoSphere Weitensfeld (704 m), ΔHS automat | 704 | 181 | 1 | 0,00 | 0,04 | 0,5 | 0,6 | – | – |

| Pásmo | n | bias [cm] | MAE [cm] | podiel ≥ 30 stanica / model |
|---|---|---|---|---|
| > 1 700 m | 543 | -0,8 | 29,5 | 0,61 / 0,49 |
| 1 200–1 700 m | 714 | -13,0 | 14,1 | 0,31 / 0,09 |
| údolie < 1 200 m | 352 | 0,6 | 1,1 | 0,00 / 0,00 |

Krivka na všetkých sezónach: a = -2.209, b = 0.483 na √cm; P(≥ 30 cm) pri modeli 0 / 10 / 20 / 30 / 50 cm = 0,10 / 0,34 / 0,49 / 0,61 / 0,77; P = 0,5 pri 20,9 cm modelu. Fity bez sezón: (-2.21, 0.48).

### ICON-D2 proti IFS 9 km na spoločných dňoch

Dvojíc 1609: IFS − ICON-D2 bias -5,7 cm, MAE 16,3 cm, zhoda áno/nie na 30 cm 0,80.

