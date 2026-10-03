## Krok 3a – fyzika pri predstihu 0 (Historical Forecast), leave-one-season-out

Vzorka fitu: zimné dni nov–apr s pravdou; ručný nový sneh pri akejkoľvek pokrývke, ΔHS automatov len pri pokrývke ≥ 30 cm. Cieľ fitu: stredná kvadratická chyba √úhrnu. Skóre: predpovede mimo sezóny fitu (LOSO), zlúčené. „MAE sneh“ = dni s pozorovaným alebo surovým modelovým úhrnom ≥ 1 cm. Bias podľa výškového pásma stanice.

### IFS 9 km: 13899 staničných dní, 381 udalostí ≥ 15 cm, sezóny 2016/17–2025/26 (10), 14 staníc

Stanice: eHYD Turracher Höhe (1777 m) 1777 m (1201); eHYD Maitratten-Sonnleiten (976 m) 976 m (1201); eHYD Sirnitz (823 m) 823 m (1201); eHYD Thomatal (1071 m) 1071 m (1201); eHYD Kendlbruck (940 m) 940 m (1201); eHYD Hochegg (1026 m) 1026 m (1201); eHYD Dreifaltigkeit (1096 m) 1096 m (1201); LWD Turracherhoehe (1795 m) 1795 m (108); LWD Falkert (1886 m) 1886 m (95); GeoSphere Villacher Alpe (ručná) (2140 m) 2140 m (1742); GeoSphere Kanzelhöhe (1520 m) 1520 m (1742); GeoSphere Flattnitz (1437 m) 1437.2 m (1605); GeoSphere Katschberg (1635 m) 1635 m (190); GeoSphere Arriach (890 m) 890.2 m (10).

| Variant | parametre (fit na všetkom) | RMSE √cm | MAE [cm] | MAE sneh [cm] | bias [cm] | bias < 1 200 m | bias 1 200–1 700 m | bias 1 700–1 950 m | bias ≥ 1 950 m | AUC@15 | POD@15 | FAR@15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| surový `snowfall` modelu | – | 0,730 | 1,06 | 4,09 | -0,28 | 0,01 | -0,53 | -0,41 | -0,86 | 0,967 | 0,29 | 0,29 |
| dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | – | 0,675 | 0,99 | 3,63 | -0,20 | -0,17 | -0,33 | -0,42 | 0,16 | 0,976 | 0,35 | 0,34 |
| dnešné pravidlo × násobok | scale 0,79 | 0,665 | 1,00 | 3,74 | -0,44 | -0,32 | -0,60 | -0,77 | -0,35 | 0,976 | 0,23 | 0,33 |
| fáza z wet-bulb (rampa), 0,7 cm/mm, násobok | phaseMidC -1,10, phaseHalfWidthC 2,19, scale 1,05 | 0,643 | 0,96 | 3,62 | -0,41 | -0,40 | -0,57 | -0,70 | 0,10 | 0,978 | 0,27 | 0,22 |
| fáza z T (rampa), 0,7 cm/mm | phaseMidC -0,24, phaseHalfWidthC 1,85 | 0,641 | 0,96 | 3,62 | -0,43 | -0,42 | -0,58 | -0,69 | 0,02 | 0,977 | 0,27 | 0,25 |
| fáza modelu + pomer sneh/voda podľa T | slr0 3,00, slrPerDeg 1,00 | 0,686 | 1,03 | 3,98 | -0,45 | -0,36 | -0,74 | -0,52 | -0,19 | 0,969 | 0,23 | 0,25 |
| fáza z T (rampa) + pomer podľa T | phaseMidC -0,21, phaseHalfWidthC 1,84, slr0 6,80, slrPerDeg 0,10 | 0,642 | 0,96 | 3,62 | -0,41 | -0,42 | -0,56 | -0,64 | 0,15 | 0,977 | 0,28 | 0,26 |
| fáza z wet-bulb (rampa) + pomer podľa T | phaseMidC -0,50, phaseHalfWidthC 1,47, slr0 5,63, slrPerDeg 0,28 | 0,642 | 0,96 | 3,63 | -0,41 | -0,40 | -0,59 | -0,68 | 0,16 | 0,977 | 0,27 | 0,24 |
| fáza modelu + pomer podľa T + výškový faktor | slr0 3,00, slrPerDeg 1,12, elevBeta -0,25 | 0,685 | 1,01 | 3,92 | -0,42 | -0,28 | -0,69 | -0,54 | -0,34 | 0,969 | 0,25 | 0,25 |
| fáza z wet-bulb + pomer podľa T + výškový faktor | phaseMidC -0,39, phaseHalfWidthC 1,40, slr0 4,50, slrPerDeg 0,69, elevBeta -0,48 | 0,637 | 0,95 | 3,55 | -0,40 | -0,30 | -0,56 | -0,75 | -0,19 | 0,979 | 0,27 | 0,19 |
| … + vietor (nárazy) | phaseMidC -0,40, phaseHalfWidthC 1,41, slr0 5,73, slrPerDeg 0,81, elevBeta -0,48, gustK 0,40 | 0,636 | 0,94 | 3,53 | -0,40 | -0,29 | -0,57 | -0,86 | -0,12 | 0,978 | 0,27 | 0,20 |

Primárna vzorka (sezóna prevádzky, pokrývka ≥ 30 cm) z tých istých LOSO predpovedí:

| Variant | n | udalostí | RMSE √cm | MAE [cm] | MAE sneh [cm] | bias [cm] | AUC@15 | POD@15 | FAR@15 |
|---|---|---|---|---|---|---|---|---|---|
| surový `snowfall` modelu | 4265 | 254 | 0,812 | 1,65 | 4,69 | -0,95 | 0,962 | 0,35 | 0,12 |
| dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 4265 | 254 | 0,770 | 1,61 | 4,42 | -0,64 | 0,966 | 0,40 | 0,21 |
| dnešné pravidlo × násobok | 4265 | 254 | 0,791 | 1,69 | 4,71 | -1,06 | 0,965 | 0,27 | 0,23 |
| fáza z wet-bulb (rampa), 0,7 cm/mm, násobok | 4265 | 254 | 0,776 | 1,65 | 4,59 | -0,82 | 0,965 | 0,33 | 0,19 |
| fáza z T (rampa), 0,7 cm/mm | 4265 | 254 | 0,775 | 1,64 | 4,59 | -0,87 | 0,964 | 0,32 | 0,19 |
| fáza modelu + pomer sneh/voda podľa T | 4265 | 254 | 0,840 | 1,78 | 5,03 | -0,89 | 0,957 | 0,28 | 0,19 |
| fáza z T (rampa) + pomer podľa T | 4265 | 254 | 0,776 | 1,65 | 4,59 | -0,80 | 0,963 | 0,33 | 0,20 |
| fáza z wet-bulb (rampa) + pomer podľa T | 4265 | 254 | 0,777 | 1,66 | 4,60 | -0,81 | 0,965 | 0,32 | 0,19 |
| fáza modelu + pomer podľa T + výškový faktor | 4265 | 254 | 0,826 | 1,73 | 4,88 | -0,88 | 0,959 | 0,29 | 0,17 |
| fáza z wet-bulb + pomer podľa T + výškový faktor | 4265 | 254 | 0,758 | 1,60 | 4,45 | -0,84 | 0,969 | 0,31 | 0,14 |
| … + vietor (nárazy) | 4265 | 254 | 0,759 | 1,60 | 4,46 | -0,84 | 0,968 | 0,31 | 0,15 |

### ICON-D2: 3551 staničných dní, 108 udalostí ≥ 15 cm, sezóny 2022/23–2025/26 (4), 14 staníc

Stanice: eHYD Turracher Höhe (1777 m) 1777 m (167); eHYD Maitratten-Sonnleiten (976 m) 976 m (167); eHYD Sirnitz (823 m) 823 m (167); eHYD Thomatal (1071 m) 1071 m (167); eHYD Kendlbruck (940 m) 940 m (167); eHYD Hochegg (1026 m) 1026 m (167); eHYD Dreifaltigkeit (1096 m) 1096 m (167); LWD Turracherhoehe (1795 m) 1795 m (108); LWD Falkert (1886 m) 1886 m (95); GeoSphere Villacher Alpe (ručná) (2140 m) 2140 m (706); GeoSphere Kanzelhöhe (1520 m) 1520 m (706); GeoSphere Flattnitz (1437 m) 1437.2 m (569); GeoSphere Katschberg (1635 m) 1635 m (188); GeoSphere Arriach (890 m) 890.2 m (10).

