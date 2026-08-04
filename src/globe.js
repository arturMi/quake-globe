// Der Globus: Kugelprojektion, mit der Maus drehen, dreht sich sonst langsam selbst.
// Klick auf ein Beben holt es in die Mitte.
import {
  drag,
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
  interpolate,
  pointer,
  select,
  sort,
  timer,
  transition,
} from "d3";
import { feature, mesh } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { depthClass, magRadius, nearest, rotationTo } from "./data.js";
import plates from "./plates.json";

const SIZE = 600; // Zeichenfläche in viewBox-Einheiten, CSS skaliert sie
const SPIN_SPEED = 0.006; // Grad pro Millisekunde, also 6° pro Sekunde
const HOVER_PX = 12; // Hover-Fläche um jeden Punkt, in Bildschirm-Pixeln

export function createGlobe(svgElement, { onHover, onSelect, onSpinChange }) {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const svg = select(svgElement).attr("viewBox", `0 0 ${SIZE} ${SIZE}`);

  const projection = geoOrthographic()
    .fitExtent([[6, 6], [SIZE - 6, SIZE - 6]], { type: "Sphere" })
    .rotate([-10, -25]); // Start mit Blick auf Europa und Afrika
  const path = geoPath(projection);

  // Grundkarte, von hinten nach vorne
  const sphere = svg.append("path").attr("class", "sphere").datum({ type: "Sphere" });
  const graticule = svg.append("path").attr("class", "graticule").datum(geoGraticule10());
  const land = svg.append("path").attr("class", "land").datum(feature(world, world.objects.land));
  const borders = svg
    .append("path")
    .attr("class", "borders")
    .datum(mesh(world, world.objects.countries, (a, b) => a !== b));
  const plateLines = svg.append("path").attr("class", "plates").datum(mesh(plates));
  const baseLayers = [sphere, graticule, land, borders, plateLines];

  const quakeLayer = svg.append("g");
  const hoverRing = svg.append("path").attr("class", "ring ring-hover");
  const selectedRing = svg.append("path").attr("class", "ring ring-selected");

  let quakes = [];
  let hovered = null;
  let selected = null;
  let spinning = !reduceMotion;
  let pointerInside = false;

  // Ein Beben als Kreis. Liegt es auf der Rückseite, liefert d3-geo null – dann wird nichts gezeichnet.
  function circle(q, extra = 0) {
    return path.pointRadius(magRadius(q.mag) + extra)({ type: "Point", coordinates: [q.lon, q.lat] });
  }

  function render() {
    for (const layer of baseLayers) layer.attr("d", path);
    quakeLayer.selectAll("path").attr("d", (q) => circle(q));
    hoverRing.attr("d", hovered ? circle(hovered, 3) : null);
    selectedRing.attr("d", selected ? circle(selected, 5) : null);
  }

  // Welches Beben liegt unter dem Zeiger? Nur die Vorderseite zählt.
  function quakeAt(event) {
    const [mx, my] = pointer(event, svgElement);
    const [lambda, phi] = projection.rotate();
    const unitsPerPx = SIZE / svgElement.getBoundingClientRect().width;
    const visible = [];
    for (const q of quakes) {
      if (geoDistance([q.lon, q.lat], [-lambda, -phi]) > Math.PI / 2) continue;
      const [x, y] = projection([q.lon, q.lat]);
      visible.push({ x, y, r: magRadius(q.mag), quake: q });
    }
    return nearest(visible, mx, my, HOVER_PX * unitsPerPx)?.quake ?? null;
  }

  function setHovered(q) {
    if (q === hovered) return;
    hovered = q;
    svg.classed("over-quake", Boolean(q));
    hoverRing.attr("d", q ? circle(q, 3) : null);
  }

  svg
    .on("pointerenter", () => {
      pointerInside = true;
    })
    .on("pointerleave", () => {
      pointerInside = false;
      setHovered(null);
      onHover(null);
    })
    .on("pointermove", (event) => {
      if (svg.classed("dragging")) return;
      const q = quakeAt(event);
      setHovered(q);
      onHover(q, event);
    })
    .on("click", (event) => {
      const q = quakeAt(event);
      if (q) onSelect(q);
    })
    .call(
      drag()
        .clickDistance(4) // kleines Zittern beim Klicken zählt nicht als Ziehen
        .on("drag", (event) => {
          if (!svg.classed("dragging")) {
            svg.classed("dragging", true);
            setHovered(null);
            onHover(null);
          }
          const degreesPerPx = 180 / svgElement.getBoundingClientRect().width;
          const [lambda, phi] = projection.rotate();
          projection.rotate([
            lambda + event.dx * degreesPerPx,
            Math.max(-90, Math.min(90, phi - event.dy * degreesPerPx)),
          ]);
          render();
        })
        .on("end", () => svg.classed("dragging", false)),
    );

  // Langsames Eigendrehen – Pause, solange der Zeiger auf dem Globus ist
  let last = 0;
  timer((elapsed) => {
    const dt = Math.min(elapsed - last, 50); // nach einem Tab-Wechsel nicht springen
    last = elapsed;
    if (!spinning || pointerInside) return;
    const [lambda, phi] = projection.rotate();
    projection.rotate([lambda + dt * SPIN_SPEED, phi]);
    render();
  });

  function setSpinning(on) {
    spinning = on;
    onSpinChange(on);
  }

  // Dreht das Beben auf dem kürzesten Weg in die Mitte.
  // transition wird bewusst aus "d3" importiert: Sonst wirft der Bundler d3-transition beim
  // Tree-Shaking raus, und selection.transition() fehlt im fertigen Build.
  function flyTo(q) {
    setSpinning(false);
    const rotate = interpolate(projection.rotate(), rotationTo(q.lon, q.lat, projection.rotate()));
    transition("fly")
      .duration(reduceMotion ? 0 : 1000)
      .tween("rotate", () => (t) => {
        projection.rotate(rotate(t));
        render();
      });
  }

  function setData(next) {
    // Große Beben zuerst zeichnen, damit kleine obenauf liegen und klickbar bleiben
    quakes = sort(next, (a, b) => b.mag - a.mag);
    quakeLayer
      .selectAll("path")
      .data(quakes, (q) => q.id)
      .join("path")
      .attr("class", (q) => `quake depth-${depthClass(q.depth)}`)
      .order();
    setHovered(null);
    render();
  }

  function setSelected(q) {
    selected = q;
    selectedRing.attr("d", q ? circle(q, 5) : null);
  }

  onSpinChange(spinning);
  render();

  return {
    setData,
    setSelected,
    flyTo,
    setSpinning,
    isSpinning: () => spinning,
    showPlates: (on) => plateLines.attr("display", on ? null : "none"),
  };
}
