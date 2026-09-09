import { parseBoardDocument, type BoardDocument } from "../src/board/document.js";
import { startPlayground, type BoardPlayground } from "../src/lab/playground.js";
import { createDevelopmentPack } from "../src/content/packs.js";
import diamond from "../data/lab/diamond.json";
import heart from "../data/lab/heart.json";
import ring from "../data/lab/ring.json";
import spiral from "../data/lab/spiral.json";
import twin from "../data/lab/twin-chambers.json";
import islands from "../data/lab/irregular-islands.json";
import cascade from "../data/lab/cascade-chain.json";
import dead from "../data/lab/dead-board.json";
import seeded from "../data/lab/seeded-fill.json";

const FIXTURES = [diamond, heart, ring, spiral, twin, islands, cascade, dead, seeded].map((raw) =>
  parseBoardDocument(raw),
);
const pack = createDevelopmentPack();
const SCALE = 56;
const RADIUS = 22;

const ICON_MARK: Record<string, { letter: string; pattern: string; fill: string }> = {
  "dev.spark-a": { letter: "A", pattern: "△", fill: "#5ec8ff" },
  "dev.spark-b": { letter: "B", pattern: "○", fill: "#ff7ab6" },
  "dev.spark-c": { letter: "C", pattern: "◇", fill: "#b6ff6a" },
  glitter: { letter: "G", pattern: "✦", fill: "#ffe27a" },
};

const layers = {
  ids: document.querySelector("#layer-ids") as HTMLInputElement,
  bounds: document.querySelector("#layer-bounds") as HTMLInputElement,
  edges: document.querySelector("#layer-edges") as HTMLInputElement,
  portals: document.querySelector("#layer-portals") as HTMLInputElement,
  coords: document.querySelector("#layer-coords") as HTMLInputElement,
  matches: document.querySelector("#layer-matches") as HTMLInputElement,
  moves: document.querySelector("#layer-moves") as HTMLInputElement,
  flow: document.querySelector("#layer-flow") as HTMLInputElement,
  reduced: document.querySelector("#reduced-motion") as HTMLInputElement,
};

const seedInput = document.querySelector("#seed") as HTMLInputElement;
const canvas = document.querySelector("#canvas") as SVGSVGElement;
const fixtureList = document.querySelector("#fixture-list") as HTMLUListElement;
const whyEl = document.querySelector("#why") as HTMLElement;
const matchesEl = document.querySelector("#matches") as HTMLElement;
const movesEl = document.querySelector("#moves") as HTMLElement;
const cascadeEl = document.querySelector("#cascade") as HTMLElement;
const objectiveEl = document.querySelector("#objective") as HTMLElement;
const notesEl = document.querySelector("#notes") as HTMLElement;
const statusEl = document.querySelector("#status") as HTMLElement;

let current = FIXTURES[0]!;
let playground = load(current);
let selected: string[] = [];

function load(document: BoardDocument): BoardPlayground {
  return startPlayground({ document, registries: pack, seed: seedInput.value || "lab-seed" });
}

function toSvg(x: number, y: number): { x: number; y: number } {
  return { x: x * SCALE, y: y * SCALE };
}

