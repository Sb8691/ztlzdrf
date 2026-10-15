## Krok 8 – snehová pokrývka: modelová výška snehu proti nameranej

Pravda: nameraná výška snehu ráno (06 UTC) – ručné stanice (eHYD do 8/2023, GeoSphere), automaty GeoSphere, LWD; SNOWGRID vynechaný. Model: Historical Forecast `snow_depth` o 06 UTC, predstih 0, mesiace nov–apr. Udalosť: stanica ≥ 30 cm (podmienka pokrývky z kroku 1). „det.“ = model ≥ 30 cm ako áno/nie; „kal.“ = logistická krivka na √(model cm), fit bez testovanej sezóny; BSS proti klimatológii stanice a mesiaca z ostatných sezón; CI blokový bootstrap po dňoch.

### ICON-D2 2,2 km

Dvojíc 6971, sezóny 2022/23, 2023/24, 2024/25, 2025/26, staníc 17, podiel dní so stanicou ≥ 30 cm 0,30.

| Prah stanice | n | udalostí | klim. | **BSS det.** (model ≥ prah) (CI) | POD / FAR det. | **BSS kal.** (CI) | AUC | spoľahlivosť kal. |
|---|---|---|---|---|---|---|---|---|
| ≥ 20 cm | 6971 | 2874 | 0,37 | **0,34 (0,18–0,48)** | 0,89 / 0,14 | **0,50 (0,39–0,58)** | 0,96 | 0,01→0,02 (2561), 0,09→0,05 (441), 0,21→0,19 (503), 0,40→0,40 (568), 0,60→0,61 (535), 0,81→0,83 (960), 0,97→0,97 (1403) |
| ≥ 30 cm | 6971 | 2076 | 0,28 | **0,25 (0,08–0,37)** | 0,81 / 0,19 | **0,46 (0,36–0,55)** | 0,95 | 0,01→0,01 (3061), 0,09→0,06 (670), 0,22→0,15 (624), 0,40→0,45 (649), 0,60→0,57 (560), 0,81→0,84 (683), 0,96→0,99 (724) |
| ≥ 50 cm | 6971 | 1029 | 0,16 | **0,16 (-0,08–0,33)** | 0,68 / 0,22 | **0,42 (0,27–0,52)** | 0,95 | 0,01→0,01 (4147), 0,09→0,04 (951), 0,21→0,13 (600), 0,39→0,50 (432), 0,60→0,61 (346), 0,81→0,90 (371), 0,93→1,00 (124) |

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

