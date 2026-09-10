import { parseBoardDocument, type BoardDocument } from "../src/board/document.js";
import { inspectPrimitiveOnBoard, type LabPrimitiveRecipe } from "../src/lab/index.js";
import { createPrimitiveRuntime, type PrimitiveRuntime } from "../src/primitives/index.js";
import { startPlayground, type BoardPlayground } from "../src/lab/playground.js";
import { GraphAuthoringSession } from "../src/lab/authoring.js";
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
  direction: document.querySelector("#layer-direction") as HTMLInputElement,
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
const authorPanel = document.querySelector("#author-panel") as HTMLElement;
const authorErrors = document.querySelector("#author-errors") as HTMLElement;
const boardJson = document.querySelector("#board-json") as HTMLTextAreaElement;
const snapInput = document.querySelector("#snap") as HTMLInputElement;
const edgeDirection = document.querySelector("#edge-direction") as HTMLInputElement;
const edgeTraversal = document.querySelector("#edge-traversal") as HTMLSelectElement;
const cellIdInput = document.querySelector("#cell-id") as HTMLInputElement;
const primitiveRecipe = document.querySelector("#primitive-recipe") as HTMLSelectElement;
const primitiveOut = document.querySelector("#primitive-out") as HTMLElement;

let current = FIXTURES[0]!;
let playground = load(current);
let author = GraphAuthoringSession.fromDocument(current);
let selected: string[] = [];
let mode: "play" | "author" = "play";
let drag: { id: string } | null = null;
let primitiveRuntime: PrimitiveRuntime | null = null;
let primitiveSelection: string[] = [];

function load(document: BoardDocument): BoardPlayground {
  primitiveRuntime = null;
  primitiveSelection = [];
  if (primitiveOut) {
    primitiveOut.textContent = "No primitive triggered. Engine fixtures only.";
  }
  return startPlayground({ document, registries: pack, seed: seedInput.value || "lab-seed" });
}

function toSvg(x: number, y: number): { x: number; y: number } {
  return { x: x * SCALE, y: y * SCALE };
}

function currentTool(): string {
  return (document.querySelector('input[name="author-tool"]:checked') as HTMLInputElement | null)?.value ?? "select";
}

function isAuthor(): boolean {
  return mode === "author";
}

function positions(): Record<string, { x: number; y: number }> {
  if (isAuthor()) {
    return Object.fromEntries(author.cells().map((cell) => [cell.id, cell.position]));
  }
  const inspection = playground.inspect();
  return inspection.positions;
}

function cellIds(): string[] {
  return isAuthor() ? author.cells().map((cell) => cell.id) : playground.inspect().cellIds;
}

