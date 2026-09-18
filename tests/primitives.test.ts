import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBoard } from "../src/board/index.js";
import { createRandomSource } from "../src/random/index.js";
import {
  applyEffectBatch,
  comparePrimitiveRuntime,
  createPrimitiveRegistry,
  createPrimitiveRuntime,
  detectEffectConflicts,
  discoverRegion,
  drawInt,
  evaluateCondition,
  findPath,
  graphEdgeKey,
  inspectPrimitiveOnBoard,
  PRIMITIVE_IDS,
  runPrimitiveHarness,
  serializePrimitiveRuntime,
  tickTemporaryStates,
  validatePath,
} from "../src/primitives/index.js";
import { SPECIAL_ICON_IDS } from "../src/special-icons/index.js";
import { GLITTER_ICON_ID } from "../src/ids.js";

function lineBoard() {
  return {
    topology: { kind: "linear" as const, notes: "primitive harness graph" },
    cells: [
      { id: "a", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a" },
      { id: "b", position: { x: 1, y: 0 }, initialIcon: "dev.spark-b" },
      { id: "c", position: { x: 2, y: 0 }, initialIcon: "dev.spark-c" },
    ],
    adjacency: [
      { from: "a", to: "b", direction: "along", allowsMatch: true, allowsSwap: true },
      { from: "b", to: "c", direction: "along", allowsMatch: true, allowsSwap: true },
    ],
  };
}

describe("mechanic primitives", () => {
  it("registers Land-neutral primitives without land branching", () => {
    const registry = createPrimitiveRegistry();
    expect(registry.list().map((item) => item.id)).toEqual([...PRIMITIVE_IDS]);
    expect(registry.get("topology-mutation").deterministic.hiddenRandomness).toBe(false);
    const source =
      readFileSync("src/primitives/batch.ts", "utf8") +
      readFileSync("src/primitives/graph.ts", "utf8") +
      readFileSync("src/primitives/compose.ts", "utf8");
    expect(source).not.toMatch(/if\s*\(\s*land\s*===\s*["'`]/);
  });

  it("runs a state transition with typed conditions and explicit effects", () => {
    const result = runPrimitiveHarness({
      board: lineBoard(),
      trigger: { kind: "move", cellIds: ["a", "b"] },
      transition: {
        id: "idle-to-lit",
        from: "idle",
        to: "lit",
        trigger: "move",
        condition: {
          type: "and",
          of: [
            { type: "cell-contains-icon", cellId: "a", iconId: "dev.spark-a" },
            { type: "not", of: { type: "never" } },
          ],
        },
        effects: [{ kind: "change-cell-state", cellIds: ["a"], cellState: "revealed" }],
      },
      expectedTransitionState: "lit",
      expectedEffects: [{ kind: "change-cell-state" }],
    });
    expect(result.ok).toBe(true);
    expect(result.explanation.trigger?.kind).toBe("move");
  });

  it("keeps allowsMatch and allowsSwap independent", () => {
    const runtime = createPrimitiveRuntime(createBoard(lineBoard()));
    const key = graphEdgeKey("a", "b");
    const result = applyEffectBatch(runtime, [
      { kind: "change-edge-state", edgeKey: key, edgePatch: { allowsMatch: false } },
    ]);
    expect(result.ok).toBe(true);
    expect(runtime.edges[key]?.allowsMatch).toBe(false);
    expect(runtime.edges[key]?.allowsSwap).toBe(true);
  });

  it("rejects invalid batches without mutating state", () => {
    const runtime = createPrimitiveRuntime(createBoard(lineBoard()));
    const before = serializePrimitiveRuntime(runtime);
    const failed = applyEffectBatch(runtime, [
      { kind: "swap-occupants", from: "a", to: "b" },
      { kind: "change-occupant", cellIds: ["ghost"], occupant: { type: "icon", iconId: "dev.spark-a" } },
    ]);
    expect(failed.ok).toBe(false);
    expect(serializePrimitiveRuntime(runtime)).toEqual(before);
    expect(failed.explanation.failure).toMatch(/Unknown cell/);
  });

  it("rejects ambiguous effects on the same target", () => {
    const issues = detectEffectConflicts([
      { kind: "disable-edge", edgeKey: "a->b" },
      { kind: "enable-edge", edgeKey: "a->b" },
    ]);
    expect(issues.some((item) => item.code === "primitive.effect_conflict")).toBe(true);
  });

  it("discovers regions and paths from the graph, never x/y", () => {
    const runtime = createPrimitiveRuntime(createBoard(lineBoard()));
    expect(discoverRegion(runtime, "a").cellIds).toEqual(["a", "b", "c"]);
    expect(findPath(runtime, "a", "c").cellIds).toEqual(["a", "b", "c"]);
    expect(validatePath(runtime, ["a", "b", "c"])).toBe(true);
    applyEffectBatch(runtime, [{ kind: "disable-edge", edgeKey: graphEdgeKey("b", "c") }]);
    expect(findPath(runtime, "a", "c").blocked).toBe(true);
  });

  it("supports pairing, sync, temporary state, and thresholds", () => {
    const runtime = createPrimitiveRuntime(createBoard(lineBoard()));
    const ok = applyEffectBatch(runtime, [
      {
        kind: "upsert-relationship",
        relationship: { id: "pair-ab", kind: "cell-cell", a: "a", b: "b", state: "active", lifecycle: "temporary" },
      },
      { kind: "sync-members", syncId: "pair-ab", cellIds: ["a", "b"], cellState: "locked" },
      { kind: "create-temporary", temporary: { id: "glow", kind: "moves", remainingMoves: 1, cellIds: ["a"] } },
      { kind: "advance-threshold", thresholdId: "spark", thresholdDelta: 1 },
    ]);
    expect(ok.ok).toBe(true);
    expect(runtime.relationships["pair-ab"]?.kind).toBe("cell-cell");
    expect(runtime.cells.a?.named).toContain("locked");
    expect(runtime.cells.b?.named).toContain("locked");
    expect(runtime.thresholds.spark?.crossed).toBe(true);
    expect(ok.events.some((event) => event.kind === "threshold-reached")).toBe(true);
    const expired = tickTemporaryStates(runtime);
    expect(expired[0]?.kind).toBe("remove-temporary");
    applyEffectBatch(runtime, expired);
    expect(runtime.temporary.glow).toBeUndefined();
  });

  it("serializes, round-trips, and stays deterministic", () => {
    const first = runPrimitiveHarness({
      board: lineBoard(),
      trigger: { kind: "match" },
      effects: [
        { kind: "swap-occupants", from: "a", to: "c" },
        {
          kind: "presentation-cue",
          cue: {
            announcement: "Swapped ends",
            reducedMotionAlternative: "Instant occupant swap",
            highContrastIndicator: "swap-mark",
          },
        },
      ],
      expectedOccupant: { cellId: "a", iconId: "dev.spark-c" },
    });
    const second = runPrimitiveHarness({
      board: lineBoard(),
      trigger: { kind: "match" },
      effects: [{ kind: "swap-occupants", from: "a", to: "c" }],
    });
    expect(comparePrimitiveRuntime(first.runtime, second.runtime)).toBe(true);
    const snap = serializePrimitiveRuntime(first.runtime);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it("protects Special Icons and the Glitter Icon", () => {
    const runtime = createPrimitiveRuntime(createBoard(lineBoard()));
    const special = applyEffectBatch(runtime, [
      { kind: "change-occupant", cellIds: ["a"], occupant: { type: "icon", iconId: SPECIAL_ICON_IDS[0] } },
    ]);
    expect(special.ok).toBe(false);
    expect(special.issues.some((item) => item.code === "primitive.special_icon")).toBe(true);
    const glitterLand = applyEffectBatch(runtime, [
      {
        kind: "change-occupant",
        cellIds: ["a"],
        occupant: { type: "icon", iconId: GLITTER_ICON_ID },
        payload: { iconId: GLITTER_ICON_ID, landId: "lumina" },
      },
    ]);
    expect(glitterLand.ok).toBe(false);
  });

  it("inspects primitives on a Board Lab fixture without becoming an editor", () => {
    const board = createBoard(lineBoard());
    const locked = inspectPrimitiveOnBoard(board, "lock-selected-cell", ["b"]);
    expect(locked.ok).toBe(true);
    expect(locked.explanation.changedCells).toContain("b");
    const region = inspectPrimitiveOnBoard(board, "region-from-selected", ["a"]);
    expect(region.region).toEqual(["a", "b", "c"]);
    const path = inspectPrimitiveOnBoard(board, "path-between-selected", ["a", "c"]);
    expect(path.path).toEqual(["a", "b", "c"]);
  });

  it("uses seeded randomness only when declared", () => {
    const log: Array<{ kind: string; value: number | string }> = [];
    const a = drawInt(createRandomSource("p6"), 4, log);
    const b = drawInt(createRandomSource("p6"), 4, []);
    expect(a).toBe(b);
    expect(evaluateCondition({ type: "always" }, createPrimitiveRuntime(createBoard(lineBoard())))).toBe(true);
  });
});
