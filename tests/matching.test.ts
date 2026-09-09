import { describe, expect, it } from "vitest";
import { createBoard } from "../src/board/index.js";
import { detectMatches, matchedCellIds } from "../src/matching/index.js";
import { lineBoard, matchRules, pack } from "./helpers.js";

describe("matching", () => {
  it("matches 3+ compatible icons along graph connectivity, not a matrix", () => {
    const board = createBoard({
      topology: { kind: "branching" },
      cells: [
        { id: "hub", position: { x: 0, y: 0 } },
        { id: "left", position: { x: -1, y: 0 } },
        { id: "right", position: { x: 1, y: 0 } },
        { id: "down", position: { x: 0, y: 1 } },
      ],
      adjacency: [
        { from: "hub", to: "left" },
        { from: "hub", to: "right" },
        { from: "hub", to: "down" },
      ],
    }, {
      hub: { type: "icon", iconId: "dev.spark-a" },
      left: { type: "icon", iconId: "dev.spark-a" },
      right: { type: "icon", iconId: "dev.spark-a" },
      down: { type: "icon", iconId: "dev.spark-b" },
    });

    const groups = detectMatches(board, matchRules, pack().icons);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.colorIconId).toBe("dev.spark-a");
    expect(matchedCellIds(groups)).toEqual(["hub", "left", "right"]);
  });

  it("does not match icons that share coordinates-style proximity but no edge", () => {
    const board = createBoard({
      topology: { kind: "circular" },
      cells: [
        { id: "n", position: { x: 0, y: -1 } },
        { id: "e", position: { x: 1, y: 0 } },
        { id: "s", position: { x: 0, y: 1 } },
        { id: "w", position: { x: -1, y: 0 } },
      ],
      adjacency: [
        { from: "n", to: "e" },
        { from: "e", to: "s" },
        { from: "s", to: "w" },
        { from: "w", to: "n" },
      ],
    }, {
      n: { type: "icon", iconId: "dev.spark-a" },
      e: { type: "icon", iconId: "dev.spark-b" },
      s: { type: "icon", iconId: "dev.spark-a" },
      w: { type: "icon", iconId: "dev.spark-b" },
    });

    expect(detectMatches(board, matchRules, pack().icons)).toEqual([]);
  });

  it("lets the Glitter Icon join an ordinary cluster", () => {
    const board = lineBoard(["dev.spark-a", "glitter", "dev.spark-a"]);
    const groups = detectMatches(board, matchRules, pack().icons);
    expect(matchedCellIds(groups)).toEqual(["c0", "c1", "c2"]);
    expect(groups[0]?.colorIconId).toBe("dev.spark-a");
  });

  it("detects aligned matches when direction labels exist", () => {
    const board = lineBoard(["dev.spark-a", "dev.spark-a", "dev.spark-a", "dev.spark-b"]);
    const groups = detectMatches(
      board,
      { minGroupSize: 3, modes: ["aligned"] },
      pack().icons,
    );
    expect(groups.some((group) => group.pattern === "line")).toBe(true);
    expect(matchedCellIds(groups)).toEqual(["c0", "c1", "c2"]);
  });
});