function render(): void {
  const ids = cellIds();
  const posMap = positions();
  const inspection = isAuthor() ? null : playground.inspect();
  const matched = new Set(inspection?.matches.flatMap((group) => group.cellIds) ?? []);
  const legal = new Set(inspection?.validMoves.flatMap((move) => [move.a, move.b]) ?? []);
  const xs = ids.length ? ids.map((id) => toSvg(posMap[id]?.x ?? 0, 0).x) : [0, SCALE * 6];
  const ys = ids.length ? ids.map((id) => toSvg(0, posMap[id]?.y ?? 0).y) : [0, SCALE * 6];
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

  const defs = add("defs", {});
  defs.innerHTML = `
    <marker id="arrow-edge" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#7ad7ff" />
    </marker>
    <marker id="arrow-flow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffa257" />
    </marker>
    <marker id="arrow-portal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#d48cff" />
    </marker>
  `;

  const drawLink = (
    from: string,
    to: string,
    style: { stroke: string; dash?: string; marker: string; width: string; label?: string },
  ) => {
    const a = toSvg(posMap[from]!.x, posMap[from]!.y);
    const b = toSvg(posMap[to]!.x, posMap[to]!.y);
    add("line", {
      x1: String(a.x),
      y1: String(a.y),
      x2: String(b.x),
      y2: String(b.y),
      stroke: style.stroke,
      "stroke-width": style.width,
      "stroke-dasharray": style.dash ?? "0",
      "stroke-linecap": "round",
      "marker-end": `url(#${style.marker})`,
    });
    if (layers.direction.checked && style.label) {
      add("text", {
        x: String((a.x + b.x) / 2),
        y: String((a.y + b.y) / 2 - 6),
        fill: "#f4f1ea",
        "font-size": "11",
        "text-anchor": "middle",
      }).textContent = style.label;
    }
  };

  if (isAuthor()) {
    if (layers.edges.checked) {
      for (const edge of author.connections()) {
        const oneWay = (edge.traversal ?? (edge.bidirectional === false ? "forward" : "both")) === "forward";
        drawLink(edge.from, edge.to, {
          stroke: "#7ad7ff",
          width: "2",
          marker: "arrow-edge",
          dash: oneWay ? "8 4" : "0",
          label: [edge.direction, edge.orientation, oneWay ? "one-way" : "both"].filter(Boolean).join(" · "),
        });
      }
    }
    if (layers.portals.checked) {
      for (const portal of author.portals()) {
        drawLink(portal.from, portal.to, {
          stroke: "#d48cff",
          width: "4",
          marker: "arrow-portal",
          dash: "6 6",
          label: `portal ${portal.id}`,
        });
      }
    }
    if (layers.flow.checked) {
      for (const edge of author.flow()) {
        drawLink(edge.from, edge.to, {
          stroke: "#ffa257",
          width: "2",
          marker: "arrow-flow",
          dash: "2 6",
          label: `flow${edge.kind ? `:${edge.kind}` : ""}`,
        });
      }
    }
  } else if (inspection && (layers.edges.checked || layers.portals.checked || layers.flow.checked)) {
    const seen = new Set<string>();
    for (const from of inspection.cellIds) {
      for (const edge of inspection.directed[from] ?? []) {
        const key = `${from}->${edge.to}:${edge.kind}`;
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
        drawLink(from, edge.to, {
          stroke: portal ? "#d48cff" : bridge ? "#f0b429" : "#7ad7ff",
          width: portal || bridge ? "4" : "2",
          marker: portal ? "arrow-portal" : "arrow-edge",
          dash: portal ? "6 6" : "0",
          label: edge.direction,
        });
      }
    }
    if (layers.flow.checked) {
      for (const [from, tos] of Object.entries(inspection.flow)) {
        for (const to of tos) {
          drawLink(from, to, { stroke: "#ffa257", width: "2", marker: "arrow-flow", dash: "2 6", label: "flow" });
        }
      }
    }
  }

  for (const id of ids) {
    const pos = toSvg(posMap[id]!.x, posMap[id]!.y);
    const iconId = isAuthor()
      ? author.cells().find((cell) => cell.id === id)?.initialIcon
      : inspection?.icons[id];
    const mark = iconId ? ICON_MARK[iconId] ?? { letter: "?", pattern: "□", fill: "#888" } : { letter: "·", pattern: "", fill: "#2a3144" };
    const group = add("g", { class: "cell-hit", tabindex: "0", role: "button", "aria-label": `Cell ${id}` });
    if (!isAuthor() && layers.matches.checked && matched.has(id)) {
      add("circle", {
        cx: String(pos.x),
        cy: String(pos.y),
        r: String(RADIUS + (layers.reduced.checked ? 6 : 8)),
        fill: "none",
        stroke: "#7dffa3",
        "stroke-width": layers.reduced.checked ? "2" : "3",
      });
    }
    if (!isAuthor() && layers.moves.checked && legal.has(id)) {
      add("circle", {
        cx: String(pos.x),
        cy: String(pos.y),
        r: String(RADIUS + 4),
        fill: "none",
        stroke: "#e8d26a",
        "stroke-dasharray": "3 3",
      });
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
    label.textContent = isAuthor() ? id : `${mark.pattern}${mark.letter}`;
    group.append(label);
    if (layers.ids.checked && !isAuthor()) {
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
      const p = posMap[id]!;
      coord.textContent = `${p.x},${p.y}`;
      group.append(coord);
    }
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      onCell(id);
    });
    group.addEventListener("pointerdown", (event) => {
      if (isAuthor() && currentTool() === "select") {
        drag = { id };
        (event.currentTarget as SVGElement).setPointerCapture((event as PointerEvent).pointerId);
      }
    });
    group.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== id) {
        return;
      }
      const board = clientToBoard(event as PointerEvent);
      author.moveCell(id, board.x, board.y, snapInput.checked ? 1 : undefined);
      render();
    });
    group.addEventListener("pointerup", () => {
      drag = null;
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onCell(id);
      }
      if (isAuthor() && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        author.deleteCell(id);
        selected = selected.filter((item) => item !== id);
        refreshAuthor();
      }
    });
    canvas.append(group);
  }

  if (!isAuthor() && inspection) {
    matchesEl.textContent = inspection.matches.length
      ? inspection.matches.map((group) => `${group.mode} ${group.colorIconId}: ${group.cellIds.join(", ")}`).join("\n")
      : "(none)";
    movesEl.textContent = inspection.validMoves.length
      ? inspection.validMoves.map((move) => `${move.a} ↔ ${move.b}`).join("\n")
      : "(none)";
    cascadeEl.textContent = `count: ${inspection.cascadeCount}\ndead: ${inspection.deadBoard}\nseed: ${inspection.seed}`;
    objectiveEl.textContent = inspection.objective ? JSON.stringify(inspection.objective, null, 2) : "(no demo objective on this fixture)";
    notesEl.textContent = current.notes ?? "";
    statusEl.textContent = `${current.title} · ${inspection.cellIds.length} cells · topology ${inspection.topologyKind} · graph, not a grid`;
  } else {
    refreshAuthorStatus();
  }
}