| Variant | parametre (fit na všetkom) | RMSE √cm | MAE [cm] | MAE sneh [cm] | bias [cm] | bias < 1 200 m | bias 1 200–1 700 m | bias 1 700–1 950 m | bias ≥ 1 950 m | AUC@15 | POD@15 | FAR@15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| surový `snowfall` modelu | – | 0,676 | 1,07 | 4,70 | -0,96 | -0,78 | -0,91 | -1,27 | -1,17 | 0,982 | 0,16 | 0,00 |
| dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | – | 0,539 | 0,87 | 3,66 | -0,60 | -0,49 | -0,64 | -0,97 | -0,48 | 0,989 | 0,32 | 0,13 |
| dnešné pravidlo × násobok | scale 1,35 | 0,517 | 0,78 | 3,22 | -0,28 | -0,34 | -0,33 | -0,58 | 0,06 | 0,989 | 0,51 | 0,21 |
| fáza z wet-bulb (rampa), 0,7 cm/mm, násobok | phaseMidC 0,26, phaseHalfWidthC 0,77, scale 1,39 | 0,520 | 0,79 | 3,27 | -0,29 | -0,40 | -0,35 | -0,53 | 0,12 | 0,989 | 0,55 | 0,19 |
| fáza z T (rampa), 0,7 cm/mm | phaseMidC 0,93, phaseHalfWidthC 0,62 | 0,542 | 0,87 | 3,70 | -0,63 | -0,55 | -0,66 | -0,98 | -0,48 | 0,989 | 0,32 | 0,13 |
| fáza modelu + pomer sneh/voda podľa T | slr0 14,93, slrPerDeg -0,32 | 0,605 | 0,90 | 3,86 | -0,38 | -0,56 | -0,23 | -0,45 | -0,39 | 0,982 | 0,52 | 0,29 |
| fáza z T (rampa) + pomer podľa T | phaseMidC 0,39, phaseHalfWidthC 0,99, slr0 12,48, slrPerDeg -0,64 | 0,511 | 0,78 | 3,25 | -0,27 | -0,36 | -0,27 | -0,53 | -0,00 | 0,989 | 0,56 | 0,24 |
| fáza z wet-bulb (rampa) + pomer podľa T | phaseMidC 0,03, phaseHalfWidthC 1,03, slr0 11,80, slrPerDeg -0,53 | 0,518 | 0,79 | 3,25 | -0,28 | -0,36 | -0,29 | -0,55 | -0,01 | 0,989 | 0,56 | 0,22 |
| fáza modelu + pomer podľa T + výškový faktor | slr0 14,19, slrPerDeg 0,21, elevBeta -0,37 | 0,611 | 0,91 | 3,93 | -0,41 | -0,59 | -0,25 | -0,42 | -0,49 | 0,981 | 0,50 | 0,31 |
| fáza z wet-bulb + pomer podľa T + výškový faktor | phaseMidC -0,05, phaseHalfWidthC 1,09, slr0 11,91, slrPerDeg -0,33, elevBeta -0,34 | 0,513 | 0,77 | 3,15 | -0,23 | -0,10 | -0,23 | -0,54 | -0,22 | 0,989 | 0,58 | 0,18 |
| … + vietor (nárazy) | phaseMidC -0,06, phaseHalfWidthC 1,09, slr0 11,96, slrPerDeg -0,34, elevBeta -0,34, gustK 0,00 | 0,514 | 0,77 | 3,16 | -0,23 | -0,10 | -0,24 | -0,54 | -0,22 | 0,989 | 0,59 | 0,18 |

Primárna vzorka (sezóna prevádzky, pokrývka ≥ 30 cm) z tých istých LOSO predpovedí:

| Variant | n | udalostí | RMSE √cm | MAE [cm] | MAE sneh [cm] | bias [cm] | AUC@15 | POD@15 | FAR@15 |
|---|---|---|---|---|---|---|---|---|---|
| surový `snowfall` modelu | 1572 | 81 | 0,800 | 1,61 | 5,38 | -1,49 | 0,976 | 0,19 | 0,00 |
| dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C) | 1572 | 81 | 0,644 | 1,34 | 4,35 | -1,00 | 0,982 | 0,32 | 0,16 |
| dnešné pravidlo × násobok | 1572 | 81 | 0,601 | 1,17 | 3,72 | -0,51 | 0,982 | 0,48 | 0,19 |
| fáza z wet-bulb (rampa), 0,7 cm/mm, násobok | 1572 | 81 | 0,604 | 1,18 | 3,74 | -0,48 | 0,982 | 0,53 | 0,17 |
| fáza z T (rampa), 0,7 cm/mm | 1572 | 81 | 0,647 | 1,35 | 4,38 | -1,01 | 0,982 | 0,32 | 0,16 |
| fáza modelu + pomer sneh/voda podľa T | 1572 | 81 | 0,694 | 1,32 | 4,30 | -0,57 | 0,974 | 0,51 | 0,27 |
| fáza z T (rampa) + pomer podľa T | 1572 | 81 | 0,592 | 1,16 | 3,69 | -0,47 | 0,982 | 0,53 | 0,22 |
| fáza z wet-bulb (rampa) + pomer podľa T | 1572 | 81 | 0,600 | 1,17 | 3,70 | -0,48 | 0,982 | 0,53 | 0,20 |
| fáza modelu + pomer podľa T + výškový faktor | 1572 | 81 | 0,701 | 1,33 | 4,36 | -0,64 | 0,973 | 0,47 | 0,30 |
| fáza z wet-bulb + pomer podľa T + výškový faktor | 1572 | 81 | 0,592 | 1,14 | 3,58 | -0,42 | 0,982 | 0,57 | 0,15 |
| … + vietor (nárazy) | 1572 | 81 | 0,593 | 1,14 | 3,60 | -0,42 | 0,982 | 0,58 | 0,15 |

## Empirické podmienené rozdelenie pozorovania podľa predpovedaného úhrnu (fyzika = pravidlo, vzorka fitu)

Dôvod dvojdielneho modelu: pri malých predpovedaných úhrnoch je podiel nulových pozorovaní oveľa vyšší, než dovolí cenzurované normálne rozdelenie s polohou ≈ √x, zatiaľ čo medián pozorovania je ≈ predpoveď.

IFS hist 0 h: 13899 staničných dní

| x (pravidlo) [cm] | n | x̄ | ȳ | ȳ/x̄ | podiel y = 0 | q25 | medián | q75 | q90 | P(y ≥ 15) | √ȳ − √x̄ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–0.001 | 8493 | 0,0 | 0,0 | – | 0,98 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,18 |
| 0.001–1 | 2678 | 0,4 | 0,5 | 1,34 | 0,82 | 0,0 | 0,0 | 0,0 | 2,0 | 0,00 | 0,10 |
| 1–3 | 1237 | 1,8 | 2,2 | 1,24 | 0,46 | 0,0 | 1,0 | 3,0 | 7,0 | 0,01 | 0,15 |
| 3–6 | 757 | 4,3 | 5,7 | 1,34 | 0,20 | 1,0 | 5,0 | 9,0 | 13,0 | 0,08 | 0,32 |
| 6–10 | 349 | 7,8 | 9,5 | 1,22 | 0,11 | 4,0 | 9,0 | 13,8 | 19,0 | 0,24 | 0,29 |
| 10–15 | 181 | 12,2 | 14,0 | 1,15 | 0,08 | 7,0 | 13,0 | 20,0 | 26,0 | 0,44 | 0,25 |
| 15–25 | 138 | 19,0 | 19,8 | 1,05 | 0,09 | 10,0 | 19,0 | 29,0 | 36,0 | 0,65 | 0,10 |
| 25–40 | 56 | 31,0 | 25,4 | 0,82 | 0,09 | 13,0 | 28,0 | 39,0 | 47,0 | 0,70 | -0,53 |
| 40–∞ | 10 | 51,0 | 29,2 | 0,57 | 0,00 | 13,0 | 29,0 | 47,0 | 61,0 | 0,60 | -1,74 |

IFS single 23 h: 1073 staničných dní

| x (pravidlo) [cm] | n | x̄ | ȳ | ȳ/x̄ | podiel y = 0 | q25 | medián | q75 | q90 | P(y ≥ 15) | √ȳ − √x̄ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–0.001 | 617 | 0,0 | 0,1 | – | 0,94 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,26 |
| 0.001–1 | 238 | 0,4 | 0,6 | 1,60 | 0,77 | 0,0 | 0,0 | 0,0 | 2,0 | 0,00 | 0,16 |
| 1–3 | 93 | 1,7 | 2,0 | 1,17 | 0,45 | 0,0 | 1,0 | 3,0 | 7,0 | 0,00 | 0,11 |
| 3–6 | 51 | 4,3 | 6,0 | 1,41 | 0,16 | 3,0 | 5,0 | 8,3 | 15,0 | 0,12 | 0,39 |
| 6–10 | 36 | 7,9 | 9,0 | 1,14 | 0,03 | 5,0 | 9,0 | 13,0 | 15,0 | 0,11 | 0,18 |
| 10–15 | 23 | 11,9 | 12,9 | 1,08 | 0,04 | 7,0 | 13,0 | 19,0 | 20,0 | 0,43 | 0,14 |
| 15–25 | 12 | 17,9 | 17,5 | 0,98 | 0,00 | 13,0 | 19,6 | 26,0 | 31,0 | 0,50 | -0,04 |
| 25–40 | 2 | 28,9 | 16,5 | 0,57 | 0,00 | 13,0 | 20,0 | 20,0 | 20,0 | 0,50 | -1,31 |
| 40–∞ | 1 | 40,8 | 12,0 | 0,29 | 0,00 | 12,0 | 12,0 | 12,0 | 12,0 | 0,00 | -2,92 |

