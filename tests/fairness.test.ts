import { describe, expect, it } from "vitest";
import { createBoard } from "../src/board/index.js";
import { isDeadBoard, listValidMoves, recoverDeadBoard } from "../src/fairness/index.js";
import { SeededRandom } from "../src/random/index.js";
import { lineBoard, matchRules, pack } from "./helpers.js";

describe("fairness", () => {
  it("detects valid matching swaps on a graph", () => {
    const board = createBoard({
      topology: { kind: "branching" },
      cells: [
        { id: "hub", position: { x: 0, y: 0 } },
        { id: "left", position: { x: -1, y: 0 } },
        { id: "right", position: { x: 1, y: 0 } },
        { id: "mid", position: { x: 0, y: 1 } },
        { id: "tail", position: { x: 0, y: 2 } },
      ],
      adjacency: [
        { from: "hub", to: "left" },
        { from: "hub", to: "right" },
        { from: "hub", to: "mid" },
        { from: "mid", to: "tail" },
      ],
    }, {
      hub: { type: "icon", iconId: "dev.spark-b" },
      left: { type: "icon", iconId: "dev.spark-a" },
      right: { type: "icon", iconId: "dev.spark-a" },
      mid: { type: "icon", iconId: "dev.spark-a" },
      tail: { type: "icon", iconId: "dev.spark-b" },
    });

    const moves = listValidMoves(board, matchRules, pack().icons, pack().obstacles);
    expect(moves.some((move) => move.a === "hub" && move.b === "left" || move.a === "left" && move.b === "hub")).toBe(true);
    expect(isDeadBoard(board, matchRules, pack().icons, pack().obstacles)).toBe(false);
  });

  it("detects a dead board with no matching swap", () => {
    const board = lineBoard(["dev.spark-a", "dev.spark-b", "dev.spark-c"]);
    expect(listValidMoves(board, matchRules, pack().icons, pack().obstacles)).toEqual([]);
    expect(isDeadBoard(board, matchRules, pack().icons, pack().obstacles)).toBe(true);
  });

  it("recovers a shufflable dead board deterministically", () => {
    const board = lineBoard(["dev.spark-a", "dev.spark-c", "dev.spark-a", "dev.spark-c", "dev.spark-a"]);
    expect(isDeadBoard(board, matchRules, pack().icons, pack().obstacles)).toBe(true);
    const result = recoverDeadBoard(
      board,
      matchRules,
      pack().icons,
      pack().obstacles,
      new SeededRandom("recover"),
      "shuffle",
      32,
    );
    expect(result.recovered).toBe(true);
    expect(isDeadBoard(board, matchRules, pack().icons, pack().obstacles)).toBe(false);
  });
});