| Stanica | výška | n | sezóny | podiel ≥ 30 | bias model − stanica [cm] | MAE [cm] | BSS kal. | AUC |
|---|---|---|---|---|---|---|---|---|
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 2140 | 711 | 4 | 0,76 | -27,8 | 29,0 | -0,13 | 0,95 |
| LWD Falkert (1886 m), ΔHS automat | 1886 | 181 | 1 | 0,52 | -0,1 | 5,5 | 0,78 | 0,96 |
| LWD Turracherhoehe (1795 m), ΔHS automat | 1795 | 181 | 1 | 0,60 | -2,6 | 5,9 | 0,88 | 0,99 |
| eHYD Turracher Höhe (1777 m), ručne | 1777 | 168 | 1 | 0,57 | 8,4 | 12,5 | 0,64 | 0,89 |
| GeoSphere Katschberg (1635 m), ΔHS automat | 1635 | 693 | 4 | 0,28 | 6,5 | 8,0 | 0,54 | 0,95 |
| GeoSphere Kanzelhöhe (1520 m), ručne | 1520 | 711 | 4 | 0,41 | 2,0 | 8,3 | 0,24 | 0,92 |
| GeoSphere Kanzelhöhe (1520 m), ΔHS automat | 1520 | 709 | 4 | 0,39 | 3,3 | 7,6 | 0,30 | 0,93 |
| GeoSphere Flattnitz (1437 m), ručne | 1437 | 500 | 3 | 0,30 | 2,4 | 8,2 | 0,51 | 0,93 |
| GeoSphere Flattnitz (1437 m), ΔHS automat | 1437 | 703 | 4 | 0,30 | -1,6 | 7,9 | 0,48 | 0,91 |
| eHYD Dreifaltigkeit (1096 m), ručne | 1096 | 168 | 1 | 0,12 | 0,9 | 2,9 | 0,77 | 0,99 |
| eHYD Thomatal (1071 m), ručne | 1071 | 168 | 1 | 0,19 | -2,4 | 3,3 | 0,97 | 1,00 |
| eHYD Hochegg (1026 m), ručne | 1026 | 168 | 1 | 0,10 | 4,7 | 5,3 | 0,68 | 0,98 |
| eHYD Maitratten-Sonnleiten (976 m), ručne | 976 | 168 | 1 | 0,15 | 0,2 | 3,7 | 0,72 | 0,99 |
| eHYD Kendlbruck (940 m), ručne | 940 | 168 | 1 | 0,05 | 1,0 | 3,4 | 0,53 | 0,95 |
| GeoSphere Arriach (890 m), ΔHS automat | 890 | 700 | 4 | 0,01 | 0,9 | 1,3 | 0,08 | 1,00 |
| eHYD Sirnitz (823 m), ručne | 823 | 168 | 1 | 0,02 | 1,7 | 2,3 | 0,69 | 0,92 |
| GeoSphere Weitensfeld (704 m), ΔHS automat | 704 | 706 | 4 | 0,00 | 0,4 | 0,6 | – | – |

| Pásmo | n | bias [cm] | MAE [cm] | podiel ≥ 30 stanica / model |
|---|---|---|---|---|
| > 1 700 m | 1241 | -15,2 | 19,9 | 0,68 / 0,60 |
| údolie < 1 200 m | 2414 | 0,8 | 2,0 | 0,05 / 0,05 |
| 1 200–1 700 m | 3316 | 2,5 | 8,0 | 0,34 / 0,36 |

Krivka na všetkých sezónach: a = -6.727, b = 1.219 na √cm; P(≥ 30 cm) pri modeli 0 / 10 / 20 / 30 / 50 cm = 0,00 / 0,05 / 0,22 / 0,49 / 0,87; P = 0,5 pri 30,5 cm modelu. Fity bez sezón: (-6.80, 1.20), (-6.34, 1.15), (-6.68, 1.24), (-7.09, 1.28).

### IFS 9 km

Dvojíc 1665, sezóny 2024/25, 2025/26, staníc 10, podiel dní so stanicou ≥ 30 cm 0,34.

| Prah stanice | n | udalostí | klim. | **BSS det.** (model ≥ prah) (CI) | POD / FAR det. | **BSS kal.** (CI) | AUC | spoľahlivosť kal. |
|---|---|---|---|---|---|---|---|---|
| ≥ 20 cm | 1665 | 819 | 0,43 | **0,20 (-0,01–0,40)** | 0,49 / 0,05 | **0,30 (0,22–0,37)** | 0,83 | 0,42→0,44 (1458), 0,55→0,90 (191) |
| ≥ 30 cm | 1665 | 570 | 0,35 | **0,28 (0,12–0,43)** | 0,47 / 0,18 | **0,25 (0,15–0,36)** | 0,81 | 0,34→0,34 (1649) |
| ≥ 50 cm | 1665 | 299 | 0,04 | **0,13 (-0,21–0,30)** | 0,47 / 0,32 | **-0,15 (-0,21–-0,08)** | 0,81 | 0,00→0,19 (1613), 0,12→0,00 (39) |

Podiel dní so stanicou ≥ 30 cm podľa modelovej výšky snehu (všetky stanice / len > 1 700 m / 1 200–1 700 m / údolie):