IFS single 71 h: 1069 staničných dní

| x (pravidlo) [cm] | n | x̄ | ȳ | ȳ/x̄ | podiel y = 0 | q25 | medián | q75 | q90 | P(y ≥ 15) | √ȳ − √x̄ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–0.001 | 634 | 0,0 | 0,1 | – | 0,92 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,36 |
| 0.001–1 | 249 | 0,4 | 1,0 | 2,45 | 0,74 | 0,0 | 0,0 | 0,4 | 3,0 | 0,00 | 0,35 |
| 1–3 | 72 | 1,9 | 3,0 | 1,61 | 0,46 | 0,0 | 1,0 | 5,0 | 8,0 | 0,01 | 0,37 |
| 3–6 | 48 | 4,5 | 5,0 | 1,10 | 0,25 | 0,3 | 3,0 | 7,0 | 14,0 | 0,08 | 0,10 |
| 6–10 | 33 | 7,6 | 9,1 | 1,19 | 0,15 | 4,2 | 8,2 | 13,8 | 17,5 | 0,24 | 0,25 |
| 10–15 | 16 | 12,0 | 10,4 | 0,87 | 0,06 | 5,0 | 8,0 | 16,0 | 24,0 | 0,25 | -0,23 |
| 15–25 | 14 | 18,3 | 13,5 | 0,74 | 0,07 | 7,0 | 16,0 | 19,6 | 20,0 | 0,50 | -0,59 |
| 25–40 | 2 | 28,4 | 22,0 | 0,77 | 0,00 | 13,0 | 31,0 | 31,0 | 31,0 | 0,50 | -0,64 |
| 40–∞ | 1 | 48,4 | 13,0 | 0,27 | 0,00 | 13,0 | 13,0 | 13,0 | 13,0 | 0,00 | -3,35 |

IFS single 131 h: 1065 staničných dní

| x (pravidlo) [cm] | n | x̄ | ȳ | ȳ/x̄ | podiel y = 0 | q25 | medián | q75 | q90 | P(y ≥ 15) | √ȳ − √x̄ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–0.001 | 563 | 0,0 | 0,4 | – | 0,91 | 0,0 | 0,0 | 0,0 | 0,0 | 0,01 | 0,60 |
| 0.001–1 | 264 | 0,3 | 1,0 | 2,98 | 0,77 | 0,0 | 0,0 | 0,0 | 4,0 | 0,00 | 0,42 |
| 1–3 | 109 | 1,8 | 2,8 | 1,56 | 0,54 | 0,0 | 0,0 | 3,0 | 10,0 | 0,06 | 0,33 |
| 3–6 | 63 | 4,1 | 4,0 | 0,96 | 0,48 | 0,0 | 0,8 | 7,0 | 13,0 | 0,08 | -0,04 |
| 6–10 | 25 | 7,4 | 5,5 | 0,75 | 0,56 | 0,0 | 0,0 | 10,0 | 20,0 | 0,20 | -0,37 |
| 10–15 | 15 | 12,9 | 8,8 | 0,68 | 0,00 | 3,0 | 6,0 | 14,0 | 20,0 | 0,20 | -0,63 |
| 15–25 | 20 | 19,7 | 6,3 | 0,32 | 0,10 | 3,0 | 5,0 | 8,0 | 12,0 | 0,05 | -1,94 |
| 25–40 | 4 | 33,3 | 12,0 | 0,36 | 0,00 | 13,0 | 13,0 | 17,0 | 17,0 | 0,25 | -2,31 |
| 40–∞ | 2 | 42,2 | 8,0 | 0,19 | 0,00 | 6,0 | 10,0 | 10,0 | 10,0 | 0,00 | -3,67 |

ICON-D2 prev 1 d: 1192 staničných dní

| x (pravidlo) [cm] | n | x̄ | ȳ | ȳ/x̄ | podiel y = 0 | q25 | medián | q75 | q90 | P(y ≥ 15) | √ȳ − √x̄ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–0.001 | 891 | 0,0 | 0,1 | – | 0,92 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,35 |
| 0.001–1 | 117 | 0,5 | 1,1 | 2,35 | 0,65 | 0,0 | 0,0 | 1,0 | 3,0 | 0,00 | 0,36 |
| 1–3 | 66 | 1,7 | 3,1 | 1,78 | 0,24 | 0,8 | 2,9 | 4,3 | 7,0 | 0,00 | 0,44 |
| 3–6 | 55 | 4,4 | 7,0 | 1,59 | 0,07 | 4,0 | 6,0 | 8,3 | 13,8 | 0,09 | 0,55 |
| 6–10 | 28 | 7,9 | 9,4 | 1,18 | 0,04 | 5,0 | 9,0 | 14,0 | 17,0 | 0,21 | 0,25 |
| 10–15 | 18 | 11,5 | 12,5 | 1,09 | 0,00 | 7,2 | 13,0 | 17,4 | 20,0 | 0,39 | 0,14 |
| 15–25 | 13 | 18,8 | 18,6 | 0,99 | 0,00 | 14,6 | 19,0 | 21,0 | 26,0 | 0,69 | -0,02 |
| 25–40 | 4 | 29,6 | 19,3 | 0,65 | 0,00 | 13,0 | 20,0 | 31,0 | 31,0 | 0,50 | -1,05 |

ICON-D2 hist 0 h: 3551 staničných dní

| x (pravidlo) [cm] | n | x̄ | ȳ | ȳ/x̄ | podiel y = 0 | q25 | medián | q75 | q90 | P(y ≥ 15) | √ȳ − √x̄ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0–0.001 | 2513 | 0,0 | 0,0 | – | 0,96 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,22 |
| 0.001–1 | 433 | 0,4 | 0,9 | 2,35 | 0,61 | 0,0 | 0,0 | 1,0 | 3,0 | 0,00 | 0,33 |
| 1–3 | 263 | 1,9 | 3,1 | 1,66 | 0,20 | 1,0 | 2,0 | 5,0 | 7,0 | 0,00 | 0,39 |
| 3–6 | 165 | 4,3 | 6,6 | 1,54 | 0,10 | 3,0 | 6,0 | 9,2 | 13,0 | 0,06 | 0,50 |
| 6–10 | 86 | 7,8 | 12,1 | 1,54 | 0,02 | 8,0 | 12,0 | 15,0 | 19,0 | 0,33 | 0,68 |
| 10–15 | 51 | 12,1 | 18,7 | 1,54 | 0,00 | 13,0 | 19,0 | 25,0 | 30,0 | 0,65 | 0,84 |
| 15–25 | 36 | 19,0 | 28,8 | 1,52 | 0,00 | 20,0 | 29,0 | 38,0 | 45,0 | 0,86 | 1,02 |
| 25–40 | 4 | 29,6 | 38,8 | 1,31 | 0,00 | 28,0 | 47,0 | 60,0 | 60,0 | 1,00 | 0,78 |

## Krok 3b – neistota podľa predstihu

Dve rodiny okolo úhrnu z fyziky x (cm): **cenzurované normálne** √Y ~ N(a + b·√x, c + d·√x) cenzurované v nule, a **dvojdielne** P(Y > 0) = Φ(h0 + h1·√x), √Y | Y > 0 ~ N(a + b·√x, c + d·√x) orezané v nule. P(≥ 15 cm) = P(Y ≥ 15). Parametre spoločné pre stanice, fit maximálnou vierohodnosťou. Overenie mimo vzorky: pri predstihu 0 leave-one-season-out, pri predstihoch zo single runs zima proti zime (fit 2024/25 → test 2025/26 a naopak); fyzika v každom folde fitovaná bez testovanej sezóny. Skóre na primárnej vzorke (sezóna prevádzky, pokrývka ≥ 30 cm); CRPSS = 1 − CRPS / CRPS nepodmieneného dvojdielneho rozdelenia fitovaného na tréningu; BSS proti LOSO klimatológii po mesiacoch ako v kroku 2.

### Predstih 0 (Historical Forecast), LOSO

