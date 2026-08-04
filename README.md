# QuakeGlobe

![CI](https://github.com/arturMi/quake-globe/actions/workflows/ci.yml/badge.svg)

Erdbeben weltweit auf einem drehbaren Globus. Gebaut mit D3, die Daten kommen live von der USGS.

## Was man sieht

- Einen Globus, den man mit der Maus dreht. Lässt man ihn in Ruhe, dreht er sich langsam selbst.
- Jedes Beben ist ein Kreis: Je größer, desto stärker. Die Farbe zeigt, wie tief es war.
- Auf Wunsch die Grenzen der Erdplatten. Die meisten Beben liegen genau darauf.
- Klick auf ein Beben: Der Globus dreht es in die Mitte, rechts stehen die Details.
- Darunter eine Zeitachse (Stärke über Zeit) und eine Tabelle mit allen Ereignissen.
- Alle 5 Minuten neue Daten. Hell- und Dunkelmodus richten sich nach dem System.

## Datenquelle

Die USGS (United States Geological Survey) stellt Erdbeben als GeoJSON bereit, kostenlos und ohne API-Key:

```
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson
```

Das Schema ist `{Stärke}_{Zeitraum}.geojson`, die App nutzt `all_day`, `2.5_week` und `4.5_month`. Die Daten sind gemeinfrei.

## Starten

```bash
npm install
npm run dev      # http://localhost:5173
npm test         
npm run build    # fertige Seite in dist/
```

Mit Docker:

```bash
docker compose up --build   # http://localhost:8080
```


## Plattengrenzen neu erzeugen

```bash
curl -LO https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json
npx mapshaper PB2002_boundaries.json -filter-fields -simplify 25% keep-shapes \
  -rename-layers boundaries -o format=topojson quantization=10000 src/plates.json
```

## Ideen für später

- Zoom und Suche nach Ort
- Ausgewähltes Beben in der URL, damit man Links teilen kann
- Canvas statt SVG für „alle Beben der letzten 30 Tage“ (rund 10.000 Punkte)
- Ältere Daten über die FDSN-Schnittstelle der USGS, z. B. alle Beben ab M 6 seit 1990