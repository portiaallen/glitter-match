import { describe, expect, it } from "vitest";
import { createBoard } from "../src/board/index.js";
import { canAttemptSwap } from "../src/fairness/index.js";
import { pack } from "./helpers.js";
import { detectMatches } from "../src/matching/index.js";
import { applyObstacleMatchEffects } from "../src/obstacles/index.js";
import { matchRules } from "./helpers.js";

describe("obstacles", () => {
  it("lets a lock block swaps without rewriting the board engine", () => {
    const board = createBoard({
      topology: { kind: "linear" },
      cells: [
        { id: "a", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a", initialObstacles: [{ type: "lock", durability: 1 }] },
        { id: "b", position: { x: 1, y: 0 }, initialIcon: "dev.spark-b" },
        { id: "c", position: { x: 2, y: 0 }, initialIcon: "dev.spark-c" },
      ],
      adjacency: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });

    expect(canAttemptSwap(board, "a", "b", pack().obstacles)).toBe(false);
    expect(canAttemptSwap(board, "b", "c", pack().obstacles)).toBe(true);
  });

  it("breaks ice when the frozen cell participates in a match", () => {
    const board = createBoard({
      topology: { kind: "linear" },
      cells: [
        { id: "a", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a", initialObstacles: [{ type: "ice", durability: 1 }] },
        { id: "b", position: { x: 1, y: 0 }, initialIcon: "dev.spark-a" },
        { id: "c", position: { x: 2, y: 0 }, initialIcon: "dev.spark-a" },
      ],
      adjacency: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });

    const matches = detectMatches(board, matchRules, pack().icons);
    expect(matches.length).toBeGreaterThan(0);
    applyObstacleMatchEffects(board, matches, pack().obstacles);
    expect(board.cells["a"]?.obstacles).toEqual([]);
  });
});