| Zdroj | Predstih | Rodina | Fyzika | n | udalostí | **BSS** (95 % CI) | CRPSS (95 % CI) | CRPS / klim. [cm] | AUC | p̄ pri udalosti | p̄ inak | parametre (fit na všetkom) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IFS 9 km hist | 0 h | cenzurované normálne | rule | 4265 | 254 | **0,45 (0,36–0,53)** | 0,38 (0,32–0,44) | 1,44 / 2,33 | 0,965 | 0,52 | 0,033 | a -2,57, b 1,91, c 1,42, d 0,29 |
| IFS 9 km hist | 0 h | cenzurované normálne | t2m-ramp | 4265 | 254 | **0,43 (0,33–0,50)** | 0,33 (0,27–0,39) | 1,55 / 2,33 | 0,964 | 0,55 | 0,037 | a -2,53, b 2,15, c 1,41, d 0,30 |
| IFS 9 km hist | 0 h | cenzurované normálne | wb-slr-elev | 4265 | 254 | **0,47 (0,38–0,53)** | 0,39 (0,33–0,43) | 1,43 / 2,33 | 0,969 | 0,56 | 0,035 | a -2,63, b 2,14, c 1,42, d 0,23 |
| IFS 9 km hist | 0 h | dvojdielne | rule | 4265 | 254 | **0,42 (0,35–0,50)** | 0,50 (0,47–0,54) | 1,16 / 2,33 | 0,965 | 0,38 | 0,020 | h0 -1,83, h1 1,22, a 1,09, b 0,69, c 0,55, d 0,18 |
| IFS 9 km hist | 0 h | dvojdielne | t2m-ramp | 4265 | 254 | **0,43 (0,36–0,50)** | 0,51 (0,48–0,54) | 1,14 / 2,33 | 0,964 | 0,40 | 0,023 | h0 -1,90, h1 1,53, a 1,12, b 0,75, c 0,58, d 0,19 |
| IFS 9 km hist | 0 h | dvojdielne | wb-slr-elev | 4265 | 254 | **0,45 (0,39–0,51)** | 0,53 (0,50–0,55) | 1,10 / 2,33 | 0,969 | 0,41 | 0,022 | h0 -1,97, h1 1,53, a 1,04, b 0,77, c 0,55, d 0,19 |
| ICON-D2 hist | 0 h | cenzurované normálne | rule | 1572 | 81 | **0,57 (0,44–0,68)** | 0,54 (0,46–0,61) | 0,99 / 2,15 | 0,982 | 0,64 | 0,024 | a -1,74, b 1,88, c 1,22, d 0,05 |
| ICON-D2 hist | 0 h | cenzurované normálne | t2m-ramp | 1572 | 81 | **0,57 (0,44–0,67)** | 0,54 (0,46–0,60) | 1,00 / 2,15 | 0,982 | 0,65 | 0,024 | a -1,72, b 1,89, c 1,20, d 0,06 |
| ICON-D2 hist | 0 h | cenzurované normálne | wb-slr-elev | 1572 | 81 | **0,58 (0,44–0,69)** | 0,54 (0,45–0,61) | 1,00 / 2,15 | 0,982 | 0,67 | 0,024 | a -1,74, b 1,62, c 1,22, d 0,03 |
| ICON-D2 hist | 0 h | dvojdielne | rule | 1572 | 81 | **0,54 (0,43–0,64)** | 0,58 (0,55–0,62) | 0,89 / 2,15 | 0,982 | 0,45 | 0,015 | h0 -1,67, h1 1,78, a 0,92, b 0,83, c 0,43, d 0,18 |
| ICON-D2 hist | 0 h | dvojdielne | t2m-ramp | 1572 | 81 | **0,54 (0,44–0,63)** | 0,58 (0,55–0,62) | 0,89 / 2,15 | 0,982 | 0,46 | 0,015 | h0 -1,69, h1 1,84, a 0,92, b 0,84, c 0,42, d 0,19 |
| ICON-D2 hist | 0 h | dvojdielne | wb-slr-elev | 1572 | 81 | **0,57 (0,45–0,67)** | 0,60 (0,56–0,63) | 0,87 / 2,15 | 0,982 | 0,49 | 0,015 | h0 -1,70, h1 1,58, a 0,90, b 0,73, c 0,43, d 0,15 |

### IFS 9 km celé behy 00z/12z, podľa predstihu, zima proti zime