function refreshAuthorStatus(): void {
  const issues = author.validate();
  const errors = issues.filter((item) => item.severity === "error");
  authorErrors.textContent = issues.length
    ? issues.map((item) => `${item.severity.toUpperCase()} ${item.path}: ${item.message}`).join("\n")
    : "No validation issues.";
  statusEl.textContent = `Authoring ${author.draft.title} · ${author.cells().length} cells · ${author.connections().length} edges · ${errors.length} error(s)`;
  notesEl.textContent = "Authoring helper: graph edges are explicit. Snap is visual only.";
}

function refreshAuthor(): void {
  boardJson.value = JSON.stringify(author.exportDocument(), null, 2);
  render();
}

function clientToBoard(event: PointerEvent | MouseEvent): { x: number; y: number } {
  const pt = canvas.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const ctm = canvas.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x / SCALE, y: loc.y / SCALE };
}

function onCell(id: string): void {
  if (isAuthor()) {
    onAuthorCell(id);
    return;
  }
  if (selected[0] === id) {
    selected = [];
    whyEl.textContent = "";
    render();
    return;
  }
  selected = selected.length === 1 ? [selected[0]!, id] : [id];
  primitiveSelection = [...selected];
  if (selected.length === 2) {
    const [a, b] = selected;
    const explanation = playground.explain(a!, b!);
    whyEl.textContent = explanation.reasons.join("\n");
    const result = playground.swap(a!, b!);
    statusEl.textContent = result.ok
      ? `Swap ${a} ↔ ${b} resolved. Cascade ${result.cascade?.combo ?? 0}.`
      : result.reason ?? "Illegal swap";
    if (result.ok) {
      selected = [];
    }
  }
  render();
}

function onAuthorCell(id: string): void {
  const tool = currentTool();
  if (tool === "delete") {
    author.deleteCell(id);
    selected = [];
    refreshAuthor();
    return;
  }
  if (tool === "select") {
    selected = [id];
    cellIdInput.value = id;
    whyEl.textContent = `Selected ${id}. Drag to move. Visual position is not adjacency.`;
    render();
    return;
  }
  if (selected[0] === id) {
    selected = [];
    render();
    return;
  }
  selected = selected.length === 1 ? [selected[0]!, id] : [id];
  if (selected.length === 2) {
    const [a, b] = selected;
    if (tool === "connect") {
      author.addEdge(a!, b!, {
        direction: edgeDirection.value || undefined,
        traversal: edgeTraversal.value === "forward" ? "forward" : "both",
      });
      whyEl.textContent = `Authored edge ${a} → ${b}.`;
    } else if (tool === "flow") {
      author.addFlow(a!, b!, "gravity");
      whyEl.textContent = `Authored flow ${a} → ${b}. Visual down is not gravity.`;
    } else if (tool === "portal") {
      author.addPortal(a!, b!);
      whyEl.textContent = `Authored portal ${a} ↔ ${b}.`;
    }
    selected = [];
    refreshAuthor();
    return;
  }
  render();
}

