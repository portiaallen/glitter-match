import { describe, expect, it } from "vitest";
import { createBoard, getCell } from "../src/board/index.js";
import { runCascade } from "../src/cascade/index.js";
import { createEmptyStats } from "../src/objectives/index.js";
import { SeededRandom, type RandomSource } from "../src/random/index.js";
import { matchRules, pack } from "./helpers.js";

function scriptedRandom(picks: string[]): RandomSource {
  const inner = new SeededRandom("scripted");
  let index = 0;
  return {
    seed: inner.seed,
    next: () => inner.next(),
    nextInt: (max) => inner.nextInt(max),
    pick: <T>(items: readonly T[]) => {
      const wanted = picks[Math.min(index, picks.length - 1)];
      index += 1;
      return (items.find((item) => item === wanted) ?? items[0]) as T;
    },
    shuffle: (items) => inner.shuffle(items),
    fork: (salt) => inner.fork(salt),
    snapshot: () => inner.snapshot(),
  };
}

describe("cascade pipeline", () => {
  it("runs detect → resolve → effects → move → refill → complete without UI", () => {
    const board = createBoard({
      topology: { kind: "linear" },
      cells: [
        { id: "top", position: { x: 0, y: 0 } },
        { id: "mid", position: { x: 0, y: 1 } },
        { id: "low", position: { x: 0, y: 2 } },
        { id: "base", position: { x: 0, y: 3 } },
      ],
      adjacency: [
        { from: "top", to: "mid", direction: "s" },
        { from: "mid", to: "low", direction: "s" },
        { from: "low", to: "base", direction: "s" },
      ],
      flow: [
        { from: "top", to: "mid" },
        { from: "mid", to: "low" },
        { from: "low", to: "base" },
      ],
      movement: {
        mode: "along-flow",
        refill: { mode: "none" },
      },
    }, {
      top: { type: "icon", iconId: "dev.spark-b" },
      mid: { type: "icon", iconId: "dev.spark-a" },
      low: { type: "icon", iconId: "dev.spark-a" },
      base: { type: "icon", iconId: "dev.spark-a" },
    });

    const stats = createEmptyStats();
    const report = runCascade({
      board,
      matchRules,
      iconRegistry: pack().icons,
      obstacleRegistry: pack().obstacles,
      iconPool: ["dev.spark-c"],
      random: new SeededRandom("cascade"),
      stats,
      scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
    });

    expect(report.steps.map((step) => step.phase)).toContain("detect");
    expect(report.steps.map((step) => step.phase)).toContain("resolve");
    expect(report.steps.map((step) => step.phase)).toContain("effects");
    expect(report.steps.map((step) => step.phase)).toContain("move");
    expect(report.steps.map((step) => step.phase)).toContain("refill");
    expect(report.steps.map((step) => step.phase).at(-1)).toBe("complete");
    expect(report.combo).toBe(1);
    expect(stats.collectedIcons["dev.spark-a"]).toBe(3);
    expect(getCell(board, "base").occupant).toEqual({ type: "icon", iconId: "dev.spark-b" });
    expect(getCell(board, "top").occupant).toEqual({ type: "empty" });
  });

  it("continues when refill creates another match", () => {
    const board = createBoard({
      topology: { kind: "linear" },
      cells: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 1, y: 0 } },
        { id: "c", position: { x: 2, y: 0 } },
      ],
      adjacency: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
      movement: {
        mode: "none",
        refill: { mode: "spawn-at-sources", sourceCellIds: ["a", "b", "c"] },
      },
    }, {
      a: { type: "icon", iconId: "dev.spark-a" },
      b: { type: "icon", iconId: "dev.spark-a" },
      c: { type: "icon", iconId: "dev.spark-a" },
    });

    const stats = createEmptyStats();
    const report = runCascade({
      board,
      matchRules,
      iconRegistry: pack().icons,
      obstacleRegistry: pack().obstacles,
      iconPool: ["dev.spark-a", "dev.spark-b", "dev.spark-c"],
      random: scriptedRandom([
        "dev.spark-a",
        "dev.spark-a",
        "dev.spark-a",
        "dev.spark-b",
        "dev.spark-c",
        "dev.spark-b",
      ]),
      stats,
      scoreForMatch: (group, combo) => group.cellIds.length * combo,
    });

    expect(report.combo).toBeGreaterThan(1);
    expect(report.stable).toBe(true);
  });
});