| Zdroj | Predstih | Rodina | Fyzika | n | udalostí | **BSS** (95 % CI) | CRPSS (95 % CI) | CRPS / klim. [cm] | AUC | p̄ pri udalosti | p̄ inak | parametre (fit na všetkom) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IFS 9 km single | 23 h | cenzurované normálne | rule | 646 | 24 | **0,22 (-0,16–0,40)** | 0,38 (0,22–0,45) | 1,02 / 1,64 | 0,967 | 0,47 | 0,033 | a -2,04, b 1,68, c 1,51, d 0,03 |
| IFS 9 km single | 23 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,15 (-0,28–0,34)** | 0,32 (0,14–0,40) | 1,12 / 1,64 | 0,963 | 0,48 | 0,036 | a -1,97, b 1,77, c 1,47, d 0,09 |
| IFS 9 km single | 23 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,15 (-0,28–0,34)** | 0,33 (0,18–0,39) | 1,11 / 1,64 | 0,964 | 0,47 | 0,036 | a -2,04, b 1,86, c 1,48, d 0,07 |
| IFS 9 km single | 23 h | dvojdielne | rule | 646 | 24 | **0,26 (0,01–0,42)** | 0,51 (0,39–0,57) | 0,81 / 1,64 | 0,966 | 0,31 | 0,020 | h0 -1,53, h1 1,25, a 1,01, b 0,69, c 0,48, d 0,14 |
| IFS 9 km single | 23 h | dvojdielne | t2m-ramp | 646 | 24 | **0,23 (-0,03–0,38)** | 0,50 (0,37–0,56) | 0,83 / 1,64 | 0,962 | 0,32 | 0,023 | h0 -1,55, h1 1,41, a 1,03, b 0,72, c 0,47, d 0,17 |
| IFS 9 km single | 23 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,23 (-0,02–0,37)** | 0,49 (0,35–0,54) | 0,84 / 1,64 | 0,963 | 0,32 | 0,023 | h0 -1,57, h1 1,43, a 0,99, b 0,77, c 0,42, d 0,21 |
| IFS 9 km single | 35 h | cenzurované normálne | rule | 646 | 24 | **0,23 (-0,10–0,41)** | 0,38 (0,28–0,45) | 1,01 / 1,64 | 0,969 | 0,46 | 0,031 | a -2,05, b 1,67, c 1,58, d 0,02 |
| IFS 9 km single | 35 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,18 (-0,14–0,37)** | 0,34 (0,22–0,42) | 1,09 / 1,64 | 0,967 | 0,47 | 0,033 | a -1,99, b 1,75, c 1,55, d 0,07 |
| IFS 9 km single | 35 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,20 (-0,19–0,40)** | 0,34 (0,21–0,42) | 1,09 / 1,64 | 0,970 | 0,48 | 0,033 | a -2,00, b 1,84, c 1,50, d 0,09 |
| IFS 9 km single | 35 h | dvojdielne | rule | 646 | 24 | **0,26 (0,06–0,42)** | 0,50 (0,41–0,57) | 0,81 / 1,64 | 0,967 | 0,29 | 0,019 | h0 -1,48, h1 1,21, a 1,07, b 0,67, c 0,55, d 0,11 |
| IFS 9 km single | 35 h | dvojdielne | t2m-ramp | 646 | 24 | **0,25 (0,04–0,39)** | 0,50 (0,40–0,57) | 0,82 / 1,64 | 0,967 | 0,31 | 0,021 | h0 -1,49, h1 1,36, a 1,09, b 0,69, c 0,55, d 0,13 |
| IFS 9 km single | 35 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,27 (0,05–0,40)** | 0,50 (0,39–0,56) | 0,82 / 1,64 | 0,970 | 0,32 | 0,020 | h0 -1,52, h1 1,42, a 1,04, b 0,74, c 0,50, d 0,17 |
| IFS 9 km single | 47 h | cenzurované normálne | rule | 646 | 24 | **0,06 (-0,25–0,26)** | 0,23 (0,13–0,31) | 1,27 / 1,64 | 0,954 | 0,44 | 0,037 | a -2,10, b 1,75, c 1,61, d 0,10 |
| IFS 9 km single | 47 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,03 (-0,31–0,23)** | 0,17 (0,04–0,28) | 1,36 / 1,64 | 0,956 | 0,44 | 0,038 | a -2,05, b 1,84, c 1,58, d 0,16 |
| IFS 9 km single | 47 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,03 (-0,38–0,24)** | 0,14 (-0,07–0,29) | 1,41 / 1,64 | 0,956 | 0,44 | 0,037 | a -2,08, b 1,93, c 1,56, d 0,17 |
| IFS 9 km single | 47 h | dvojdielne | rule | 646 | 24 | **0,19 (0,00–0,36)** | 0,43 (0,33–0,52) | 0,93 / 1,64 | 0,954 | 0,31 | 0,024 | h0 -1,47, h1 1,23, a 1,10, b 0,69, c 0,52, d 0,17 |
| IFS 9 km single | 47 h | dvojdielne | t2m-ramp | 646 | 24 | **0,17 (-0,03–0,33)** | 0,43 (0,33–0,50) | 0,94 / 1,64 | 0,955 | 0,31 | 0,025 | h0 -1,47, h1 1,35, a 1,13, b 0,71, c 0,53, d 0,19 |
| IFS 9 km single | 47 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,17 (-0,04–0,32)** | 0,42 (0,29–0,49) | 0,96 / 1,64 | 0,955 | 0,31 | 0,025 | h0 -1,50, h1 1,40, a 1,09, b 0,76, c 0,50, d 0,21 |
| IFS 9 km single | 59 h | cenzurované normálne | rule | 646 | 24 | **0,20 (-0,03–0,34)** | 0,27 (0,15–0,37) | 1,21 / 1,64 | 0,957 | 0,40 | 0,031 | a -2,38, b 1,74, c 1,91, d 0,04 |
| IFS 9 km single | 59 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,19 (-0,09–0,33)** | 0,25 (0,13–0,36) | 1,22 / 1,64 | 0,959 | 0,41 | 0,032 | a -2,30, b 1,83, c 1,86, d 0,07 |
| IFS 9 km single | 59 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,19 (-0,10–0,33)** | 0,25 (0,11–0,36) | 1,23 / 1,64 | 0,957 | 0,40 | 0,033 | a -2,37, b 1,93, c 1,89, d 0,06 |
| IFS 9 km single | 59 h | dvojdielne | rule | 646 | 24 | **0,25 (0,07–0,39)** | 0,39 (0,26–0,51) | 1,00 / 1,64 | 0,956 | 0,30 | 0,022 | h0 -1,38, h1 1,02, a 1,22, b 0,64, c 0,60, d 0,15 |
| IFS 9 km single | 59 h | dvojdielne | t2m-ramp | 646 | 24 | **0,24 (0,04–0,38)** | 0,40 (0,26–0,50) | 0,99 / 1,64 | 0,957 | 0,30 | 0,023 | h0 -1,39, h1 1,14, a 1,23, b 0,68, c 0,60, d 0,16 |
| IFS 9 km single | 59 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,24 (0,04–0,38)** | 0,39 (0,23–0,50) | 1,00 / 1,64 | 0,954 | 0,30 | 0,023 | h0 -1,40, h1 1,17, a 1,22, b 0,71, c 0,60, d 0,17 |
| IFS 9 km single | 71 h | cenzurované normálne | rule | 646 | 24 | **0,16 (-0,15–0,36)** | 0,25 (0,13–0,35) | 1,23 / 1,64 | 0,953 | 0,34 | 0,032 | a -2,38, b 1,67, c 1,95, d 0,07 |
| IFS 9 km single | 71 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,12 (-0,25–0,33)** | 0,20 (0,07–0,32) | 1,30 / 1,64 | 0,950 | 0,35 | 0,034 | a -2,29, b 1,75, c 1,88, d 0,15 |
| IFS 9 km single | 71 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,13 (-0,23–0,34)** | 0,20 (0,05–0,32) | 1,32 / 1,64 | 0,945 | 0,35 | 0,035 | a -2,34, b 1,82, c 1,89, d 0,16 |
| IFS 9 km single | 71 h | dvojdielne | rule | 646 | 24 | **0,21 (0,00–0,37)** | 0,39 (0,28–0,48) | 1,00 / 1,64 | 0,953 | 0,27 | 0,022 | h0 -1,33, h1 0,93, a 1,28, b 0,60, c 0,62, d 0,16 |
| IFS 9 km single | 71 h | dvojdielne | t2m-ramp | 646 | 24 | **0,18 (-0,05–0,34)** | 0,38 (0,27–0,47) | 1,02 / 1,64 | 0,951 | 0,28 | 0,024 | h0 -1,32, h1 1,00, a 1,27, b 0,65, c 0,59, d 0,19 |
| IFS 9 km single | 71 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,18 (-0,06–0,35)** | 0,37 (0,24–0,47) | 1,03 / 1,64 | 0,947 | 0,27 | 0,024 | h0 -1,32, h1 1,00, a 1,27, b 0,66, c 0,61, d 0,19 |
| IFS 9 km single | 83 h | cenzurované normálne | rule | 646 | 24 | **0,09 (-0,15–0,22)** | 0,18 (0,06–0,28) | 1,34 / 1,64 | 0,914 | 0,27 | 0,034 | a -2,56, b 1,58, c 2,18, d 0,09 |
| IFS 9 km single | 83 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,07 (-0,24–0,22)** | 0,15 (0,00–0,25) | 1,40 / 1,64 | 0,911 | 0,28 | 0,036 | a -2,51, b 1,65, c 2,16, d 0,14 |
| IFS 9 km single | 83 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,05 (-0,29–0,21)** | 0,14 (-0,04–0,25) | 1,41 / 1,64 | 0,909 | 0,27 | 0,037 | a -2,51, b 1,69, c 2,13, d 0,16 |
| IFS 9 km single | 83 h | dvojdielne | rule | 646 | 24 | **0,12 (-0,01–0,22)** | 0,30 (0,18–0,40) | 1,15 / 1,64 | 0,913 | 0,18 | 0,021 | h0 -1,25, h1 0,76, a 1,46, b 0,49, c 0,77, d 0,11 |
| IFS 9 km single | 83 h | dvojdielne | t2m-ramp | 646 | 24 | **0,11 (-0,07–0,22)** | 0,30 (0,16–0,40) | 1,15 / 1,64 | 0,910 | 0,19 | 0,023 | h0 -1,23, h1 0,79, a 1,48, b 0,51, c 0,78, d 0,11 |
| IFS 9 km single | 83 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,09 (-0,12–0,21)** | 0,29 (0,13–0,39) | 1,17 / 1,64 | 0,910 | 0,19 | 0,023 | h0 -1,23, h1 0,79, a 1,48, b 0,52, c 0,79, d 0,11 |
| IFS 9 km single | 95 h | cenzurované normálne | rule | 646 | 24 | **0,04 (-0,17–0,24)** | 0,22 (0,14–0,30) | 1,28 / 1,64 | 0,936 | 0,25 | 0,033 | a -2,40, b 1,56, c 1,93, d 0,17 |
| IFS 9 km single | 95 h | cenzurované normálne | t2m-ramp | 646 | 24 | **-0,01 (-0,29–0,21)** | 0,18 (0,09–0,25) | 1,35 / 1,64 | 0,930 | 0,25 | 0,036 | a -2,33, b 1,64, c 1,87, d 0,24 |
| IFS 9 km single | 95 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **-0,01 (-0,28–0,21)** | 0,17 (0,07–0,25) | 1,36 / 1,64 | 0,925 | 0,25 | 0,037 | a -2,35, b 1,70, c 1,84, d 0,27 |
| IFS 9 km single | 95 h | dvojdielne | rule | 646 | 24 | **0,09 (-0,05–0,26)** | 0,33 (0,22–0,44) | 1,10 / 1,64 | 0,936 | 0,19 | 0,022 | h0 -1,31, h1 0,80, a 1,30, b 0,56, c 0,63, d 0,18 |
| IFS 9 km single | 95 h | dvojdielne | t2m-ramp | 646 | 24 | **0,05 (-0,13–0,22)** | 0,32 (0,20–0,41) | 1,12 / 1,64 | 0,932 | 0,19 | 0,025 | h0 -1,29, h1 0,85, a 1,30, b 0,60, c 0,62, d 0,21 |
| IFS 9 km single | 95 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,04 (-0,15–0,22)** | 0,31 (0,19–0,40) | 1,14 / 1,64 | 0,929 | 0,19 | 0,025 | h0 -1,31, h1 0,86, a 1,29, b 0,62, c 0,62, d 0,21 |
| IFS 9 km single | 107 h | cenzurované normálne | rule | 646 | 24 | **0,06 (-0,21–0,24)** | 0,20 (0,08–0,29) | 1,31 / 1,64 | 0,946 | 0,30 | 0,034 | a -2,44, b 1,56, c 1,93, d 0,10 |
| IFS 9 km single | 107 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,01 (-0,33–0,22)** | 0,17 (0,04–0,25) | 1,36 / 1,64 | 0,942 | 0,29 | 0,036 | a -2,41, b 1,64, c 1,92, d 0,15 |
| IFS 9 km single | 107 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,01 (-0,33–0,21)** | 0,17 (0,04–0,26) | 1,36 / 1,64 | 0,939 | 0,28 | 0,037 | a -2,44, b 1,71, c 1,91, d 0,17 |
| IFS 9 km single | 107 h | dvojdielne | rule | 646 | 24 | **0,13 (-0,02–0,26)** | 0,35 (0,24–0,44) | 1,06 / 1,64 | 0,946 | 0,22 | 0,022 | h0 -1,37, h1 0,88, a 1,29, b 0,54, c 0,64, d 0,15 |
| IFS 9 km single | 107 h | dvojdielne | t2m-ramp | 646 | 24 | **0,09 (-0,09–0,25)** | 0,35 (0,23–0,42) | 1,07 / 1,64 | 0,943 | 0,21 | 0,024 | h0 -1,36, h1 0,93, a 1,31, b 0,56, c 0,64, d 0,17 |
| IFS 9 km single | 107 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,09 (-0,10–0,25)** | 0,34 (0,21–0,41) | 1,09 / 1,64 | 0,942 | 0,21 | 0,024 | h0 -1,36, h1 0,94, a 1,31, b 0,58, c 0,63, d 0,18 |
| IFS 9 km single | 119 h | cenzurované normálne | rule | 646 | 24 | **0,08 (-0,12–0,26)** | 0,14 (0,04–0,22) | 1,41 / 1,64 | 0,872 | 0,22 | 0,036 | a -2,85, b 1,49, c 2,54, d 0,00 |
| IFS 9 km single | 119 h | cenzurované normálne | t2m-ramp | 646 | 24 | **0,06 (-0,15–0,23)** | 0,12 (0,03–0,18) | 1,45 / 1,64 | 0,858 | 0,22 | 0,038 | a -2,84, b 1,54, c 2,56, d 0,00 |
| IFS 9 km single | 119 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **0,03 (-0,21–0,21)** | 0,09 (-0,02–0,16) | 1,49 / 1,64 | 0,850 | 0,22 | 0,041 | a -2,87, b 1,58, c 2,57, d 0,02 |
| IFS 9 km single | 119 h | dvojdielne | rule | 646 | 24 | **0,10 (-0,02–0,24)** | 0,22 (0,09–0,33) | 1,28 / 1,64 | 0,814 | 0,12 | 0,022 | h0 -1,22, h1 0,68, a 1,70, b 0,35, c 0,92, d 0,06 |
| IFS 9 km single | 119 h | dvojdielne | t2m-ramp | 646 | 24 | **0,09 (-0,02–0,22)** | 0,21 (0,08–0,32) | 1,29 / 1,64 | 0,757 | 0,12 | 0,023 | h0 -1,21, h1 0,70, a 1,72, b 0,35, c 0,94, d 0,05 |
| IFS 9 km single | 119 h | dvojdielne | wb-slr-elev | 646 | 24 | **0,09 (-0,02–0,21)** | 0,20 (0,07–0,30) | 1,31 / 1,64 | 0,725 | 0,12 | 0,023 | h0 -1,21, h1 0,69, a 1,72, b 0,36, c 0,94, d 0,06 |
| IFS 9 km single | 131 h | cenzurované normálne | rule | 646 | 24 | **-0,13 (-0,53–0,08)** | 0,03 (-0,21–0,16) | 1,60 / 1,64 | 0,776 | 0,12 | 0,037 | a -2,90, b 1,39, c 2,64, d 0,00 |
| IFS 9 km single | 131 h | cenzurované normálne | t2m-ramp | 646 | 24 | **-0,14 (-0,59–0,08)** | 0,01 (-0,25–0,15) | 1,63 / 1,64 | 0,777 | 0,13 | 0,038 | a -2,87, b 1,46, c 2,62, d 0,00 |
| IFS 9 km single | 131 h | cenzurované normálne | wb-slr-elev | 646 | 24 | **-0,16 (-0,65–0,10)** | -0,03 (-0,33–0,15) | 1,69 / 1,64 | 0,770 | 0,14 | 0,041 | a -2,92, b 1,51, c 2,63, d 0,00 |
| IFS 9 km single | 131 h | dvojdielne | rule | 646 | 24 | **-0,13 (-0,43–0,08)** | 0,08 (-0,10–0,20) | 1,52 / 1,64 | 0,766 | 0,06 | 0,026 | h0 -1,23, h1 0,67, a 1,83, b 0,25, c 0,99, d 0,04 |
| IFS 9 km single | 131 h | dvojdielne | t2m-ramp | 646 | 24 | **-0,12 (-0,41–0,09)** | 0,08 (-0,10–0,21) | 1,51 / 1,64 | 0,767 | 0,07 | 0,027 | h0 -1,24, h1 0,73, a 1,83, b 0,27, c 0,99, d 0,04 |
| IFS 9 km single | 131 h | dvojdielne | wb-slr-elev | 646 | 24 | **-0,14 (-0,46–0,09)** | 0,06 (-0,15–0,19) | 1,55 / 1,64 | 0,761 | 0,08 | 0,029 | h0 -1,23, h1 0,72, a 1,81, b 0,28, c 0,99, d 0,04 |

