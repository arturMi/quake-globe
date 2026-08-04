// Hier kommt alles zusammen: Daten laden, Globus, Zeitachse, Kacheln, Tabelle, Details
import "./style.css";
import { select } from "d3";
import {
  DEFAULT_FEED,
  FEEDS,
  byMagnitude,
  depthClass,
  feedUrl,
  formatAgo,
  formatCoords,
  formatCount,
  formatDepth,
  formatMag,
  parseQuakes,
  summarize,
} from "./data.js";
import { createGlobe } from "./globe.js";
import { drawLegend } from "./legend.js";
import { createTimeline } from "./timeline.js";

const REFRESH_MINUTES = 5;
const TABLE_ROWS = 10;

const $ = (id) => document.getElementById(id);
const clock = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

const state = { feed: DEFAULT_FEED, quakes: [], selected: null, showAllRows: false, request: 0 };

const legend = drawLegend($("legend"));
const globe = createGlobe($("globe"), {
  onHover: showTooltip,
  onSelect: selectQuake,
  onSpinChange: (on) => $("spin").setAttribute("aria-pressed", String(on)),
});
const timeline = createTimeline($("timeline"), { onHover: showTooltip, onSelect: selectQuake });

// Bedienung
for (const [key, feed] of Object.entries(FEEDS)) {
  $("feed").append(new Option(feed.label, key, false, key === state.feed));
}
$("feed").addEventListener("change", (event) => {
  state.feed = event.target.value;
  load();
});
$("plates").addEventListener("change", (event) => {
  globe.showPlates(event.target.checked);
  legend.showPlates(event.target.checked);
});
$("spin").addEventListener("click", () => globe.setSpinning(!globe.isSpinning()));
$("show-all").addEventListener("click", () => {
  state.showAllRows = !state.showAllRows;
  renderTable();
});

