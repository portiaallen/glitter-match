import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  areAdjacent,
  boardDefinitionsEquivalent,
  compileBoardDocument,
  connectedComponents,
  deserializeBoardDefinition,
  explainInteraction,
  serializeBoardDefinition,
  validateBoardDefinition,
} from "../src/board/index.js";
import { startPlayground } from "../src/lab/playground.js";
import { LAB_FIXTURE_IDS } from "../src/lab/catalog.js";
import { detectMatches, matchedCellIds } from "../src/matching/index.js";
import { canAttemptSwap } from "../src/fairness/index.js";
import { loadLabDocument, pack } from "./helpers.js";

describe("laboratory fixtures load on the generic graph engine", () => {
  it.each([...LAB_FIXTURE_IDS])("compiles %s without shape-specific engine code", (id) => {
    const document = loadLabDocument(id);
    expect(document.purpose).toBe("engine-fixture");
    expect(document.status).toBe("development");
    expect(document).not.toHaveProperty("land");
    const definition = compileBoardDocument(document);
    expect(definition.cells.length).toBeGreaterThan(2);
    const playground = startPlayground({ document, registries: pack(), seed: "lab" });
    expect(playground.board.topology.cellIds.length).toBe(definition.cells.length);
  });

  it("diamond is a graph, not a matrix of hidden holes", () => {
    const playground = startPlayground({ document: loadLabDocument("lab.diamond"), registries: pack(), seed: "x" });
    expect(areAdjacent(playground.board, "w", "e")).toBe(false);
    expect(areAdjacent(playground.board, "w", "c")).toBe(true);
    expect(areAdjacent(playground.board, "n", "s")).toBe(false);
    expect(playground.board.topology.cellIds).toHaveLength(9);
  });

  it("heart cleft cells are visually close but not adjacent", () => {
    const playground = startPlayground({ document: loadLabDocument("lab.heart"), registries: pack(), seed: "x" });
    expect(areAdjacent(playground.board, "lo", "ro")).toBe(false);
    expect(areAdjacent(playground.board, "lt", "rt")).toBe(false);
    expect(areAdjacent(playground.board, "lo", "li")).toBe(true);
    const explanation = explainInteraction(playground.board, "lo", "ro", pack().obstacles);
    expect(explanation.visuallyClose).toBe(true);
    expect(explanation.shareEdge).toBe(false);
    expect(explanation.reasons.join(" ")).toMatch(/visual proximity is not adjacency/i);
    const xs = Object.values(playground.board.topology.cells).map((cell) => cell.position.x);
    const ys = Object.values(playground.board.topology.cells).map((cell) => cell.position.y);
    const bboxCells = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    expect(playground.board.topology.cellIds.length).toBeLessThan(bboxCells);
  });

  it("ring spokes are the only inner-outer links", () => {
    const playground = startPlayground({ document: loadLabDocument("lab.ring"), registries: pack(), seed: "x" });
    expect(areAdjacent(playground.board, "o0", "i0")).toBe(true);
    expect(areAdjacent(playground.board, "o1", "i0")).toBe(false);
    expect(areAdjacent(playground.board, "o0", "o1")).toBe(true);
    expect(areAdjacent(playground.board, "i0", "i1")).toBe(true);
  });

  it("spiral coils that sit near each other are not automatically adjacent", () => {
    const playground = startPlayground({ document: loadLabDocument("lab.spiral"), registries: pack(), seed: "x" });
    expect(areAdjacent(playground.board, "s0", "s1")).toBe(true);
    expect(areAdjacent(playground.board, "s1", "s4")).toBe(false);
    const explain = playground.explain("s1", "s4");
    expect(explain.shareEdge).toBe(false);
  });

  it("twin chambers are logically linked only by the portal", () => {
    const playground = startPlayground({
      document: loadLabDocument("lab.twin-chambers"),
      registries: pack(),
      seed: "x",
    });
    expect(areAdjacent(playground.board, "lc", "rc")).toBe(false);
    expect(areAdjacent(playground.board, "le", "rw", { forSwap: true })).toBe(true);
    const componentsWithoutConsideringPortal = connectedComponents({
      ...compileBoardDocument(loadLabDocument("lab.twin-chambers")),
      portals: [],
      adjacency: compileBoardDocument(loadLabDocument("lab.twin-chambers")).adjacency.filter((edge) => edge.kind !== "portal"),
    });
    expect(componentsWithoutConsideringPortal.length).toBe(2);
  });

  it("islands: closer groups are not necessarily connected", () => {
    const playground = startPlayground({
      document: loadLabDocument("lab.irregular-islands"),
      registries: pack(),
      seed: "x",
    });
    expect(areAdjacent(playground.board, "a2", "b1")).toBe(false);
    expect(areAdjacent(playground.board, "a3", "c1", { forSwap: true })).toBe(true);
    expect(areAdjacent(playground.board, "b3", "c3")).toBe(true);
  });
});