### ICON-D2 Previous Runs (pred 1 dňom), zima proti zime

| Zdroj | Predstih | Rodina | Fyzika | n | udalostí | **BSS** (95 % CI) | CRPSS (95 % CI) | CRPS / klim. [cm] | AUC | p̄ pri udalosti | p̄ inak | parametre (fit na všetkom) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ICON-D2 prev | 1 d (24–47 h) | cenzurované normálne | rule | 637 | 24 | **0,29 (0,01–0,46)** | 0,34 (0,24–0,41) | 1,10 / 1,66 | 0,976 | 0,56 | 0,030 | a -1,80, b 1,68, c 1,52, d 0,00 |
| ICON-D2 prev | 1 d (24–47 h) | cenzurované normálne | t2m-ramp | 637 | 24 | **0,28 (-0,01–0,45)** | 0,33 (0,23–0,41) | 1,11 / 1,66 | 0,976 | 0,57 | 0,031 | a -1,78, b 1,68, c 1,49, d 0,02 |
| ICON-D2 prev | 1 d (24–47 h) | cenzurované normálne | wb-slr-elev | 637 | 24 | **0,26 (-0,05–0,42)** | 0,30 (0,16–0,41) | 1,16 / 1,66 | 0,975 | 0,57 | 0,031 | a -1,80, b 1,52, c 1,53, d 0,00 |
| ICON-D2 prev | 1 d (24–47 h) | dvojdielne | rule | 637 | 24 | **0,34 (0,16–0,50)** | 0,55 (0,48–0,61) | 0,74 / 1,66 | 0,975 | 0,34 | 0,017 | h0 -1,42, h1 1,49, a 1,15, b 0,66, c 0,53, d 0,12 |
| ICON-D2 prev | 1 d (24–47 h) | dvojdielne | t2m-ramp | 637 | 24 | **0,34 (0,16–0,50)** | 0,55 (0,48–0,61) | 0,75 / 1,66 | 0,975 | 0,35 | 0,018 | h0 -1,42, h1 1,51, a 1,13, b 0,67, c 0,50, d 0,14 |
| ICON-D2 prev | 1 d (24–47 h) | dvojdielne | wb-slr-elev | 637 | 24 | **0,35 (0,19–0,49)** | 0,55 (0,48–0,61) | 0,75 / 1,66 | 0,975 | 0,35 | 0,017 | h0 -1,41, h1 1,38, a 1,17, b 0,59, c 0,57, d 0,09 |

### Dráha parametrov s predstihom (fit na oboch zimách; predstih 0 na celom archíve), fyzika = pravidlo

| Rodina | Predstih | parametre | BSS primárna | CRPSS primárna |
|---|---|---|---|---|
| cenzurované normálne | 0 h | a -2,57, b 1,91, c 1,42, d 0,29 | 0,45 | 0,38 |
| cenzurované normálne | 23 h | a -2,04, b 1,68, c 1,51, d 0,03 | 0,22 | 0,38 |
| cenzurované normálne | 35 h | a -2,05, b 1,67, c 1,58, d 0,02 | 0,23 | 0,38 |
| cenzurované normálne | 47 h | a -2,10, b 1,75, c 1,61, d 0,10 | 0,06 | 0,23 |
| cenzurované normálne | 59 h | a -2,38, b 1,74, c 1,91, d 0,04 | 0,20 | 0,27 |
| cenzurované normálne | 71 h | a -2,38, b 1,67, c 1,95, d 0,07 | 0,16 | 0,25 |
| cenzurované normálne | 83 h | a -2,56, b 1,58, c 2,18, d 0,09 | 0,09 | 0,18 |
| cenzurované normálne | 95 h | a -2,40, b 1,56, c 1,93, d 0,17 | 0,04 | 0,22 |
| cenzurované normálne | 107 h | a -2,44, b 1,56, c 1,93, d 0,10 | 0,06 | 0,20 |
| cenzurované normálne | 119 h | a -2,85, b 1,49, c 2,54, d 0,00 | 0,08 | 0,14 |
| cenzurované normálne | 131 h | a -2,90, b 1,39, c 2,64, d 0,00 | -0,13 | 0,03 |
| dvojdielne | 0 h | h0 -1,83, h1 1,22, a 1,09, b 0,69, c 0,55, d 0,18 | 0,42 | 0,50 |
| dvojdielne | 23 h | h0 -1,53, h1 1,25, a 1,01, b 0,69, c 0,48, d 0,14 | 0,26 | 0,51 |
| dvojdielne | 35 h | h0 -1,48, h1 1,21, a 1,07, b 0,67, c 0,55, d 0,11 | 0,26 | 0,50 |
| dvojdielne | 47 h | h0 -1,47, h1 1,23, a 1,10, b 0,69, c 0,52, d 0,17 | 0,19 | 0,43 |
| dvojdielne | 59 h | h0 -1,38, h1 1,02, a 1,22, b 0,64, c 0,60, d 0,15 | 0,25 | 0,39 |
| dvojdielne | 71 h | h0 -1,33, h1 0,93, a 1,28, b 0,60, c 0,62, d 0,16 | 0,21 | 0,39 |
| dvojdielne | 83 h | h0 -1,25, h1 0,76, a 1,46, b 0,49, c 0,77, d 0,11 | 0,12 | 0,30 |
| dvojdielne | 95 h | h0 -1,31, h1 0,80, a 1,30, b 0,56, c 0,63, d 0,18 | 0,09 | 0,33 |
| dvojdielne | 107 h | h0 -1,37, h1 0,88, a 1,29, b 0,54, c 0,64, d 0,15 | 0,13 | 0,35 |
| dvojdielne | 119 h | h0 -1,22, h1 0,68, a 1,70, b 0,35, c 0,92, d 0,06 | 0,10 | 0,22 |
| dvojdielne | 131 h | h0 -1,23, h1 0,67, a 1,83, b 0,25, c 0,99, d 0,04 | -0,13 | 0,08 |