function setMode(next: "play" | "author"): void {
  mode = next;
  authorPanel.hidden = next !== "author";
  if (next === "author") {
    author = GraphAuthoringSession.fromDocument(structuredClone(current));
    refreshAuthor();
  } else {
    render();
  }
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
      if (isAuthor()) {
        author = GraphAuthoringSession.fromDocument(structuredClone(current));
        refreshAuthor();
      } else {
        mountList();
        render();
      }
      mountList();
    });
    item.append(button);
    fixtureList.append(item);
  }
}

canvas.addEventListener("click", (event) => {
  if (!isAuthor() || currentTool() !== "add") {
    return;
  }
  if ((event.target as Element).closest(".cell-hit")) {
    return;
  }
  const board = clientToBoard(event);
  const id = author.addCell({
    position: snapInput.checked ? { x: Math.round(board.x), y: Math.round(board.y) } : board,
  });
  whyEl.textContent = `Added cell ${id}.`;
  refreshAuthor();
});

for (const input of Object.values(layers)) {
  input?.addEventListener("change", render);
}
document.querySelector("#mode-play")?.addEventListener("change", () => setMode("play"));
document.querySelector("#mode-author")?.addEventListener("change", () => setMode("author"));
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
document.querySelector("#run-primitive")?.addEventListener("click", () => {
  if (isAuthor()) {
    primitiveOut.textContent = "Switch to Play / inspect to trigger primitives on a fixture.";
    return;
  }
  primitiveRuntime ??= createPrimitiveRuntime(playground.board);
  const recipe = primitiveRecipe.value as LabPrimitiveRecipe;
  const inspection = inspectPrimitiveOnBoard(playground.board, recipe, primitiveSelection, primitiveRuntime);
  playground.board = primitiveRuntime.board;
  primitiveOut.textContent = [
    inspection.ok ? "OK" : "FAILED",
    inspection.explanation.what,
    inspection.explanation.why,
    inspection.explanation.failure ? `Failure: ${inspection.explanation.failure}` : "",
    inspection.region ? `Region: ${inspection.region.join(", ")}` : "",
    inspection.path ? `Path: ${inspection.path.join(" → ")}` : "",
    `Cells: ${inspection.explanation.changedCells.join(", ") || "none"}`,
    `Edges: ${inspection.explanation.changedEdges.join(", ") || "none"}`,
  ]
    .filter(Boolean)
    .join("\n");
  statusEl.textContent = `Primitive ${recipe} ${inspection.ok ? "applied" : "rejected"}.`;
  render();
});
document.querySelector("#export-board")?.addEventListener("click", () => {
  boardJson.value = JSON.stringify(author.exportDocument(), null, 2);
  statusEl.textContent = "Exported current graph to JSON.";
});
document.querySelector("#import-board")?.addEventListener("click", () => {
  try {
    author.importJson(boardJson.value);
    current = author.exportDocument();
    statusEl.textContent = `Imported ${author.draft.id}.`;
    refreshAuthor();
  } catch (error) {
    authorErrors.textContent = error instanceof Error ? error.message : String(error);
  }
});
document.querySelector("#apply-author")?.addEventListener("click", () => {
  const result = author.compileResult();
  if (!result.ok) {
    refreshAuthorStatus();
    statusEl.textContent = "Fix validation errors before playing this graph.";
    return;
  }
  current = author.exportDocument();
  playground = load(current);
  (document.querySelector("#mode-play") as HTMLInputElement).checked = true;
  setMode("play");
});
document.querySelector("#connect-nearby")?.addEventListener("click", () => {
  const created = author.connectNearby(1.25, {
    direction: edgeDirection.value || undefined,
    traversal: edgeTraversal.value === "forward" ? "forward" : "both",
  });
  whyEl.textContent = created.length
    ? `Created ${created.length} authored edge(s). Inspect or delete them like any other edge.`
    : "No nearby pairs. This never auto-connects on move.";
  refreshAuthor();
});
for (const input of document.querySelectorAll('input[name="author-tool"]')) {
  input.addEventListener("change", () => {
    selected = [];
    render();
  });
}
cellIdInput?.addEventListener("change", () => {
  const currentId = selected[0];
  const next = cellIdInput.value.trim();
  if (!currentId || !next || next === currentId) {
    return;
  }
  try {
    author.renameCell(currentId, next);
    selected = [next];
    refreshAuthor();
  } catch (error) {
    authorErrors.textContent = error instanceof Error ? error.message : String(error);
  }
});

mountList();
render();
