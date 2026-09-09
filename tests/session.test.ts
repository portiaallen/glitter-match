import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectBoard, toDot, formatInspection } from "../src/debug/index.js";
import { loadAndValidateLevel } from "../src/levels/index.js";
import { startLevel } from "../src/state/index.js";
import { pack } from "./helpers.js";
import { createObjective } from "../src/objectives/index.js";
import { DEFAULT_ACCESSIBILITY } from "../src/ui/index.js";

describe("session, debug, accessibility", () => {
  const level = () =>
    loadAndValidateLevel(JSON.parse(readFileSync("data/dev/branching-smoke.json", "utf8")), {
      ...pack(),
      profile: "development",
    });

  it("plays the development fixture through a winning swap", () => {
    const session = startLevel({ level: level(), registries: pack(), seed: "play-1" });
    expect(session.state.status).toBe("playing");
    session.swap("hub", "left");
    expect(session.state.status).toBe("won");
    expect(session.inspectObjective().complete).toBe(true);
    expect(session.state.earnedRewards[0]?.kind).toBe("score");
  });

  it("rejects a non-matching swap without mutating score", () => {
    const session = startLevel({ level: level(), registries: pack(), seed: "play-2" });
    const score = session.state.stats.score;
    expect(() => session.swap("mid", "tail")).toThrow(/does not create a match/);
    expect(session.state.stats.score).toBe(score);
    expect(session.state.status).toBe("playing");
  });

  it("reproduces the same outcome from the same seed", () => {
    const a = startLevel({ level: level(), registries: pack(), seed: "same" });
    const b = startLevel({ level: level(), registries: pack(), seed: "same" });
    a.swap("hub", "left");
    b.swap("hub", "left");
    expect(a.state.stats.score).toBe(b.state.stats.score);
    expect(a.state.rng.state).toBe(b.state.rng.state);
  });

  it("inspects topology, adjacency, icons, matches, and emits DOT", () => {
    const session = startLevel({ level: level(), registries: pack(), seed: "inspect" });
    const inspection = inspectBoard(session.state.board, level(), pack().icons, pack().obstacles);
    expect(inspection.topologyKind).toBe("branching");
    expect(inspection.adjacency.hub).toEqual(expect.arrayContaining(["left", "right", "mid"]));
    expect(inspection.icons.hub).toBe("dev.spark-b");
    const text = formatInspection(inspection);
    expect(text).toContain("topology: branching");
    const dot = toDot(inspection);
    expect(dot).toContain("hub");
    expect(dot).toContain("--");
  });

  it("can force a board state for debugging", () => {
    const session = startLevel({ level: level(), registries: pack(), seed: "force" });
    session.forceOccupants({
      hub: "dev.spark-a",
      left: "dev.spark-a",
      right: "dev.spark-a",
      mid: "dev.spark-b",
      tail: "dev.spark-c",
    });
    const inspection = inspectBoard(session.state.board, level(), pack().icons, pack().obstacles);
    expect(inspection.matches.length).toBeGreaterThan(0);
  });

  it("exposes accessibility defaults for presentation layers", () => {
    expect(DEFAULT_ACCESSIBILITY.nonColorIndicators).toBe(true);
    expect(DEFAULT_ACCESSIBILITY.largeHitTargets).toBe(true);
    expect(DEFAULT_ACCESSIBILITY.reducedMotion).toBe(false);
  });

  it("keeps path objectives independent of UI", () => {
    const objective = createObjective({
      id: "path",
      type: "path",
      startCellId: "left",
      endCellId: "right",
    });
    expect(
      objective.evaluate({
        stats: {
          collectedIcons: {},
          clearedCellCounts: { left: 1, right: 1 },
          revealedCellIds: [],
          score: 0,
          maxCombo: 0,
          movesUsed: 0,
          cascadesCompleted: 0,
        },
        movesRemaining: 3,
        occupiedIcons: {},
        hiddenCellIds: [],
      }).complete,
    ).toBe(true);
  });
});