function render(): void {
  const board = playground.board;
  const inspection = playground.inspect();
  const matched = new Set(inspection.matches.flatMap((group) => group.cellIds));
  const legal = new Set(inspection.validMoves.flatMap((move) => [move.a, move.b]));
  const xs = inspection.cellIds.map((id) => toSvg(inspection.positions[id]!.x, 0).x);
  const ys = inspection.cellIds.map((id) => toSvg(0, inspection.positions[id]!.y).y);
  const pad = 80;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  canvas.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
  canvas.replaceChildren();

  const ns = "http://www.w3.org/2000/svg";
  const add = (name: string, attrs: Record<string, string>) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
    canvas.append(node);
    return node;
  };

  if (layers.edges.checked || layers.portals.checked || layers.flow.checked) {
    const seen = new Set<string>();
    for (const from of inspection.cellIds) {
      for (const edge of inspection.directed[from] ?? []) {
        const key = [from, edge.to].sort().join("::");
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const portal = edge.kind === "portal";
        const bridge = edge.kind === "bridge";
        if (portal && !layers.portals.checked) {
          continue;
        }
        if (!portal && !layers.edges.checked && !bridge) {
          continue;
        }
        const a = toSvg(inspection.positions[from]!.x, inspection.positions[from]!.y);
        const b = toSvg(inspection.positions[edge.to]!.x, inspection.positions[edge.to]!.y);
        add("line", {
          x1: String(a.x),
          y1: String(a.y),
          x2: String(b.x),
          y2: String(b.y),
          stroke: portal ? "#d48cff" : bridge ? "#f0b429" : "#7ad7ff",
          "stroke-width": portal || bridge ? "4" : "2",
          "stroke-dasharray": portal ? "6 6" : "0",
          "stroke-linecap": "round",
        });
      }
    }
    if (layers.flow.checked) {
      for (const [from, tos] of Object.entries(inspection.flow)) {
        for (const to of tos) {
          const a = toSvg(inspection.positions[from]!.x, inspection.positions[from]!.y);
          const b = toSvg(inspection.positions[to]!.x, inspection.positions[to]!.y);
          add("line", {
            x1: String(a.x),
            y1: String(a.y),
            x2: String(b.x),
            y2: String(b.y),
            stroke: "#ffa257",
            "stroke-width": "2",
            "marker-end": "url(#unused)",
            opacity: "0.7",
          });
        }
      }
    }
  }

  for (const id of inspection.cellIds) {
    const pos = toSvg(inspection.positions[id]!.x, inspection.positions[id]!.y);
    const iconId = inspection.icons[id];
    const mark = iconId ? ICON_MARK[iconId] ?? { letter: "?", pattern: "□", fill: "#888" } : { letter: "·", pattern: "", fill: "#2a3144" };
    const group = add("g", { class: "cell-hit", tabindex: "0", role: "button", "aria-label": `Cell ${id}` });
    if (layers.matches.checked && matched.has(id) && !layers.reduced.checked) {
      add("circle", { cx: String(pos.x), cy: String(pos.y), r: String(RADIUS + 8), fill: "none", stroke: "#7dffa3", "stroke-width": "3" });
    } else if (layers.matches.checked && matched.has(id)) {
      add("circle", { cx: String(pos.x), cy: String(pos.y), r: String(RADIUS + 6), fill: "none", stroke: "#7dffa3", "stroke-width": "2" });
    }
    if (layers.moves.checked && legal.has(id)) {
      add("circle", { cx: String(pos.x), cy: String(pos.y), r: String(RADIUS + 4), fill: "none", stroke: "#e8d26a", "stroke-dasharray": "3 3" });
    }
    const cellShape = document.createElementNS(ns, "circle");
    cellShape.setAttribute("cx", String(pos.x));
    cellShape.setAttribute("cy", String(pos.y));
    cellShape.setAttribute("r", String(RADIUS));
    cellShape.setAttribute("fill", mark.fill);
    cellShape.setAttribute("stroke", selected.includes(id) ? "#fff" : "#0b0d12");
    cellShape.setAttribute("stroke-width", selected.includes(id) ? "4" : layers.bounds.checked ? "2" : "0");
    group.append(cellShape);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(pos.x));
    label.setAttribute("y", String(pos.y + 5));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "#111");
    label.setAttribute("font-size", "13");
    label.setAttribute("font-weight", "700");
    label.textContent = `${mark.pattern}${mark.letter}`;
    group.append(label);
    if (layers.ids.checked) {
      const idText = document.createElementNS(ns, "text");
      idText.setAttribute("x", String(pos.x));
      idText.setAttribute("y", String(pos.y - RADIUS - 6));
      idText.setAttribute("text-anchor", "middle");
      idText.setAttribute("fill", "#f4f1ea");
      idText.setAttribute("font-size", "11");
      idText.textContent = id;
      group.append(idText);
    }
    if (layers.coords.checked) {
      const coord = document.createElementNS(ns, "text");
      coord.setAttribute("x", String(pos.x));
      coord.setAttribute("y", String(pos.y + RADIUS + 14));
      coord.setAttribute("text-anchor", "middle");
      coord.setAttribute("fill", "#b7b3c9");
      coord.setAttribute("font-size", "10");
      const p = inspection.positions[id]!;
      coord.textContent = `${p.x},${p.y}`;
      group.append(coord);
    }
    group.addEventListener("click", () => onCell(id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onCell(id);
      }
    });
    canvas.append(group);
  }

  matchesEl.textContent = inspection.matches.length
    ? inspection.matches.map((group) => `${group.mode} ${group.colorIconId}: ${group.cellIds.join(", ")}`).join("\n")
    : "(none)";
  movesEl.textContent = inspection.validMoves.length
    ? inspection.validMoves.map((move) => `${move.a} ↔ ${move.b}`).join("\n")
    : "(none)";
  cascadeEl.textContent = `count: ${inspection.cascadeCount}\ndead: ${inspection.deadBoard}`;
  objectiveEl.textContent = inspection.objective ? JSON.stringify(inspection.objective, null, 2) : "(no demo objective on this fixture)";
  notesEl.textContent = current.notes ?? "";
  statusEl.textContent = `${current.title} · ${inspection.cellIds.length} cells · topology ${inspection.topologyKind} · graph, not a grid`;
}

function onCell(id: string): void {
  if (selected[0] === id) {
    selected = [];
    whyEl.textContent = "";
    render();
    return;
  }
  selected = selected.length === 1 ? [selected[0]!, id] : [id];
  if (selected.length === 2) {
    const [a, b] = selected;
    const explanation = playground.explain(a!, b!);
    whyEl.textContent = explanation.reasons.join("\n");
    const result = playground.swap(a!, b!);
    statusEl.textContent = result.ok
      ? `Swap ${a} ↔ ${b} resolved. Cascade ${result.cascade?.combo ?? 0}.`
      : result.reason ?? "Illegal swap";
    if (!result.ok) {
      // keep selection for the why-panel; do not clear
    } else {
      selected = [];
    }
  }
  render();
}

function mountList(): void {
  fixtureList.replaceChildren();
  for (const fixture of FIXTURES) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${fixture.title}\n${fixture.shape ?? fixture.topology.kind}`;
    button.setAttribute("aria-current", fixture.id === current.id ? "true" : "false");
    button.addEventListener("click", () => {
      current = fixture;
      selected = [];
      whyEl.textContent = "";
      playground = load(current);
      mountList();
      render();
    });
    item.append(button);
    fixtureList.append(item);
  }
}

for (const input of Object.values(layers)) {
  input.addEventListener("change", render);
}
document.querySelector("#reseed")?.addEventListener("click", () => {
  playground = load(current);
  selected = [];
  render();
});
document.querySelector("#resolve")?.addEventListener("click", () => {
  const report = playground.resolveNow();
  statusEl.textContent = `Cascade ${report.combo}.`;
  render();
});
document.querySelector("#recover")?.addEventListener("click", () => {
  const result = playground.recoverIfDead();
  statusEl.textContent = result.recovered ? `Recovered in ${result.attempts} shuffle(s).` : "Recovery failed.";
  render();
});

mountList();
render();
