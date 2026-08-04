// Zeitachse: jedes Beben ein Punkt – nach rechts die Zeit, nach oben die Stärke
import {
  axisBottom,
  axisLeft,
  extent,
  pointer,
  scaleLinear,
  scaleTime,
  select,
  timeDay,
  timeHour,
  timeMonday,
  transition,
} from "d3";
import { depthClass, nearest } from "./data.js";

const HEIGHT = 200;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 36 };
const DOT_RADIUS = 4;
const HOVER_PX = 12;

// Um Mitternacht das Datum anzeigen, sonst die Uhrzeit
const dayFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const hourFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const tickFormat = (date) => (date.getHours() || date.getMinutes() ? hourFormat : dayFormat).format(date);

// Jeden zweiten Tag – gezählt ab einem festen Datum, damit am Monatsanfang
// nicht zwei Striche direkt nebeneinander landen (31.10. und 01.11.)
const everyOtherDay = timeDay.filter((date) => timeDay.count(new Date(2000, 0, 1), date) % 2 === 0);

// Abstand der Achsenbeschriftung: Stunden, Tage oder Wochen – je nach Zeitraum und Breite
function tickInterval([start, end], width) {
  const days = (end - start) / 86_400_000;
  const narrow = width < 600;
  if (days <= 1) return timeHour.every(narrow ? 6 : 3);
  if (days <= 7) return narrow ? everyOtherDay : timeDay;
  return timeMonday;
}

export function createTimeline(container, { onHover, onSelect }) {
  const svg = select(container).append("svg").attr("height", HEIGHT);
  const grid = svg.append("g").attr("class", "grid");
  const xAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`);
  const yAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(${MARGIN.left},0)`);
  const dots = svg.append("g");
  const hoverRing = svg.append("circle").attr("class", "ring ring-hover").attr("r", DOT_RADIUS + 3);
  const selectedRing = svg.append("circle").attr("class", "ring ring-selected").attr("r", DOT_RADIUS + 4);

  const x = scaleTime();
  const y = scaleLinear().range([HEIGHT - MARGIN.bottom, MARGIN.top]);
  let quakes = [];
  let hovered = null;
  let selected = null;
  let width = 0;

  function placeRing(ring, q) {
    ring.attr("display", q ? null : "none");
    if (q) ring.attr("cx", x(q.time)).attr("cy", y(q.mag));
  }

  function draw(duration = 0) {
    if (!width) return;
    svg.attr("width", width).attr("viewBox", `0 0 ${width} ${HEIGHT}`);
    x.range([MARGIN.left, width - MARGIN.right]);

    xAxis.call(
      axisBottom(x)
        .ticks(tickInterval(x.domain(), width))
        .tickFormat(tickFormat)
        .tickSizeOuter(0),
    );
    yAxis
      .call(
        axisLeft(y)
          .ticks(5)
          .tickFormat((m) => m.toLocaleString("de-DE"))
          .tickSize(0)
          .tickPadding(8),
      )
      .call((g) => g.select(".domain").remove());
    grid
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", MARGIN.left)
      .attr("x2", width - MARGIN.right)
      .attr("y1", (m) => y(m))
      .attr("y2", (m) => y(m));

    // Neue Punkte steigen von der Grundlinie auf ihre Stärke
    dots
      .selectAll("circle")
      .data(quakes, (q) => q.id)
      .join((enter) =>
        enter
          .append("circle")
          .attr("r", DOT_RADIUS)
          .attr("cx", (q) => x(q.time))
          .attr("cy", y.range()[0]),
      )
      .attr("class", (q) => `dot depth-${depthClass(q.depth)}`)
      .transition(transition("dots").duration(duration))
      .attr("cx", (q) => x(q.time))
      .attr("cy", (q) => y(q.mag));

    placeRing(hoverRing, hovered);
    placeRing(selectedRing, selected);
  }

  function quakeAt(event) {
    const [mx, my] = pointer(event);
    const points = quakes.map((q) => ({ x: x(q.time), y: y(q.mag), quake: q }));
    return nearest(points, mx, my, HOVER_PX)?.quake ?? null;
  }

  svg
    .on("pointermove", (event) => {
      const q = quakeAt(event);
      if (q !== hovered) {
        hovered = q;
        placeRing(hoverRing, q);
        svg.classed("over-quake", Boolean(q));
      }
      onHover(q, event);
    })
    .on("pointerleave", () => {
      hovered = null;
      placeRing(hoverRing, null);
      onHover(null);
    })
    .on("click", (event) => {
      const q = quakeAt(event);
      if (q) onSelect(q);
    });

  // Breite folgt dem Container, z. B. beim Drehen des Handys
  new ResizeObserver(([entry]) => {
    const newWidth = Math.floor(entry.contentRect.width);
    if (newWidth !== width) {
      width = newWidth;
      draw();
    }
  }).observe(container);

  function setData(next, [start, end]) {
    quakes = next;
    hovered = null;
    x.domain([start, end]);
    const [low = 0, high = 1] = extent(quakes, (q) => q.mag);
    y.domain([Math.floor(low), Math.max(Math.ceil(high), Math.floor(low) + 1)]);
    draw(matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600);
  }

  function setSelected(q) {
    selected = q;
    placeRing(selectedRing, q);
  }

  return { setData, setSelected };
}