### Spoľahlivosť (reliability), fyzika = pravidlo, primárna vzorka

IFS 9 km hist 0 h, cenzurované normálne: 0.00–0.05: n 3518, p̄ 0,00, pozorované 0,00; 0.05–0.15: n 258, p̄ 0,09, pozorované 0,08; 0.15–0.30: n 152, p̄ 0,21, pozorované 0,22; 0.30–0.50: n 142, p̄ 0,39, pozorované 0,35; 0.50–0.70: n 86, p̄ 0,60, pozorované 0,57; 0.70–0.90: n 79, p̄ 0,80, pozorované 0,76; 0.90–1.00: n 30, p̄ 0,95, pozorované 0,83

IFS 9 km hist 0 h, dvojdielne: 0.00–0.05: n 3700, p̄ 0,00, pozorované 0,01; 0.05–0.15: n 199, p̄ 0,09, pozorované 0,15; 0.15–0.30: n 139, p̄ 0,23, pozorované 0,32; 0.30–0.50: n 110, p̄ 0,39, pozorované 0,53; 0.50–0.70: n 78, p̄ 0,59, pozorované 0,77; 0.70–0.90: n 36, p̄ 0,78, pozorované 0,83; 0.90–1.00: n 3, p̄ 0,91, pozorované 0,67

ICON-D2 hist 0 h, cenzurované normálne: 0.00–0.05: n 1370, p̄ 0,00, pozorované 0,00; 0.05–0.15: n 56, p̄ 0,09, pozorované 0,07; 0.15–0.30: n 39, p̄ 0,21, pozorované 0,15; 0.30–0.50: n 30, p̄ 0,39, pozorované 0,37; 0.50–0.70: n 29, p̄ 0,59, pozorované 0,59; 0.70–0.90: n 21, p̄ 0,82, pozorované 0,81; 0.90–1.00: n 27, p̄ 0,97, pozorované 0,81

ICON-D2 hist 0 h, dvojdielne: 0.00–0.05: n 1398, p̄ 0,00, pozorované 0,00; 0.05–0.15: n 54, p̄ 0,09, pozorované 0,13; 0.15–0.30: n 39, p̄ 0,22, pozorované 0,28; 0.30–0.50: n 37, p̄ 0,38, pozorované 0,54; 0.50–0.70: n 24, p̄ 0,59, pozorované 0,83; 0.70–0.90: n 19, p̄ 0,77, pozorované 0,89; 0.90–1.00: n 1, p̄ 0,91, pozorované 1,00

IFS 9 km single 23 h, cenzurované normálne: 0.00–0.05: n 563, p̄ 0,00, pozorované 0,00; 0.05–0.15: n 23, p̄ 0,09, pozorované 0,13; 0.15–0.30: n 15, p̄ 0,23, pozorované 0,13; 0.30–0.50: n 25, p̄ 0,41, pozorované 0,32; 0.50–0.70: n 9, p̄ 0,60, pozorované 0,44; 0.70–0.90: n 8, p̄ 0,80, pozorované 0,63; 0.90–1.00: n 3, p̄ 0,97, pozorované 0,33

IFS 9 km single 23 h, dvojdielne: 0.00–0.05: n 580, p̄ 0,00, pozorované 0,01; 0.05–0.15: n 14, p̄ 0,09, pozorované 0,14; 0.15–0.30: n 27, p̄ 0,22, pozorované 0,30; 0.30–0.50: n 15, p̄ 0,37, pozorované 0,33; 0.50–0.70: n 7, p̄ 0,56, pozorované 0,57; 0.70–0.90: n 3, p̄ 0,79, pozorované 0,33

IFS 9 km single 71 h, cenzurované normálne: 0.00–0.05: n 552, p̄ 0,00, pozorované 0,00; 0.05–0.15: n 33, p̄ 0,09, pozorované 0,12; 0.15–0.30: n 31, p̄ 0,21, pozorované 0,19; 0.30–0.50: n 15, p̄ 0,39, pozorované 0,33; 0.50–0.70: n 8, p̄ 0,61, pozorované 0,50; 0.70–0.90: n 6, p̄ 0,78, pozorované 0,50; 0.90–1.00: n 1, p̄ 1,00, pozorované 0,00

IFS 9 km single 71 h, dvojdielne: 0.00–0.05: n 567, p̄ 0,00, pozorované 0,00; 0.05–0.15: n 33, p̄ 0,10, pozorované 0,21; 0.15–0.30: n 23, p̄ 0,21, pozorované 0,26; 0.30–0.50: n 14, p̄ 0,40, pozorované 0,43; 0.50–0.70: n 7, p̄ 0,55, pozorované 0,29; 0.70–0.90: n 2, p̄ 0,76, pozorované 0,50

## Krok 3c – zákon podľa predstihu (IFS 9 km, dvojdielne rozdelenie, fyzika = dnešné pravidlo)

Namiesto šiestich voľných parametrov na každý predstih jeden fit cez všetky predstihy 23–131 h, koeficienty lineárne v predstihu (dni od 23 h). Overenie zima proti zime; skóre na primárnej vzorke po predstihoch aj zlúčené. Voľba: najjednoduchší zákon do 0,01 CRPSS od najlepšieho.

| Zákon | BSS 23 h | BSS 35 h | BSS 47 h | BSS 59 h | BSS 71 h | BSS 83 h | BSS 95 h | BSS 107 h | BSS 119 h | BSS 131 h | **BSS zlúčené** (95 % CI) | **CRPSS zlúčené** (95 % CI) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 6 voľných parametrov na predstih (krok 3b) | 0,26 | 0,26 | 0,19 | 0,25 | 0,21 | 0,12 | 0,09 | 0,13 | 0,10 | -0,13 | – | – |
| h0, h1, b, c lineárne v predstihu; a, d konštantné (10 parametrov) | 0,26 | 0,27 | 0,23 | 0,24 | 0,20 | 0,11 | 0,08 | 0,12 | 0,10 | -0,10 | **0,15 (0,02–0,25)** | **0,36 (0,27–0,41)** |
| … d = 0 (9) | 0,24 | 0,25 | 0,22 | 0,23 | 0,17 | 0,10 | 0,08 | 0,12 | 0,10 | -0,06 | **0,14 (0,03–0,25)** | **0,36 (0,28–0,41)** |
| … h0 konštantné (8) | 0,24 | 0,24 | 0,22 | 0,23 | 0,17 | 0,10 | 0,08 | 0,12 | 0,10 | -0,07 | **0,14 (0,03–0,25)** | **0,36 (0,28–0,41)** |
| … h1 konštantné (7) | 0,24 | 0,24 | 0,22 | 0,23 | 0,17 | 0,10 | 0,08 | 0,12 | 0,10 | -0,07 | **0,14 (0,03–0,25)** | **0,35 (0,28–0,41)** |
| … c konštantné: len b klesá s predstihom (6) | 0,26 | 0,26 | 0,23 | 0,24 | 0,18 | 0,10 | 0,08 | 0,11 | 0,10 | -0,06 | **0,15 (0,04–0,25)** | **0,36 (0,28–0,41)** |
| bez závislosti od predstihu (5) | 0,23 | 0,24 | 0,22 | 0,23 | 0,18 | 0,10 | 0,08 | 0,11 | 0,09 | -0,12 | **0,14 (0,02–0,24)** | **0,35 (0,27–0,41)** |