| Model [cm] | n | P(stanica ≥ 30) | n > 1 700 m | P | n 1 200–1 700 | P | n údolie | P | medián stanice [cm] |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 542 | 0,08 | 92 | 0,34 | 238 | 0,05 | 212 | 0,00 | 0 |
| 1–10 | 535 | 0,31 | 103 | 0,49 | 296 | 0,39 | 136 | 0,00 | 16 |
| 11–20 | 181 | 0,27 | 48 | 0,56 | 115 | 0,19 | 18 | 0,00 | 19 |
| 21–30 | 80 | 0,56 | 44 | 0,52 | 36 | 0,61 | 0 | – | 31.2 |
| 31–50 | 134 | 0,65 | 84 | 0,45 | 50 | 0,98 | 0 | – | 35 |
| 51–100 | 106 | 0,90 | 92 | 0,88 | 14 | 1,00 | 0 | – | 49.3 |
| > 100 | 87 | 1,00 | 87 | 1,00 | 0 | – | 0 | – | 69 |

| Stanica | výška | n | sezóny | podiel ≥ 30 | bias model − stanica [cm] | MAE [cm] | BSS kal. | AUC |
|---|---|---|---|---|---|---|---|---|
| GeoSphere Villacher Alpe (ručná) (2140 m), ručne | 2140 | 188 | 2 | 0,71 | -43,0 | 43,0 | -0,00 | 0,81 |
| LWD Falkert (1886 m), ΔHS automat | 1886 | 181 | 1 | 0,52 | 18,0 | 21,4 | 0,69 | 0,93 |
| LWD Turracherhoehe (1795 m), ΔHS automat | 1795 | 181 | 1 | 0,60 | 22,9 | 23,7 | 0,85 | 0,98 |
| GeoSphere Katschberg (1635 m), ΔHS automat | 1635 | 178 | 2 | 0,23 | 1,5 | 2,9 | -0,00 | 1,00 |
| GeoSphere Kanzelhöhe (1520 m), ručne | 1520 | 188 | 2 | 0,32 | -20,1 | 20,2 | 0,01 | 0,83 |
| GeoSphere Kanzelhöhe (1520 m), ΔHS automat | 1520 | 188 | 2 | 0,31 | -18,9 | 18,9 | 0,02 | 0,78 |
| GeoSphere Flattnitz (1437 m), ručne | 1437 | 7 | 1 | 0,00 | 11,0 | 11,0 | – | – |
| GeoSphere Flattnitz (1437 m), ΔHS automat | 1437 | 188 | 2 | 0,39 | -13,2 | 13,9 | -0,01 | 0,79 |
| GeoSphere Arriach (890 m), ΔHS automat | 890 | 178 | 2 | 0,00 | 1,0 | 1,8 | – | – |
| GeoSphere Weitensfeld (704 m), ΔHS automat | 704 | 188 | 2 | 0,00 | 0,5 | 0,6 | – | – |

| Pásmo | n | bias [cm] | MAE [cm] | podiel ≥ 30 stanica / model |
|---|---|---|---|---|
| > 1 700 m | 550 | -1,2 | 29,6 | 0,61 / 0,48 |
| 1 200–1 700 m | 749 | -12,6 | 14,1 | 0,31 / 0,09 |
| údolie < 1 200 m | 366 | 0,7 | 1,2 | 0,00 / 0,00 |

Krivka na všetkých sezónach: a = -2.186, b = 0.476 na √cm; P(≥ 30 cm) pri modeli 0 / 10 / 20 / 30 / 50 cm = 0,10 / 0,34 / 0,49 / 0,60 / 0,77; P = 0,5 pri 21,1 cm modelu. Fity bez sezón: (-2.21, 0.48), (-0.67, 0.00).

### ICON-D2 proti IFS 9 km na spoločných dňoch

Dvojíc 1665: IFS − ICON-D2 bias -5,8 cm, MAE 16,1 cm, zhoda áno/nie na 30 cm 0,81.

