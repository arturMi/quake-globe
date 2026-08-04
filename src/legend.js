// Legende: Farbe = Herdtiefe, Größe = Stärke, Linie = Plattengrenze
import { select } from "d3";
import { DEPTH_CLASSES, magRadius } from "./data.js";

const SIZE_EXAMPLES = [3, 5, 7];

export function drawLegend(container) {
  const root = select(container);

  const depth = root.append("div").attr("class", "legend-group");
  depth.append("span").attr("class", "legend-title").text("Herdtiefe");
  const depthItems = depth
    .selectAll(null)
    .data(DEPTH_CLASSES)
    .join("span")
    .attr("class", (d) => `legend-item depth-${d.key}`);
  depthItems.append("span").attr("class", "swatch");
  depthItems.append("span").text((d) => `${d.key} (${d.range})`);

  const size = root.append("div").attr("class", "legend-group");
  size.append("span").attr("class", "legend-title").text("Stärke");
  const sizeItems = size.selectAll(null).data(SIZE_EXAMPLES).join("span").attr("class", "legend-item");
  sizeItems
    .append("svg")
    .attr("class", "size-key")
    .attr("width", (m) => 2 * magRadius(m) + 2)
    .attr("height", (m) => 2 * magRadius(m) + 2)
    .append("circle")
    .attr("cx", (m) => magRadius(m) + 1)
    .attr("cy", (m) => magRadius(m) + 1)
    .attr("r", (m) => magRadius(m));
  sizeItems.append("span").text((m) => `M ${m}`);

  const plates = root.append("div").attr("class", "legend-group");
  const plateItem = plates.append("span").attr("class", "legend-item");
  plateItem
    .append("svg")
    .attr("class", "plates-key")
    .attr("width", 18)
    .attr("height", 10)
    .append("line")
    .attr("x1", 1)
    .attr("x2", 17)
    .attr("y1", 5)
    .attr("y2", 5);
  plateItem.append("span").text("Plattengrenze");

  return { showPlates: (on) => plates.attr("hidden", on ? null : "") };
}
