import { describe, expect, it } from "vitest";
import { createBoard } from "../src/board/index.js";
import { applyEffectBatch, createPrimitiveRuntime, graphEdgeKey, serializePrimitiveRuntime } from "../src/primitives/index.js";

function line(n: number, salt = 0) {
  const cells = Array.from({ length: n }, (_, index) => ({
    id: `c${index}`,
    position: { x: index + salt, y: salt },
    initialIcon: index % 2 === 0 ? "dev.spark-a" : "dev.spark-b",
  }));
  const adjacency = cells.slice(0, -1).map((cell, index) => ({
    from: cell.id,
    to: `c${index + 1}`,
    direction: "along",
    allowsMatch: true,
    allowsSwap: true,
  }));
  return { topology: { kind: "linear" as const }, cells, adjacency };
}

describe("primitive invariants", () => {
  it("keeps graphs valid across disable/enable cycles", () => {
    for (let size = 3; size <= 8; size += 1) {
      const runtime = createPrimitiveRuntime(createBoard(line(size)));
      const key = graphEdgeKey("c0", "c1");
      const disabled = applyEffectBatch(runtime, [{ kind: "disable-edge", edgeKey: key }]);
      expect(disabled.ok).toBe(true);
      expect(runtime.board.topology.cellIds).toHaveLength(size);
      const enabled = applyEffectBatch(runtime, [{ kind: "enable-edge", edgeKey: key }]);
      expect(enabled.ok).toBe(true);
      expect(runtime.edges[key]?.active).toBe(true);
    }
  });

  it("does not infer allowsSwap from allowsMatch", () => {
    for (let salt = 0; salt < 12; salt += 1) {
      const runtime = createPrimitiveRuntime(createBoard(line(4, salt)));
      const key = graphEdgeKey("c1", "c2");
      applyEffectBatch(runtime, [{ kind: "change-edge-state", edgeKey: key, edgePatch: { allowsMatch: salt % 2 === 0 } }]);
      expect(runtime.edges[key]?.allowsSwap).toBe(true);
      applyEffectBatch(runtime, [{ kind: "change-edge-state", edgeKey: key, edgePatch: { allowsSwap: false } }]);
      expect(runtime.edges[key]?.allowsMatch).toBe(salt % 2 === 0);
      expect(runtime.edges[key]?.allowsSwap).toBe(false);
    }
  });

  it("failed batches never leave partial mutation", () => {
    for (let size = 3; size <= 6; size += 1) {
      const runtime = createPrimitiveRuntime(createBoard(line(size)));
      const before = serializePrimitiveRuntime(runtime);
      const result = applyEffectBatch(runtime, [
        { kind: "swap-occupants", from: "c0", to: "c1" },
        { kind: "redirect-edge", edgeKey: graphEdgeKey("c0", "c1"), redirectTo: "missing" },
      ]);
      expect(result.ok).toBe(false);
      expect(serializePrimitiveRuntime(runtime)).toEqual(before);
    }
  });

  it("round-trips serialization after occupant rotation", () => {
    for (let size = 3; size <= 5; size += 1) {
      const runtime = createPrimitiveRuntime(createBoard(line(size)));
      const cycle = runtime.board.topology.cellIds;
      const result = applyEffectBatch(runtime, [{ kind: "rotate-occupants", cycle }]);
      expect(result.ok).toBe(true);
      const snap = serializePrimitiveRuntime(runtime);
      expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
      expect(Object.keys(snap.occupants as object)).toEqual(cycle);
    }
  });

  it("rejects duplicate relationships and unknown edge ids", () => {
    const runtime = createPrimitiveRuntime(createBoard(line(3)));
    applyEffectBatch(runtime, [
      {
        kind: "upsert-relationship",
        relationship: { id: "one", kind: "cell-cell", a: "c0", b: "c1", state: "active", lifecycle: "permanent" },
      },
    ]);
    const dup = applyEffectBatch(runtime, [
      {
        kind: "upsert-relationship",
        relationship: { id: "two", kind: "cell-cell", a: "c1", b: "c0", state: "active", lifecycle: "permanent" },
      },
    ]);
    expect(dup.ok).toBe(false);
    const badEdge = applyEffectBatch(runtime, [{ kind: "disable-edge", edgeKey: "nope" }]);
    expect(badEdge.ok).toBe(false);
  });
});