// Daten laden: beim Start, beim Wechsel des Zeitraums und dann alle 5 Minuten
let nextLoad;
async function load() {
  clearTimeout(nextLoad);
  const request = ++state.request;
  document.body.classList.add("loading");
  let ok = false;
  try {
    const response = await fetch(feedUrl(state.feed), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    if (request !== state.request) return; // inzwischen wurde ein anderer Zeitraum gewählt
    show(parseQuakes(geojson), geojson.metadata?.generated ?? Date.now());
    ok = true;
  } catch (error) {
    if (request !== state.request) return;
    const reason = error.name === "TimeoutError" ? "Zeitüberschreitung" : error.message;
    setStatus(`USGS gerade nicht erreichbar (${reason}). Neuer Versuch in 1 Minute.`, true);
  } finally {
    if (request === state.request) {
      document.body.classList.remove("loading");
      nextLoad = setTimeout(load, (ok ? REFRESH_MINUTES : 1) * 60_000);
    }
  }
}

function show(quakes, generated) {
  const hours = FEEDS[state.feed].hours;
  state.quakes = quakes;
  // Auswahl behalten, wenn das Beben auch in den neuen Daten steckt
  state.selected = quakes.find((q) => q.id === state.selected?.id) ?? null;

  globe.setData(quakes);
  globe.setSelected(state.selected);
  timeline.setData(quakes, [new Date(generated - hours * 3_600_000), new Date(generated)]);
  timeline.setSelected(state.selected);
  renderStats();
  renderTable();
  renderDetails();
  setStatus(`${formatCount(quakes.length)} Ereignisse · Stand ${clock.format(generated)} Uhr`);
}

function selectQuake(q) {
  state.selected = q;
  globe.setSelected(q);
  timeline.setSelected(q);
  globe.flyTo(q);
  renderDetails();
  renderTable();
  // Auf dem Handy kann der Globus gerade außerhalb des Bildschirms liegen
  const box = $("globe").getBoundingClientRect();
  if (box.bottom < 0 || box.top > innerHeight) $("globe").scrollIntoView({ block: "center" });
}

function renderStats() {
  const { count, strongest, newest, medianDepth } = summarize(state.quakes);
  $("stat-count").textContent = formatCount(count);
  $("stat-strongest").textContent = strongest ? formatMag(strongest.mag) : "–";
  setSubline("stat-strongest-place", strongest?.place);
  $("stat-newest").textContent = newest ? formatAgo(newest.time) : "–";
  setSubline("stat-newest-place", newest?.place);
  $("stat-depth").textContent = medianDepth === null ? "–" : formatDepth(medianDepth);
}

function setSubline(id, text = "") {
  $(id).textContent = text;
  $(id).title = text; // voller Text beim Darüberfahren, falls er abgeschnitten ist
}

function renderTable() {
  const sorted = byMagnitude(state.quakes);
  const rows = state.showAllRows ? sorted : sorted.slice(0, TABLE_ROWS);
  select("#quake-rows")
    .selectAll("tr")
    .data(rows, (q) => q.id)
    .join("tr")
    .classed("selected", (q) => q.id === state.selected?.id)
    .on("click", (event, q) => selectQuake(q))
    .each(function (q) {
      const button = el("button", q.place, "row-button");
      button.type = "button";
      this.replaceChildren(
        cell([el("span", "", `swatch depth-${depthClass(q.depth)}`), formatMag(q.mag)]),
        cell([button]),
        cell([formatDepth(q.depth)], "num"),
        cell([formatAgo(q.time)], "num"),
      );
    })
    .order();

  $("show-all").hidden = sorted.length <= TABLE_ROWS;
  $("show-all").textContent = state.showAllRows ? "Weniger anzeigen" : `Alle ${formatCount(sorted.length)} anzeigen`;
}

function renderDetails() {
  const q = state.selected;
  $("details-empty").hidden = Boolean(q);
  $("details-body").hidden = !q;
  if (!q) return;

  $("details-title").textContent = q.place;
  const rows = [
    ["Stärke", formatMag(q.mag)],
    ["Zeit", `${dateTime.format(q.time)} (${formatAgo(q.time)})`],
    ["Herdtiefe", `${formatDepth(q.depth)} · ${depthClass(q.depth)}`],
    ["Position", formatCoords(q.lon, q.lat)],
  ];
  $("details-list").replaceChildren(...rows.flatMap(([term, value]) => [el("dt", term), el("dd", value)]));
  $("details-link").hidden = !q.url;
  $("details-link").href = q.url || "#";
}

// Tooltip für Globus und Zeitachse
const tooltip = $("tooltip");
let tooltipQuake = null;

function showTooltip(q, event) {
  if (!q) {
    tooltip.hidden = true;
    tooltipQuake = null;
    return;
  }
  if (q !== tooltipQuake) {
    tooltipQuake = q;
    tooltip.replaceChildren(
      el("strong", formatMag(q.mag)),
      el("span", q.place),
      el("span", `${formatAgo(q.time)} · ${formatDepth(q.depth)} tief`),
    );
  }
  tooltip.hidden = false;
  const { width, height } = tooltip.getBoundingClientRect();
  const left = event.clientX + 16 + width > innerWidth ? event.clientX - 16 - width : event.clientX + 16;
  const top = event.clientY + 16 + height > innerHeight ? event.clientY - 16 - height : event.clientY + 16;
  tooltip.style.left = `${Math.max(4, left)}px`;
  tooltip.style.top = `${Math.max(4, top)}px`;
}

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

// Texte aus der API immer per textContent einsetzen, nie als HTML
function el(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

function cell(children, className = "") {
  const td = document.createElement("td");
  td.className = className;
  td.append(...children); // Strings werden hier zu reinen Textknoten
  return td;
}

// „vor 5 Min.“ usw. aktuell halten
setInterval(() => {
  renderStats();
  renderTable();
  renderDetails();
}, 30_000);

load();
