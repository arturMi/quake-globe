// Reine Funktionen ohne DOM – der Browser nutzt sie, test/data.test.js prüft sie.
import { greatest, median, scalePow, scaleThreshold } from "d3";

const FEED_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/";

// USGS-Feeds nach dem Schema {Stärke}_{Zeitraum}.geojson
export const FEEDS = {
  all_day: { label: "Letzter Tag · alle Stärken", hours: 24 },
  "2.5_week": { label: "Letzte 7 Tage · ab M 2,5", hours: 24 * 7 },
  "4.5_month": { label: "Letzte 30 Tage · ab M 4,5", hours: 24 * 30 },
};
export const DEFAULT_FEED = "4.5_month";

export function feedUrl(key) {
  if (!Object.hasOwn(FEEDS, key)) throw new Error(`Unbekannter Feed: ${key}`);
  return `${FEED_BASE}${key}.geojson`;
}

// GeoJSON der USGS → einfache Objekte, neueste zuerst.
// Einträge ohne ID, Stärke, Zeit oder Position fliegen raus.
export function parseQuakes(geojson) {
  const quakes = [];
  for (const feature of geojson?.features ?? []) {
    const p = feature?.properties ?? {};
    const [lon, lat, depth] = feature?.geometry?.coordinates ?? [];
    if (!feature?.id || ![p.mag, p.time, lon, lat].every(Number.isFinite)) continue;
    quakes.push({
      id: String(feature.id),
      mag: p.mag,
      place: p.place || "Ort unbekannt",
      time: p.time,
      depth: Number.isFinite(depth) ? depth : 0,
      lon,
      lat,
      // Link nur übernehmen, wenn er wirklich zur USGS führt
      url: String(p.url ?? "").startsWith("https://earthquake.usgs.gov/") ? p.url : "",
    });
  }
  return quakes.sort((a, b) => b.time - a.time);
}

// Kennzahlen für die Kacheln
export function summarize(quakes) {
  return {
    count: quakes.length,
    strongest: greatest(quakes, (q) => q.mag) ?? null,
    newest: greatest(quakes, (q) => q.time) ?? null,
    medianDepth: median(quakes, (q) => q.depth) ?? null,
  };
}

// Für die Tabelle: stärkste zuerst, bei gleicher Stärke die jüngeren
export function byMagnitude(quakes) {
  return [...quakes].sort((a, b) => b.mag - a.mag || b.time - a.time);
}

// Herdtiefe in drei Klassen, so wie Seismologen sie einteilen
export const DEPTH_CLASSES = [
  { key: "flach", range: "unter 70 km" },
  { key: "mittel", range: "70–300 km" },
  { key: "tief", range: "ab 300 km" },
];
export const depthClass = scaleThreshold(
  [70, 300],
  DEPTH_CLASSES.map((d) => d.key),
);

// Kreisgröße nach Stärke. Die Magnitude ist logarithmisch (+1 ≈ 32-mal so viel Energie),
// deshalb wächst der Radius quadratisch. Unter M 3 bleibt er bei 4 px, damit man alles sieht.
export const magRadius = scalePow().exponent(2).domain([3, 9]).range([4, 18]).clamp(true);

// Formatierung auf Deutsch
const oneDecimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

export const formatMag = (mag) => `M ${oneDecimal.format(mag)}`;
export const formatCount = (n) => integer.format(n);
export const formatDepth = (km) => `${integer.format(Math.round(km) || 0)} km`;

export function formatCoords(lon, lat) {
  const ns = lat < 0 ? "S" : "N";
  const ew = lon < 0 ? "W" : "O";
  return `${twoDecimals.format(Math.abs(lat))}° ${ns}, ${twoDecimals.format(Math.abs(lon))}° ${ew}`;
}

export function formatAgo(time, now = Date.now()) {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

// Drehung, die [lon, lat] in die Mitte des Globus holt – auf dem kürzeren Weg.
// Sonst würde der Globus von 170° nach −170° fast einmal ganz herumdrehen.
export function rotationTo(lon, lat, [lambda]) {
  const delta = ((((-lon - lambda) % 360) + 540) % 360) - 180;
  return [lambda + delta, -lat, 0];
}

// Nächster Punkt zu (x, y). Ein Treffer zählt im Umkreis minRadius oder innerhalb des Punktradius r.
// Bei Gleichstand gewinnt der spätere Punkt – der liegt beim Zeichnen oben.
export function nearest(points, x, y, minRadius) {
  let best = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= Math.max(minRadius, point.r ?? 0) && distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}
