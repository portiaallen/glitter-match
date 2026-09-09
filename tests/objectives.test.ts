import { describe, expect, it } from "vitest";
import { createEmptyStats, createObjective } from "../src/objectives/index.js";

describe("objectives", () => {
  it("evaluates collection independently of rendering", () => {
    const objective = createObjective({
      id: "collect",
      type: "collection",
      iconId: "dev.spark-a",
      count: 3,
    });
    const stats = createEmptyStats();
    stats.collectedIcons["dev.spark-a"] = 2;
    expect(objective.evaluate({ stats, movesRemaining: 5, occupiedIcons: {}, hiddenCellIds: [] }).complete).toBe(false);
    stats.collectedIcons["dev.spark-a"] = 3;
    expect(objective.evaluate({ stats, movesRemaining: 5, occupiedIcons: {}, hiddenCellIds: [] }).complete).toBe(true);
  });

  it("composes hybrid objectives", () => {
    const objective = createObjective({
      id: "hybrid",
      type: "hybrid",
      mode: "all",
      children: [
        { id: "score", type: "score", score: 50 },
        { id: "combo", type: "combo", combo: 2 },
      ],
    });
    const stats = createEmptyStats();
    stats.score = 50;
    stats.maxCombo = 1;
    expect(objective.evaluate({ stats, movesRemaining: 1, occupiedIcons: {}, hiddenCellIds: [] }).complete).toBe(false);
    stats.maxCombo = 2;
    expect(objective.evaluate({ stats, movesRemaining: 1, occupiedIcons: {}, hiddenCellIds: [] }).complete).toBe(true);
  });

  it("rejects incomplete collection definitions at evaluation time via level validation coverage", () => {
    expect(() =>
      createObjective({ id: "bad", type: "collection" }).evaluate({
        stats: createEmptyStats(),
        movesRemaining: null,
        occupiedIcons: {},
        hiddenCellIds: [],
      }),
    ).toThrow(/collection.iconId/);
  });
});
