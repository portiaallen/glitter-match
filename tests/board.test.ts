import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areAdjacent, createBoard, neighbors } from "../src/board/index.js";
import { loadAndValidateLevel } from "../src/levels/index.js";
import { pack } from "./helpers.js";

describe("board graph", () => {
  it("builds a non-rectangular diamond from explicit edges, not a matrix", () => {
    const board = createBoard({
      topology: { kind: "circular", notes: "diamond ring" },
      cells: [
        { id: "n", position: { x: 0, y: -1 } },
        { id: "e", position: { x: 1, y: 0 } },
        { id: "s", position: { x: 0, y: 1 } },
        { id: "w", position: { x: -1, y: 0 } },
      ],
      adjacency: [
        { from: "n", to: "e", direction: "se" },
        { from: "e", to: "s", direction: "sw" },
        { from: "s", to: "w", direction: "nw" },
        { from: "w", to: "n", direction: "ne" },
      ],
    });

    expect(board.topology.cellIds).toEqual(["n", "e", "s", "w"]);
    expect(neighbors(board, "n").sort()).toEqual(["e", "w"]);
    expect(areAdjacent(board, "n", "s")).toBe(false);
    expect(areAdjacent(board, "n", "e")).toBe(true);
    expect(board.topology.cells["n"]?.position).toEqual({ x: 0, y: -1 });
  });

  it("supports hub-and-spoke branching that is not a grid", () => {
    const board = createBoard({
      topology: { kind: "hub-and-spoke" },
      cells: [
        { id: "hub", position: { x: 0, y: 0 } },
        { id: "a", position: { x: 0, y: -1 } },
        { id: "b", position: { x: 1, y: 0.5 } },
        { id: "c", position: { x: -1, y: 0.5 } },
      ],
      adjacency: [
        { from: "hub", to: "a" },
        { from: "hub", to: "b" },
        { from: "hub", to: "c" },
      ],
    });

    expect(neighbors(board, "hub").sort()).toEqual(["a", "b", "c"]);
    expect(areAdjacent(board, "a", "b")).toBe(false);
  });

  it("can connect disconnected-looking islands through portals", () => {
    const board = createBoard({
      topology: { kind: "portal-connected" },
      cells: [
        { id: "island-a", position: { x: 0, y: 0 } },
        { id: "island-b", position: { x: 20, y: 20 } },
      ],
      adjacency: [{ from: "island-a", to: "island-b", kind: "portal" }],
      portals: [{ id: "gate", from: "island-a", to: "island-b", bidirectional: true }],
      portalsConductMatches: true,
      portalsAllowSwap: true,
    });

    expect(areAdjacent(board, "island-a", "island-b", { forSwap: true })).toBe(true);
  });

  it("rejects duplicate cell ids", () => {
    expect(() =>
      createBoard({
        topology: { kind: "linear" },
        cells: [
          { id: "a", position: { x: 0, y: 0 } },
          { id: "a", position: { x: 1, y: 0 } },
        ],
        adjacency: [{ from: "a", to: "a" }],
      }),
    ).toThrow(/Duplicate cell id/);
  });

  it("loads the development branching fixture as a graph", () => {
    const level = loadAndValidateLevel(
      JSON.parse(readFileSync("data/dev/branching-smoke.json", "utf8")),
      { ...pack(), profile: "development" },
    );
    const board = createBoard({
      topology: level.board.topology,
      cells: level.board.cells,
      adjacency: level.board.adjacency,
    });
    expect(neighbors(board, "hub").sort()).toEqual(["left", "mid", "right"]);
    expect(areAdjacent(board, "left", "right")).toBe(false);
  });
});