describe("graph-based swapping", () => {
  it("allows swaps only when a topology edge exists, not because of x±1/y±1", () => {
    const playground = startPlayground({
      document: {
        id: "lab.swap-proof",
        status: "development",
        purpose: "engine-fixture",
        title: "swap proof",
        topology: { kind: "custom", connectivity: "optional" },
        cells: [
          { id: "here", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a" },
          { id: "grid-neighbor", position: { x: 1, y: 0 }, initialIcon: "dev.spark-b" },
          { id: "far", position: { x: 9, y: 7 }, initialIcon: "dev.spark-c" },
        ],
        connections: [{ from: "here", to: "far" }],
      },
      registries: pack(),
      seed: "x",
    });
    expect(canAttemptSwap(playground.board, "here", "far", pack().obstacles)).toBe(true);
    expect(canAttemptSwap(playground.board, "here", "grid-neighbor", pack().obstacles)).toBe(false);
    expect(playground.explain("here", "grid-neighbor").coordinateGridAdjacent).toBe(true);
  });
});

describe("matching on irregular topology", () => {
  it("detects horizontal, vertical, diagonal, L, T, and cluster matches from authored edges", () => {
    const playground = startPlayground({ document: loadLabDocument("lab.diamond"), registries: pack(), seed: "x" });

    playground.forceOccupants({ w: "dev.spark-a", c: "dev.spark-a", e: "dev.spark-a", n: "dev.spark-b", s: "dev.spark-c", nw: "dev.spark-b", ne: "dev.spark-c", sw: "dev.spark-c", se: "dev.spark-b" });
    const horizontal = detectMatches(playground.board, playground.matchRules, pack().icons);
    expect(matchedCellIds(horizontal)).toEqual(expect.arrayContaining(["w", "c", "e"]));
    expect(horizontal.some((group) => group.mode === "aligned" || group.mode === "cluster")).toBe(true);

    playground.forceOccupants({ n: "dev.spark-a", c: "dev.spark-a", s: "dev.spark-a", w: "dev.spark-b", e: "dev.spark-c", nw: "dev.spark-b", ne: "dev.spark-c", sw: "dev.spark-c", se: "dev.spark-b" });
    const vertical = detectMatches(playground.board, playground.matchRules, pack().icons);
    expect(matchedCellIds(vertical)).toEqual(expect.arrayContaining(["n", "c", "s"]));

    playground.forceOccupants({ nw: "dev.spark-a", c: "dev.spark-a", se: "dev.spark-a", n: "dev.spark-b", s: "dev.spark-b", w: "dev.spark-c", e: "dev.spark-c", ne: "dev.spark-b", sw: "dev.spark-c" });
    const diagonal = detectMatches(playground.board, playground.matchRules, pack().icons);
    expect(matchedCellIds(diagonal)).toEqual(expect.arrayContaining(["nw", "c", "se"]));

    playground.forceOccupants({ n: "dev.spark-a", c: "dev.spark-a", e: "dev.spark-a", w: "dev.spark-b", s: "dev.spark-c", nw: "dev.spark-b", ne: "dev.spark-c", sw: "dev.spark-c", se: "dev.spark-b" });
    const ell = detectMatches(playground.board, playground.matchRules, pack().icons);
    expect(ell.some((group) => group.pattern === "corner" || group.mode === "cluster")).toBe(true);

    playground.forceOccupants({ w: "dev.spark-a", c: "dev.spark-a", e: "dev.spark-a", s: "dev.spark-a", n: "dev.spark-b", nw: "dev.spark-b", ne: "dev.spark-c", sw: "dev.spark-c", se: "dev.spark-b" });
    const tee = detectMatches(playground.board, playground.matchRules, pack().icons);
    expect(tee.some((group) => group.pattern === "tee" || group.cellIds.length >= 4)).toBe(true);
  });

  it("matches across a portal when the board definition permits it", () => {
    const playground = startPlayground({
      document: loadLabDocument("lab.twin-chambers"),
      registries: pack(),
      seed: "x",
    });
    playground.forceOccupants({
      le: "dev.spark-a",
      rw: "dev.spark-a",
      rc: "dev.spark-a",
      lc: "dev.spark-b",
      ln: "dev.spark-c",
      ls: "dev.spark-b",
      lw: "dev.spark-c",
      lne: "dev.spark-b",
      lse: "dev.spark-c",
      rn: "dev.spark-c",
      re: "dev.spark-b",
      rs: "dev.spark-c",
      rnw: "dev.spark-b",
      rsw: "dev.spark-c",
    });
    const matches = detectMatches(playground.board, playground.matchRules, pack().icons);
    expect(matchedCellIds(matches)).toEqual(expect.arrayContaining(["le", "rw", "rc"]));
  });
});

describe("cascade chain", () => {
  it("reports combo 2 after swap → match → settle → second match, without UI", () => {
    const playground = startPlayground({
      document: loadLabDocument("lab.cascade-chain"),
      registries: pack(),
      seed: "cascade",
    });
    const before = playground.objectiveProgress();
    expect(playground.matches()).toHaveLength(0);
    const result = playground.swap("c3", "side");
    expect(result.ok).toBe(true);
    expect(result.cascade?.combo).toBe(2);
    expect(playground.cascadeCount).toBe(2);
    expect(result.cascade?.steps.map((step) => step.phase)).toContain("move");
    expect(playground.objectiveProgress()?.complete).toBe(true);
    expect(before?.complete).toBe(false);
  });
});

describe("dead boards", () => {
  it("detects no legal moves and recovers deterministically without changing the objective target", () => {
    const a = startPlayground({ document: loadLabDocument("lab.dead-board"), registries: pack(), seed: "recover-me" });
    const b = startPlayground({ document: loadLabDocument("lab.dead-board"), registries: pack(), seed: "recover-me" });
    expect(a.isDead()).toBe(true);
    expect(a.legalMoves()).toEqual([]);
    expect(a.objectiveProgress()?.target).toBe(9999);
    const recoveredA = a.recoverIfDead();
    const recoveredB = b.recoverIfDead();
    expect(recoveredA.recovered).toBe(true);
    expect(recoveredB).toEqual(recoveredA);
    expect(a.isDead()).toBe(false);
    expect(a.objectiveProgress()?.target).toBe(9999);
    expect(a.objectiveProgress()?.complete).toBe(false);
  });
});

describe("deterministic seeded fill", () => {
  it("reproduces identical occupancy for the same seed and differs for another seed", () => {
    const a = startPlayground({ document: loadLabDocument("lab.seeded-fill"), registries: pack(), seed: "alpha" });
    const b = startPlayground({ document: loadLabDocument("lab.seeded-fill"), registries: pack(), seed: "alpha" });
    const c = startPlayground({ document: loadLabDocument("lab.seeded-fill"), registries: pack(), seed: "beta" });
    const icons = (p: typeof a) =>
      Object.fromEntries(
        p.board.topology.cellIds.map((id) => [
          id,
          p.board.cells[id]?.occupant.type === "icon" ? p.board.cells[id]?.occupant.iconId : null,
        ]),
      );
    expect(icons(a)).toEqual(icons(b));
    expect(icons(a)).not.toEqual(icons(c));
  });
});

describe("board serialization and validation", () => {
  it("round-trips every laboratory definition", () => {
    for (const id of LAB_FIXTURE_IDS) {
      const definition = compileBoardDocument(loadLabDocument(id));
      const again = deserializeBoardDefinition(serializeBoardDefinition(definition));
      expect(boardDefinitionsEquivalent(definition, again)).toBe(true);
      const playground = startPlayground({ document: loadLabDocument(id), registries: pack(), seed: "round" });
      const replay = startPlayground({ document: loadLabDocument(id), registries: pack(), seed: "round" });
      expect(playground.inspect().icons).toEqual(replay.inspect().icons);
    }
  });

  it("fails loudly on duplicate ids, self-edges, bad refs, and unreachable cells", () => {
    const duplicate = validateBoardDefinition({
      topology: { kind: "linear" },
      cells: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "a", position: { x: 1, y: 0 } },
      ],
      adjacency: [{ from: "a", to: "a" }],
    });
    expect(duplicate.some((item) => item.code === "cell.duplicate_id")).toBe(true);
    expect(duplicate.some((item) => item.code === "edge.self")).toBe(true);

    const missing = validateBoardDefinition({
      topology: { kind: "linear" },
      cells: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 1, y: 0 } },
      ],
      adjacency: [{ from: "a", to: "ghost" }],
    });
    expect(missing.some((item) => item.code === "edge.unknown_to")).toBe(true);

    const unreachable = validateBoardDefinition({
      topology: { kind: "linear", connectivity: "required" },
      cells: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 1, y: 0 } },
        { id: "c", position: { x: 8, y: 8 } },
      ],
      adjacency: [{ from: "a", to: "b" }],
    });
    expect(unreachable.some((item) => item.code === "board.unreachable")).toBe(true);

    const portal = validateBoardDefinition({
      topology: { kind: "portal-connected" },
      cells: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 4, y: 0 } },
      ],
      adjacency: [],
      portals: [{ id: "p", from: "a", to: "missing" }],
    });
    expect(portal.some((item) => item.code === "portal.unknown_to")).toBe(true);

    const cyclicFlow = validateBoardDefinition({
      topology: { kind: "custom" },
      cells: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 1, y: 0 } },
      ],
      adjacency: [{ from: "a", to: "b" }],
      flow: [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
      movement: { mode: "along-flow", refill: { mode: "none" } },
    });
    expect(cyclicFlow.some((item) => item.code === "flow.cycle")).toBe(true);
  });

  it("does not scan a coordinate bounding box of empty space", () => {
    const started = performance.now();
    const playground = startPlayground({
      document: {
        id: "lab.sparse",
        status: "development",
        purpose: "engine-fixture",
        title: "sparse",
        topology: { kind: "custom" },
        cells: [
          { id: "near", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a" },
          { id: "far", position: { x: 10000, y: 10000 }, initialIcon: "dev.spark-a" },
        ],
        connections: [{ from: "near", to: "far" }],
      },
      registries: pack(),
      seed: "sparse",
    });
    const matches = playground.matches();
    const elapsed = performance.now() - started;
    expect(playground.board.topology.cellIds).toHaveLength(2);
    expect(matchedCellIds(matches)).toEqual([]);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("engine has no named-shape special cases", () => {
  it("does not mention heart/spiral/ring matchers in the matcher source", () => {
    const source = readFileSync("src/matching/detect.ts", "utf8") + readFileSync("src/cascade/pipeline.ts", "utf8");
    expect(source).not.toMatch(/heartBoard|spiralBoard|ringBoard|if \(shape/);
  });
});
