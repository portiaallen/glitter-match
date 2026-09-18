import { describe, expect, it } from "vitest";
import { createBoard, getCell } from "../src/board/index.js";
import { createObjective } from "../src/objectives/index.js";
import {
  enumerateLegalMoves,
  evaluateObjectiveOnBoard,
  searchSolvability,
  simulateSwapMove,
  SOLVABILITY_STATUS,
} from "../src/solvability/index.js";
import { createRandomSource } from "../src/random/index.js";
import { matchRules, pack } from "./helpers.js";

function line(icons: string[]) {
  return createBoard(
    {
      topology: { kind: "linear" },
      cells: icons.map((_, index) => ({ id: `c${index}`, position: { x: index, y: 0 } })),
      adjacency: icons.slice(0, -1).map((_, index) => ({
        from: `c${index}`,
        to: `c${index + 1}`,
        direction: "e",
      })),
    },
    Object.fromEntries(icons.map((icon, index) => [`c${index}`, { type: "icon" as const, iconId: icon }])),
  );
}

const solvable = ["dev.spark-a", "dev.spark-b", "dev.spark-a", "dev.spark-a"];

describe("solvability infrastructure", () => {
  it("enumerates legal matching swaps", () => {
    const board = line(solvable);
    const moves = enumerateLegalMoves(board, matchRules, pack().icons, pack().obstacles);
    expect(moves.some((move) => move.a === "c0" || move.b === "c0")).toBe(true);
  });

  it("simulates a swap and cascade into a resulting board state", () => {
    const board = line(solvable);
    const result = simulateSwapMove(
      board,
      { a: "c0", b: "c1" },
      {
        matchRules,
        iconRegistry: pack().icons,
        obstacleRegistry: pack().obstacles,
        random: createRandomSource("sim"),
      },
    );
    expect(result.matchesBeforeClear.length).toBeGreaterThan(0);
    expect(getCell(result.board, "c2").occupant.type).toBe("empty");
    expect(getCell(board, "c0").occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
  });

  it("reports SOLVED when an objective is reachable within bounds", () => {
    const board = line(solvable);
    const objective = createObjective({ id: "clear-a", type: "collection", iconId: "dev.spark-a", count: 2 });
    const report = searchSolvability({
      board,
      matchRules,
      iconRegistry: pack().icons,
      obstacleRegistry: pack().obstacles,
      seed: "solve-me",
      maxDepth: 3,
      maxNodes: 50,
      isGoal: (candidate, stats) => evaluateObjectiveOnBoard(candidate, stats, objective).complete,
    });
    expect(report.status).toBe(SOLVABILITY_STATUS.SOLVED);
    expect(report.objectiveReached).toBe(true);
    expect(report.truncated).toBe(false);
    expect(report.seed).toBe("solve-me");
    expect(report.legalMoveCount).toBeGreaterThan(0);
  });

  it("reports NOT FOUND WITHIN SEARCH LIMIT when truncated", () => {
    const board = line(["dev.spark-a", "dev.spark-b", "dev.spark-c", "dev.spark-a"]);
    const report = searchSolvability({
      board,
      matchRules,
      iconRegistry: pack().icons,
      obstacleRegistry: pack().obstacles,
      seed: "limit",
      maxDepth: 0,
      maxNodes: 1,
      isGoal: () => false,
    });
    expect(report.status).toBe(SOLVABILITY_STATUS.NOT_FOUND_WITHIN_SEARCH_LIMIT);
    expect(report.truncated).toBe(true);
    expect(report.reason).toMatch(/not a proof of unsolvability/i);
  });

  it("reports INVALID BOARD/RULE DEFINITION for malformed rules", () => {
    const board = line(["dev.spark-a", "dev.spark-b", "dev.spark-c"]);
    const report = searchSolvability({
      board,
      matchRules: { minGroupSize: 1, modes: [] },
      iconRegistry: pack().icons,
      obstacleRegistry: pack().obstacles,
      isGoal: () => false,
    });
    expect(report.status).toBe(SOLVABILITY_STATUS.INVALID_BOARD_RULE_DEFINITION);
  });

  it("uses deterministic seeds across identical searches", () => {
    const board = line(solvable);
    const run = () =>
      searchSolvability({
        board,
        matchRules,
        iconRegistry: pack().icons,
        obstacleRegistry: pack().obstacles,
        seed: "same",
        isGoal: (candidate) => getCell(candidate, "c0").occupant.type === "empty",
      });
    expect(run()).toEqual(run());
  });
});
