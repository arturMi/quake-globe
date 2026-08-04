import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_FEED,
  FEEDS,
  byMagnitude,
  depthClass,
  feedUrl,
  formatAgo,
  formatCoords,
  formatDepth,
  formatMag,
  magRadius,
  nearest,
  parseQuakes,
  rotationTo,
  summarize,
} from "../src/data.js";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 9, 12, 0);

// Ausschnitt im Format des USGS-Feeds, gekürzt auf die genutzten Felder
function feature(id, properties, coordinates) {
  return {
    type: "Feature",
    id,
    properties: {
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
      ...properties,
    },
    geometry: { type: "Point", coordinates },
  };
}

const sample = {
  type: "FeatureCollection",
  metadata: { generated: NOW, count: 4 },
  features: [
    feature("us1", { mag: 4.6, place: "Tonga", time: NOW - 5 * HOUR }, [-175.2, -21.1, 412.3]),
    feature("ak2", { mag: 6.1, place: "Alaska Peninsula", time: NOW - 2 * HOUR }, [-157.8, 55.2, 35]),
    feature("ci3", { mag: 1.2, place: "Mojave", time: NOW - 1 * HOUR }, [-117.5, 35.0, -0.4]),
    feature("xx4", { mag: null, place: "ohne Stärke", time: NOW - 3 * HOUR }, [10, 10, 10]),
  ],
};

test("feedUrl baut die USGS-Adresse für jeden Feed", () => {
  assert.ok(Object.hasOwn(FEEDS, DEFAULT_FEED));
  assert.equal(
    feedUrl("4.5_month"),
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
  );
  for (const key of Object.keys(FEEDS)) assert.match(feedUrl(key), /\.geojson$/);
});

test("feedUrl lehnt unbekannte Feeds ab, auch Namen aus dem Prototyp", () => {
  assert.throws(() => feedUrl("all_year"), /Unbekannter Feed/);
  assert.throws(() => feedUrl("toString"), /Unbekannter Feed/);
});

test("parseQuakes übernimmt die Felder und sortiert neueste zuerst", () => {
  const quakes = parseQuakes(sample);
  assert.deepEqual(
    quakes.map((q) => q.id),
    ["ci3", "ak2", "us1"],
  );
  const alaska = quakes[1];
  assert.equal(alaska.mag, 6.1);
  assert.equal(alaska.lon, -157.8);
  assert.equal(alaska.lat, 55.2);
  assert.equal(alaska.depth, 35);
  assert.equal(alaska.place, "Alaska Peninsula");
});

test("parseQuakes überspringt Ereignisse ohne Stärke und verträgt leere Eingaben", () => {
  assert.ok(!parseQuakes(sample).some((q) => q.id === "xx4"));
  assert.deepEqual(parseQuakes(undefined), []);
  assert.deepEqual(parseQuakes({}), []);
});

test("parseQuakes übernimmt nur Links zur USGS", () => {
  const evil = feature("ev5", { mag: 3, place: "x", time: NOW, url: "javascript:alert(1)" }, [0, 0, 5]);
  const [quake] = parseQuakes({ features: [evil] });
  assert.equal(quake.url, "");
  assert.match(parseQuakes(sample)[0].url, /^https:\/\/earthquake\.usgs\.gov\//);
});

test("summarize liefert Anzahl, stärkstes und jüngstes Beben und Median-Tiefe", () => {
  const summary = summarize(parseQuakes(sample));
  assert.equal(summary.count, 3);
  assert.equal(summary.strongest.id, "ak2");
  assert.equal(summary.newest.id, "ci3");
  assert.equal(summary.medianDepth, 35);
});

test("summarize kommt mit einer leeren Liste zurecht", () => {
  assert.deepEqual(summarize([]), { count: 0, strongest: null, newest: null, medianDepth: null });
});

test("byMagnitude sortiert nach Stärke und verändert die Eingabe nicht", () => {
  const quakes = parseQuakes(sample);
  assert.deepEqual(
    byMagnitude(quakes).map((q) => q.id),
    ["ak2", "us1", "ci3"],
  );
  assert.equal(quakes[0].id, "ci3");
});

test("depthClass teilt nach Herdtiefe ein: unter 70 km, 70–300 km, ab 300 km", () => {
  assert.equal(depthClass(-0.4), "flach");
  assert.equal(depthClass(69.9), "flach");
  assert.equal(depthClass(70), "mittel");
  assert.equal(depthClass(299), "mittel");
  assert.equal(depthClass(300), "tief");
  assert.equal(depthClass(650), "tief");
});

test("magRadius: mindestens 4 px, wächst mit der Stärke, höchstens 18 px", () => {
  assert.equal(magRadius(0.5), 4);
  assert.equal(magRadius(3), 4);
  assert.ok(magRadius(5) < magRadius(6) && magRadius(6) < magRadius(7));
  assert.equal(magRadius(9.5), 18);
});

test("Formatierung auf Deutsch", () => {
  assert.equal(formatMag(4.6), "M 4,6");
  assert.equal(formatMag(5), "M 5,0");
  assert.equal(formatDepth(412.3), "412 km");
  assert.equal(formatDepth(-0.4), "0 km");
  assert.equal(formatCoords(-175.2, -21.1), "21,10° S, 175,20° W");
  assert.equal(formatCoords(13.4, 52.5), "52,50° N, 13,40° O");
});

test("formatAgo nennt Minuten, Stunden und Tage", () => {
  assert.equal(formatAgo(NOW - 20_000, NOW), "gerade eben");
  assert.equal(formatAgo(NOW - 5 * 60_000, NOW), "vor 5 Min.");
  assert.equal(formatAgo(NOW - 3 * HOUR, NOW), "vor 3 Std.");
  assert.equal(formatAgo(NOW - 30 * HOUR, NOW), "vor 1 Tag");
  assert.equal(formatAgo(NOW - 72 * HOUR, NOW), "vor 3 Tagen");
});

test("rotationTo nimmt den kürzeren Weg über die Datumsgrenze", () => {
  assert.deepEqual(rotationTo(-170, 10, [170, 0]), [170, -10, 0]);
  assert.deepEqual(rotationTo(170, 10, [170, 0]), [190, -10, 0]);
  assert.deepEqual(rotationTo(90, -30, [0, 0]), [-90, 30, 0]);
});

test("nearest findet den nächsten Punkt im Umkreis, große Kreise zählen ganz", () => {
  const points = [
    { id: "a", x: 0, y: 0, r: 4 },
    { id: "b", x: 30, y: 0, r: 20 },
  ];
  assert.equal(nearest(points, 2, 2, 12).id, "a");
  assert.equal(nearest(points, 48, 0, 12).id, "b");
  assert.equal(nearest(points, 0, 60, 12), null);
});
