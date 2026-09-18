import { describe, expect, it } from "vitest";
import {
  areAdjacent,
  cellsAlongAuthoredDirection,
  createBoard,
  detectAuthoredJunction,
  neighbors,
} from "../src/board/index.js";
import { detectMatches } from "../src/matching/index.js";
import { pack } from "./helpers.js";

describe("directional edge semantics", () => {
  it("does not treat visually adjacent cells as connected without an authored relationship", () => {
    const board = createBoard({
      topology: { kind: "custom" },
      cells: [
        { id: "a", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a" },
        { id: "b", position: { x: 1, y: 0 }, initialIcon: "dev.spark-a" },
        { id: "c", position: { x: 2, y: 0 }, initialIcon: "dev.spark-a" },
      ],
      adjacency: [{ from: "a", to: "b", direction: "forward", traversal: "both" }],
    });

    expect(areAdjacent(board, "a", "b")).toBe(true);
    expect(areAdjacent(board, "b", "c")).toBe(false);
    expect(areAdjacent(board, "a", "c")).toBe(false);
    expect(detectMatches(board, { minGroupSize: 3, modes: ["cluster"] }, pack().icons)).toEqual([]);
  });

  it("treats a graph path as directional without reading x/y", () => {
    const board = createBoard({
      topology: { kind: "custom" },
      cells: [
        { id: "a", position: { x: 9, y: 9 } },
        { id: "b", position: { x: -4, y: 2 } },
        { id: "c", position: { x: 0.5, y: -8 } },
      ],
      adjacency: [
        { from: "a", to: "b", direction: "along", traversal: "forward" },
        { from: "b", to: "c", direction: "along", traversal: "forward" },
      ],
    });

    expect(cellsAlongAuthoredDirection(board, "a", "along")).toEqual(["a", "b", "c"]);
    expect(areAdjacent(board, "a", "b")).toBe(true);
    expect(areAdjacent(board, "b", "a")).toBe(false);
    expect(areAdjacent(board, "c", "b")).toBe(false);
  });

  it("detects L/T/cross patterns from authored direction labels on an irregular graph", () => {
    const board = createBoard({
      topology: { kind: "custom" },
      cells: [
        { id: "p", position: { x: 0, y: 0 } },
        { id: "n", position: { x: 0.4, y: -2 } },
        { id: "e", position: { x: 3, y: 0.2 } },
        { id: "s", position: { x: -0.3, y: 2.7 } },
        { id: "w", position: { x: -2.5, y: 0.1 } },
      ],
      adjacency: [
        { from: "p", to: "n", direction: "out-n", traversal: "forward" },
        { from: "p", to: "e", direction: "out-e", traversal: "forward" },
        { from: "p", to: "s", direction: "out-s", traversal: "forward" },
        { from: "p", to: "w", direction: "out-w", traversal: "forward" },
      ],
    });

    const corner = detectAuthoredJunction(
      createBoard({
        topology: { kind: "custom" },
        cells: [
          { id: "p", position: { x: 0, y: 0 } },
          { id: "n", position: { x: 1, y: 4 } },
          { id: "e", position: { x: -3, y: 1 } },
        ],
        adjacency: [
          { from: "p", to: "n", direction: "arm-a", traversal: "forward" },
          { from: "p", to: "e", direction: "arm-b", traversal: "forward" },
        ],
      }),
      "p",
    );
    expect(corner?.kind).toBe("corner");

    const tee = detectAuthoredJunction(
      createBoard({
        topology: { kind: "custom" },
        cells: [
          { id: "p", position: { x: 2, y: 2 } },
          { id: "a", position: { x: 0, y: 9 } },
          { id: "b", position: { x: 8, y: 1 } },
          { id: "c", position: { x: 3, y: -4 } },
        ],
        adjacency: [
          { from: "p", to: "a", direction: "r1", traversal: "forward" },
          { from: "p", to: "b", direction: "r2", traversal: "forward" },
          { from: "p", to: "c", direction: "r3", traversal: "forward" },
        ],
      }),
      "p",
    );
    expect(tee?.kind).toBe("tee");
    expect(detectAuthoredJunction(board, "p")?.kind).toBe("cross");
  });

  it("keeps the same directional matches when visual arrangement changes", () => {
    const occupancy = {
      a: { type: "icon" as const, iconId: "dev.spark-a" },
      b: { type: "icon" as const, iconId: "dev.spark-a" },
      c: { type: "icon" as const, iconId: "dev.spark-a" },
      d: { type: "icon" as const, iconId: "dev.spark-b" },
    };
    const edges = [
      { from: "a", to: "b", direction: "seq" },
      { from: "b", to: "c", direction: "seq" },
      { from: "c", to: "d", direction: "seq" },
    ];
    const compact = createBoard(
      {
        topology: { kind: "linear" },
        cells: [
          { id: "a", position: { x: 0, y: 0 } },
          { id: "b", position: { x: 1, y: 0 } },
          { id: "c", position: { x: 2, y: 0 } },
          { id: "d", position: { x: 3, y: 0 } },
        ],
        adjacency: edges,
      },
      occupancy,
    );
    const scrambled = createBoard(
      {
        topology: { kind: "linear" },
        cells: [
          { id: "a", position: { x: 12, y: -7 } },
          { id: "b", position: { x: 0, y: 4 } },
          { id: "c", position: { x: -9, y: -1 } },
          { id: "d", position: { x: 3, y: 11 } },
        ],
        adjacency: edges,
      },
      occupancy,
    );

    const rules = { minGroupSize: 3, modes: ["aligned" as const] };
    const compactMatch = detectMatches(compact, rules, pack().icons);
    const scrambledMatch = detectMatches(scrambled, rules, pack().icons);
    expect(compactMatch[0]?.cellIds).toEqual(["a", "b", "c"]);
    expect(scrambledMatch[0]?.cellIds).toEqual(compactMatch[0]?.cellIds);
  });

  it("honors allowsMatch / allowsSwap independently of traversal", () => {
    const board = createBoard({
      topology: { kind: "custom" },
      cells: [
        { id: "a", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a" },
        { id: "b", position: { x: 1, y: 0 }, initialIcon: "dev.spark-a" },
      ],
      adjacency: [{ from: "a", to: "b", allowsMatch: false, allowsSwap: true }],
    });
    expect(neighbors(board, "a")).toEqual([]);
    expect(areAdjacent(board, "a", "b")).toBe(false);
    expect(areAdjacent(board, "a", "b", { forSwap: true })).toBe(true);
  });
});