| Zákon | CRPSS 23 h | CRPSS 35 h | CRPSS 47 h | CRPSS 59 h | CRPSS 71 h | CRPSS 83 h | CRPSS 95 h | CRPSS 107 h | CRPSS 119 h | CRPSS 131 h | h00 | h01 | h10 | h11 | a0 | b0 | b1 | c0 | c1 | d0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 6 voľných parametrov na predstih (krok 3b) | 0,51 | 0,50 | 0,43 | 0,39 | 0,39 | 0,30 | 0,33 | 0,35 | 0,22 | 0,08 | | | | | | | | | | |
| h0, h1, b, c lineárne v predstihu; a, d konštantné (10 parametrov) | 0,51 | 0,50 | 0,46 | 0,40 | 0,39 | 0,30 | 0,33 | 0,35 | 0,22 | 0,10 | -1,49 | 0,06 | 1,23 | -0,13 | 1,29 | 0,59 | -0,01 | 0,53 | 0,07 | 0,12 |
| … d = 0 (9) | 0,50 | 0,50 | 0,46 | 0,40 | 0,39 | 0,29 | 0,33 | 0,35 | 0,23 | 0,12 | -1,49 | 0,06 | 1,23 | -0,13 | 1,38 | 0,58 | -0,03 | 0,74 | 0,06 | 0,00 |
| … h0 konštantné (8) | 0,50 | 0,50 | 0,46 | 0,40 | 0,39 | 0,29 | 0,33 | 0,35 | 0,23 | 0,12 | -1,35 | 0,00 | 1,14 | -0,10 | 1,38 | 0,58 | -0,03 | 0,74 | 0,06 | 0,00 |
| … h1 konštantné (7) | 0,50 | 0,50 | 0,45 | 0,40 | 0,39 | 0,30 | 0,34 | 0,36 | 0,22 | 0,11 | -1,34 | 0,00 | 0,90 | 0,00 | 1,38 | 0,58 | -0,03 | 0,74 | 0,06 | 0,00 |
| … c konštantné: len b klesá s predstihom (6) | 0,50 | 0,50 | 0,46 | 0,40 | 0,39 | 0,30 | 0,34 | 0,35 | 0,22 | 0,10 | -1,34 | 0,00 | 0,90 | 0,00 | 1,42 | 0,57 | -0,03 | 0,89 | 0,00 | 0,00 |
| bez závislosti od predstihu (5) | 0,49 | 0,49 | 0,45 | 0,40 | 0,39 | 0,30 | 0,34 | 0,36 | 0,21 | 0,08 | -1,34 | 0,00 | 0,90 | 0,00 | 1,43 | 0,49 | 0,00 | 0,90 | 0,00 | 0,00 |

Voľba: **… c konštantné: len b klesá s predstihom (6)** – najjednoduchší zákon do 0,01 CRPSS od najlepšieho (0,358), ktorý zachováva pokles sklonu b s predstihom (voľné fity: b 0,69 pri 23 h → 0,25 pri 131 h); zákon bez závislosti od predstihu má v krížovej validácii dvoch zím rovnaké skóre, ale stránka musí extrapolovať tam, kde má vzorka málo udalostí. Koeficienty (fit na oboch zimách): h00 -1,339, h10 0,896, a0 1,419, b0 0,570, b1 -0,032, c0 0,891; referenčný predstih 23 h, platnosť 23–131 h (pod 23 h extrapolácia k predstihu 0, nad 131 h zafixované).

Brána z kroku 2 (primárna vzorka): pri 23 h BSS surového IFS 0,13 (−0,02–0,27) a pravidla −0,04; pri 71–83 h −0,04 až −0,26; pri predstihu 0 deterministicky 0,28–0,30. Dvojdielny model pri 23 h 0,26 (0,01–0,42), pri 71 h 0,21 (0,00–0,37), pri 83 h 0,12 (-0,01–0,22), pri 0 h 0,42 (0,35–0,50).

Spoľahlivosť zvoleného zákona (primárna vzorka, všetky predstihy): 0.00–0.05: n 5780, p̄ 0,00, pozorované 0,01; 0.05–0.15: n 341, p̄ 0,09, pozorované 0,21; 0.15–0.30: n 188, p̄ 0,21, pozorované 0,28; 0.30–0.50: n 114, p̄ 0,39, pozorované 0,30; 0.50–0.70: n 25, p̄ 0,57, pozorované 0,60; 0.70–0.90: n 10, p̄ 0,77, pozorované 0,50; 0.90–1.00: n 2, p̄ 0,90, pozorované 0,00

Spoľahlivosť pri 23–47 h: 0.00–0.05: n 1748, p̄ 0,00, pozorované 0,01; 0.05–0.15: n 71, p̄ 0,10, pozorované 0,18; 0.15–0.30: n 56, p̄ 0,22, pozorované 0,30; 0.30–0.50: n 34, p̄ 0,40, pozorované 0,41; 0.50–0.70: n 20, p̄ 0,58, pozorované 0,45; 0.70–0.90: n 5, p̄ 0,79, pozorované 0,40; 0.90–1.00: n 4, p̄ 0,94, pozorované 0,50

### Rozhodovacia tabuľka pre prah ALERTu p* (zvolený zákon, primárna vzorka, mimo vzorky)

Prah p* = 1 / (N + 1), kde N = koľkokrát horší je zmeškaný powder deň než zbytočná cesta. Počty na stanicu a sezónu = počty delené počtom dvojíc stanica × sezóna vo vzorke.

Predstih 23 h (ráno deň vopred): 646 staničných dní, 24 udalostí, 9 dvojíc stanica × sezóna.

| p* (N) | ALERTov | zásahy | falošné | zmeškané | POD | FAR | ALERTov / stanicu a sezónu | falošných / stanicu a sezónu | zmeškaných / stanicu a sezónu |
|---|---|---|---|---|---|---|---|---|---|
| 0,10 (9) | 61 | 20 | 41 | 4 | 0,83 | 0,67 | 6,8 | 4,6 | 0,4 |
| 0,15 (5,7) | 54 | 18 | 36 | 6 | 0,75 | 0,67 | 6,0 | 4,0 | 0,7 |
| 0,20 (4) | 42 | 18 | 24 | 6 | 0,75 | 0,57 | 4,7 | 2,7 | 0,7 |
| 0,25 (3) | 32 | 14 | 18 | 10 | 0,58 | 0,56 | 3,6 | 2,0 | 1,1 |
| 0,33 (2) | 16 | 7 | 9 | 17 | 0,29 | 0,56 | 1,8 | 1,0 | 1,9 |
| 0,50 (1) | 8 | 5 | 3 | 19 | 0,21 | 0,38 | 0,9 | 0,3 | 2,1 |

Predstih 71 h (tri dni vopred): 646 staničných dní, 24 udalostí, 9 dvojíc stanica × sezóna.

| p* (N) | ALERTov | zásahy | falošné | zmeškané | POD | FAR | ALERTov / stanicu a sezónu | falošných / stanicu a sezónu | zmeškaných / stanicu a sezónu |
|---|---|---|---|---|---|---|---|---|---|
| 0,10 (9) | 45 | 14 | 31 | 10 | 0,58 | 0,69 | 5,0 | 3,4 | 1,1 |
| 0,15 (5,7) | 31 | 10 | 21 | 14 | 0,42 | 0,68 | 3,4 | 2,3 | 1,6 |
| 0,20 (4) | 22 | 9 | 13 | 15 | 0,38 | 0,59 | 2,4 | 1,4 | 1,7 |
| 0,25 (3) | 18 | 8 | 10 | 16 | 0,33 | 0,56 | 2,0 | 1,1 | 1,8 |
| 0,33 (2) | 15 | 7 | 8 | 17 | 0,29 | 0,53 | 1,7 | 0,9 | 1,9 |
| 0,50 (1) | 3 | 2 | 1 | 22 | 0,08 | 0,33 | 0,3 | 0,1 | 2,4 |

ICON-D2: ten istý tvar zákona cez predstih 0 (3551 dní) a 1 deň (1192 dní): h00 -1,594, h10 1,700, a0 0,933, b0 0,875, b1 -0,086, c0 0,727 (sklony na deň predstihu); referenčný predstih 0 h, platnosť 0–47 h. Overenie mimo vzorky je v tabuľkách kroku 3b (0 h LOSO, 1 d zima proti zime).

## Krok 3d – kombinácia IFS 9 km (35 h) + ICON-D2 (pred 1 dňom) na tých istých oknách, dvojdielne rozdelenie

| Vstup | n | udalostí | **BSS** (95 % CI) | CRPSS (95 % CI) | váha ICON-D2 (po zimách) |
|---|---|---|---|---|---|
| len IFS 35 h | 637 | 24 | **0,26 (0,07–0,41)** | 0,50 (0,41–0,57) | 0 |
| len ICON-D2 1 d | 637 | 24 | **0,34 (0,17–0,50)** | 0,55 (0,48–0,61) | 1 |
| vážený priemer úhrnov, váha fitovaná | 637 | 24 | **0,35 (0,17–0,49)** | 0,56 (0,50–0,62) | 0,80 / 0,70 (na všetkom 0,70) |

Zapísané: data/model/powder-model.json
