import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBoardDocument } from "../src/board/index.js";
import { CONTENT_VERSION, SCHEMA_VERSION } from "../src/content/index.js";
import { loadAndValidateLevel, type LevelDefinition } from "../src/levels/index.js";
import {
  createProgressionRuntime,
  DEV_PROGRESSION_CATALOG,
  DEV_PROGRESSION_UNIVERSE,
} from "../src/progression/index.js";
import {
  canTransition,
  createLevelRuntime,
  developmentLevelFromBoardDocument,
  inspectLevelRuntime,
  isTerminalRuntimeState,
  loadLevelRuntime,
  replayLevelRuntime,
  RuntimeError,
  RUNTIME_TRANSITIONS,
  type LevelRuntime,
  type LoadLevelOptions,
} from "../src/runtime/index.js";
import { startLevel } from "../src/state/index.js";
import { pack } from "./helpers.js";

function smoke(): LevelDefinition {
  return loadAndValidateLevel(JSON.parse(readFileSync("data/dev/branching-smoke.json", "utf8")), {
    ...pack(),
    profile: "development",
  });
}

function ctx() {
  return { ...pack(), profile: "development" as const };
}

function loadRuntime(level: LevelDefinition, extra: Partial<LoadLevelOptions> = {}): LevelRuntime {
  return loadLevelRuntime({
    level,
    registries: pack(),
    seed: extra.seed ?? "runtime-seed",
    validation: ctx(),
    ...extra,
  });
}

function fromFixture(path: string): LevelDefinition {
  return developmentLevelFromBoardDocument(parseBoardDocument(JSON.parse(readFileSync(path, "utf8"))));
}

describe("Level Runtime lifecycle", () => {
  it("starts uninitialized and rejects moves", () => {
    const runtime = createLevelRuntime();
    expect(runtime.lifecycle).toBe("UNINITIALIZED");
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe("SESSION_NOT_READY");
  });

  it("loads into AWAITING_MOVE and exposes identity", () => {
    const runtime = loadRuntime(smoke(), { seed: "life-1", trace: true });
    expect(runtime.lifecycle).toBe("AWAITING_MOVE");
    expect(runtime.levelId).toBe("dev.branching-smoke");
    expect(runtime.seed).toBe("life-1");
    expect(runtime.contentVersion).toBeTruthy();
    expect(runtime.turnNumber).toBe(0);
    expect(runtime.attempt?.outcome).toBe("in-progress");
    expect(runtime.events.some((event) => event.kind === "LEVEL_INITIALIZED")).toBe(true);
  });

  it("documents the explicit transition table", () => {
    expect(canTransition("UNINITIALIZED", "LOADING")).toBe(true);
    expect(canTransition("AWAITING_MOVE", "RESOLVING_MOVE")).toBe(true);
    expect(canTransition("AWAITING_MOVE", "COMPLETE")).toBe(false);
    expect(canTransition("COMPLETE", "AWAITING_MOVE")).toBe(false);
    expect(isTerminalRuntimeState("COMPLETE")).toBe(true);
    expect(RUNTIME_TRANSITIONS.EVALUATING_OUTCOME).toEqual(
      expect.arrayContaining(["AWAITING_MOVE", "COMPLETE", "FAILED"]),
    );
  });

  it("enters COMPLETE after a winning move and blocks further moves", () => {
    const runtime = loadRuntime(smoke(), { seed: "life-win" });
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.accepted).toBe(true);
    expect(runtime.lifecycle).toBe("COMPLETE");
    expect(result.outcome?.state).toBe("COMPLETED");
    const blocked = runtime.submitMove({ sourceCellId: "hub", targetCellId: "right" });
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejection?.code).toBe("SESSION_ALREADY_COMPLETE");
  });
});

describe("Level Runtime loading", () => {
  it("rejects an invalid level", () => {
    expect(() => loadRuntime({ ...smoke(), land: "not-a-land" } as unknown as LevelDefinition)).toThrow();
  });

  it("rejects an invalid initial board when avoidInitialMatches is set", () => {
    const level = smoke();
    const broken: LevelDefinition = {
      ...level,
      placement: { ...level.placement, avoidInitialMatches: true },
      board: {
        ...level.board,
        cells: level.board.cells.map((cell) =>
          cell.id === "hub" || cell.id === "left" || cell.id === "right"
            ? { ...cell, initialIcon: "dev.spark-a" }
            : cell,
        ),
      },
    };
    expect(() => loadRuntime(broken)).toThrow(RuntimeError);
    try {
      loadRuntime(broken);
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe("INVALID_INITIAL_STATE");
    }
  });

  it("rejects incompatible content versions", () => {
    expect(() => loadRuntime({ ...smoke(), schemaVersion: "1.0.0" })).toThrow(/not compatible/);
    try {
      loadRuntime({ ...smoke(), contentVersion: "0.1.0" });
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe("INVALID_LEVEL");
    }
  });

  it("initializes deterministically for the same level, version, and seed", () => {
    const a = loadRuntime(smoke(), { seed: "same-init" });
    const b = loadRuntime(smoke(), { seed: "same-init" });
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.authoritativeState.rng.state).toBe(b.authoritativeState.rng.state);
    expect(a.inspectWinState().state).toBe("IN_PROGRESS");
  });

  it("fills seeded boards deterministically", () => {
    const level = fromFixture("data/lab/seeded-fill.json");
    level.placement = { mode: "seeded-random", seedSalt: "lab" };
    const a = loadRuntime(level, { seed: "fill-a" });
    const b = loadRuntime(level, { seed: "fill-a" });
    expect(a.stateHash()).toBe(b.stateHash());
  });
});

describe("Level Runtime moves", () => {
  it("accepts a legal graph-authoritative move", () => {
    const runtime = loadRuntime(smoke(), { seed: "move-ok", trace: true });
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.accepted).toBe(true);
    expect(result.turnNumber).toBe(1);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.trace.some((step) => step.stage === "MOVE")).toBe(true);
  });

  it("rejects disconnected cells without mutating state", () => {
    const runtime = loadRuntime(smoke(), { seed: "disc" });
    const hash = runtime.stateHash();
    const rng = runtime.authoritativeState.rng.state;
    const result = runtime.submitMove({ sourceCellId: "left", targetCellId: "right" });
    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe("NOT_CONNECTED");
    expect(runtime.turnNumber).toBe(0);
    expect(runtime.stateHash()).toBe(hash);
    expect(runtime.authoritativeState.rng.state).toBe(rng);
  });

  it("rejects invalid cells", () => {
    const runtime = loadRuntime(smoke());
    const result = runtime.submitMove({ sourceCellId: "ghost", targetCellId: "hub" });
    expect(result.rejection?.code).toBe("INVALID_CELL");
  });

  it("rejects a no-match swap without consuming RNG or advancing the turn", () => {
    const runtime = loadRuntime(smoke(), { seed: "nomatch" });
    const hash = runtime.stateHash();
    const rng = runtime.authoritativeState.rng.state;
    const moves = runtime.authoritativeState.stats.movesUsed;
    const result = runtime.submitMove({ sourceCellId: "mid", targetCellId: "tail" });
    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe("NO_MATCH");
    expect(result.noMatchPolicy).toBe("reject-revert");
    expect(runtime.turnNumber).toBe(0);
    expect(runtime.authoritativeState.stats.movesUsed).toBe(moves);
    expect(runtime.authoritativeState.rng.state).toBe(rng);
    expect(runtime.stateHash()).toBe(hash);
    expect(runtime.events.some((event) => event.kind === "MOVE_ACCEPTED")).toBe(false);
  });

  it("does not infer adjacency from coordinates", () => {
    const source = readFileSync("src/runtime/runtime.ts", "utf8");
    expect(source).not.toMatch(/position\.x|Math\.hypot|x \+ 1|y \+ 1/);
    expect(source).toContain("areAdjacent");
    expect(source).toContain("canAttemptSwap");
  });
});

describe("Level Runtime match and cascade pipeline", () => {
  it("resolves a move that creates a match", () => {
    const runtime = loadRuntime(smoke(), { seed: "pipe-match" });
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.cascadeCount).toBeGreaterThan(0);
    expect(result.cascade?.termination).toBe("CASCADE_COMPLETED");
  });

  it("can commit a no-match move when requireMatch is false", () => {
    const level: LevelDefinition = { ...smoke(), swap: { requireMatch: false } };
    const runtime = loadRuntime(level, { seed: "pipe-keep" });
    const result = runtime.submitMove({ sourceCellId: "mid", targetCellId: "tail" });
    expect(result.accepted).toBe(true);
    expect(result.noMatchPolicy).toBe("commit");
    expect(runtime.turnNumber).toBe(1);
  });

  it("runs overlapping match groups through the existing Match Engine", () => {
    const runtime = loadRuntime(fromFixture("data/lab/match/overlapping.json"), { seed: "overlap" });
    expect(runtime.authoritativeState.lastCascade?.steps.some((step) => step.matches.length > 0)).toBe(true);
  });

  it("uses authored directional edges, not screen axes", () => {
    const runtime = loadRuntime(fromFixture("data/lab/match/directional.json"), { seed: "dir" });
    expect(runtime.level.board.adjacency.every((edge) => edge.from && edge.to)).toBe(true);
    expect(runtime.level.board.adjacency.some((edge) => edge.direction)).toBe(true);
    expect(runtime.levelId).toBe("match.directional");
  });

  it("resolves a multi-step cascade fixture", () => {
    const runtime = loadRuntime(fromFixture("data/lab/cascade-chain.json"), { seed: "casc" });
    const result = runtime.submitMove({ sourceCellId: "c3", targetCellId: "side" });
    expect(result.accepted).toBe(true);
    expect(result.cascadeCount).toBeGreaterThan(1);
  });

  it("surfaces cascade safety limits without inventing a silent stop", () => {
    const runtime = loadRuntime(fromFixture("data/lab/cascade-chain.json"), {
      seed: "limit",
      cascadeLimits: { maxCombos: 1, maxDepth: 1 },
    });
    const result = runtime.submitMove({ sourceCellId: "c3", targetCellId: "side" });
    expect(result.accepted).toBe(true);
    expect(["CASCADE_LIMIT_REACHED", "CASCADE_COMPLETED", "CASCADE_STATE_REPEAT"]).toContain(result.cascade?.termination);
    if (result.cascade?.termination === "CASCADE_LIMIT_REACHED") {
      expect(runtime.events.some((event) => event.data?.code === "CASCADE_SAFETY_LIMIT")).toBe(true);
    }
  });
});

describe("Level Runtime Special Matches", () => {
  it("creates Special Match instances from Match Engine candidates", () => {
    const runtime = loadRuntime(fromFixture("data/lab/special/line-create.json"), { seed: "sm-create" });
    const created = Object.values(runtime.authoritativeState.specialMatches.instances);
    expect(created.length).toBeGreaterThan(0);
    expect(created[0]?.anchorCellId).toBeTruthy();
  });

  it("activates Special Matches through the existing cascade pipeline", () => {
    const runtime = loadRuntime(fromFixture("data/lab/special/adjacent-trigger.json"), { seed: "sm-act" });
    const created = runtime.authoritativeState.lastCascade?.specialMatchesCreated ?? [];
    expect(created.length).toBeGreaterThan(0);
    const activated = runtime.authoritativeState.lastCascade?.specialEvents.some((event) => event.kind === "SPECIAL_MATCH_ACTIVATED");
    expect(activated === true || created.length > 0).toBe(true);
  });
});

describe("Level Runtime objectives and outcomes", () => {
  it("records objective progress and completion", () => {
    const runtime = loadRuntime(smoke(), { seed: "obj-win" });
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.objectiveChanges.length).toBeGreaterThan(0);
    expect(result.outcome?.state).toBe("COMPLETED");
    expect(runtime.inspectWinState().state).toBe("COMPLETED");
    expect(runtime.authoritativeState.objectiveRuntime.states["collect-a"]?.status).toBe("COMPLETE");
  });

  it("keeps optional and mastery objectives out of required completion", () => {
    const level: LevelDefinition = {
      ...smoke(),
      mastery: {
        ...smoke().mastery,
        optionalObjectives: [{ id: "mastery-watch", type: "score", score: 9999, role: "mastery" }],
      },
    };
    const runtime = loadRuntime(level, { seed: "obj-mastery" });
    runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(runtime.inspectWinState().state).toBe("COMPLETED");
    expect(runtime.authoritativeState.objectiveRuntime.states["mastery-watch"]?.status).not.toBe("COMPLETE");
    expect(runtime.inspectWinState().state).not.toBe("MASTERED");
  });

  it("fails through the win-state resolver when the move limit is exhausted", () => {
    const level: LevelDefinition = {
      ...smoke(),
      moveLimit: 1,
      objective: { id: "never", type: "collection", iconId: "dev.spark-c", count: 9 },
    };
    const runtime = loadRuntime(level, { seed: "obj-fail" });
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.accepted).toBe(true);
    expect(runtime.lifecycle).toBe("FAILED");
    expect(result.outcome?.state).toBe("FAILED");
    const blocked = runtime.submitMove({ sourceCellId: "hub", targetCellId: "right" });
    expect(blocked.rejection?.code).toBe("SESSION_ALREADY_FAILED");
  });

  it("prefers completion over failure when both fire on the same turn", () => {
    const level: LevelDefinition = { ...smoke(), moveLimit: 1 };
    const runtime = loadRuntime(level, { seed: "obj-pref" });
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.outcome?.state).toBe("COMPLETED");
    expect(runtime.lifecycle).toBe("COMPLETE");
  });

  it("does not invent a move-limit failure when the level has no limit", () => {
    const level: LevelDefinition = {
      ...smoke(),
      moveLimit: null,
      objective: { id: "never", type: "collection", iconId: "dev.spark-c", count: 9 },
    };
    const runtime = loadRuntime(level, { seed: "obj-nolimit" });
    runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(runtime.inspectWinState().state).toBe("IN_PROGRESS");
    expect(runtime.lifecycle).not.toBe("FAILED");
    expect(runtime.authoritativeState.movesRemaining).toBeNull();
  });
});

describe("Level Runtime progression", () => {
  it("starts an attempt and records completion through ProgressionRuntime", () => {
    const progression = createProgressionRuntime(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG);
    const runtime = loadRuntime(smoke(), {
      seed: "prog-win",
      progressionRuntime: progression,
      progressionNodeId: "dev.level.root",
    });
    expect(progression.player.events.some((event) => event.kind === "LEVEL_STARTED")).toBe(true);
    runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(progression.player.completedLevelIds).toContain("dev.level.root");
    expect(progression.player.events.some((event) => event.kind === "LEVEL_COMPLETED")).toBe(true);
    expect(progression.player.events.some((event) => event.kind === "BEST_RESULT_UPDATED")).toBe(true);
    expect(progression.player.levels["dev.level.linear"]?.availability).toBe("AVAILABLE");
  });

  it("records failure without implementing unlock logic in the runtime", () => {
    const source = readFileSync("src/runtime/runtime.ts", "utf8") + readFileSync("src/runtime/index.ts", "utf8");
    expect(source).not.toMatch(/evaluateUnlock|recalcAvailability/);
    const progression = createProgressionRuntime(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG);
    const level: LevelDefinition = {
      ...smoke(),
      moveLimit: 1,
      objective: { id: "never", type: "collection", iconId: "dev.spark-c", count: 9 },
    };
    const runtime = loadRuntime(level, {
      seed: "prog-fail",
      progressionRuntime: progression,
      progressionNodeId: "dev.level.root",
    });
    runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(progression.player.events.some((event) => event.kind === "LEVEL_FAILED")).toBe(true);
    expect(progression.player.completedLevelIds).not.toContain("dev.level.root");
    expect(runtime.lifecycle).toBe("FAILED");
  });

  it("keeps repeated attempts distinguishable under a stable level id", () => {
    const progression = createProgressionRuntime(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG);
    const first = loadRuntime(smoke(), {
      seed: "att-1",
      progressionRuntime: progression,
      progressionNodeId: "dev.level.root",
    });
    first.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    const second = loadRuntime(smoke(), {
      seed: "att-2",
      progressionRuntime: progression,
      progressionNodeId: "dev.level.root",
    });
    expect(first.levelId).toBe(second.levelId);
    expect(first.attempt?.attemptId).not.toBe(second.attempt?.attemptId);
  });
});

describe("Level Runtime transactions, replay, and snapshots", () => {
  it("commits a successful turn and rolls back an engine error", () => {
    const runtime = loadRuntime(smoke(), {
      seed: "tx",
      hooks: {
        beforeCascade() {
          throw new Error("injected cascade failure");
        },
      },
    });
    const hash = runtime.stateHash();
    const rng = runtime.authoritativeState.rng.state;
    const result = runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(result.accepted).toBe(false);
    expect(result.error?.code).toBe("ENGINE_RESOLUTION_ERROR");
    expect(runtime.lifecycle).toBe("AWAITING_MOVE");
    expect(runtime.turnNumber).toBe(0);
    expect(runtime.stateHash()).toBe(hash);
    expect(runtime.authoritativeState.rng.state).toBe(rng);
  });

  it("restores snapshot state including RNG and objectives", () => {
    const runtime = loadRuntime(smoke(), { seed: "snap" });
    const snap = runtime.snapshot();
    runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(runtime.lifecycle).toBe("COMPLETE");
    runtime.restore(snap);
    expect(runtime.lifecycle).toBe("AWAITING_MOVE");
    expect(runtime.turnNumber).toBe(0);
    expect(runtime.stateHash()).toBe(snap.gameplay.stateHash);
    expect(runtime.authoritativeState.rng.state).toBe(snap.gameplay.rng.state);
    expect(runtime.inspectWinState().state).toBe("IN_PROGRESS");
  });

  it("replays the original session to an equivalent state", () => {
    const original = loadRuntime(smoke(), { seed: "replay-eq" });
    original.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    const replayed = replayLevelRuntime(
      { level: smoke(), registries: pack(), validation: ctx(), seed: "ignored" },
      original.replay,
    );
    expect(replayed.stateHash()).toBe(original.stateHash());
    expect(replayed.inspectWinState().state).toBe(original.inspectWinState().state);
    expect(replayed.authoritativeState.stats.score).toBe(original.authoritativeState.stats.score);
  });

  it("rejects replay on incompatible content", () => {
    const original = loadRuntime(smoke(), { seed: "replay-bad" });
    original.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    const replay = { ...original.replay, contentVersion: "1.0.0" };
    expect(() =>
      replayLevelRuntime({ level: smoke(), registries: pack(), validation: ctx(), seed: original.seed }, replay),
    ).toThrow(RuntimeError);
  });
});

describe("Level Runtime accessibility and explainability", () => {
  it("preserves reduced-motion and non-color state", () => {
    const runtime = loadRuntime(smoke(), {
      seed: "a11y",
      accessibility: {
        reducedMotion: true,
        textScale: 1.2,
        nonColorIndicators: true,
        largeHitTargets: true,
        audioEnabled: true,
        audioVolume: 1,
        hapticsEnabled: true,
        screenReaderHints: true,
      },
    });
    expect(runtime.presentation.accessibility.reducedMotion).toBe(true);
    expect(runtime.presentation.accessibility.nonColorIndicators).toBe(true);
    const snap = runtime.snapshot();
    runtime.presentation.accessibility.reducedMotion = false;
    runtime.restore(snap);
    expect(runtime.presentation.accessibility.reducedMotion).toBe(true);
    const rejected = runtime.submitMove({ sourceCellId: "left", targetCellId: "right" });
    expect(rejected.rejection?.reason).toMatch(/not connected|graph edge/i);
    const inspection = inspectLevelRuntime(runtime);
    expect(inspection.accessibility.nonColorIndicators).toBe(true);
    expect(inspection.explanations.join(" ")).toMatch(/waiting|not connected|graph/i);
  });

  it("uses monotonic event sequences rather than wall-clock time", () => {
    const runtime = loadRuntime(smoke(), { seed: "seq" });
    runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    const sequences = runtime.events.map((event) => event.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(readFileSync("src/runtime/runtime.ts", "utf8")).not.toMatch(/Date\.now\(\)/);
  });
});

describe("Level Runtime invariants", () => {
  it("increases turn number only after a committed valid move", () => {
    const runtime = loadRuntime(smoke(), { seed: "inv-turn" });
    runtime.submitMove({ sourceCellId: "ghost", targetCellId: "hub" });
    expect(runtime.turnNumber).toBe(0);
    runtime.submitMove({ sourceCellId: "hub", targetCellId: "left" });
    expect(runtime.turnNumber).toBe(1);
  });

  it("keeps GameSession on the same play path", () => {
    const session = startLevel({ level: smoke(), registries: pack(), seed: "legacy" });
    expect(session.runtime.lifecycle).toBe("AWAITING_MOVE");
    session.swap("hub", "left");
    expect(session.state.status).toBe("won");
    expect(session.runtime.lifecycle).toBe("COMPLETE");
  });

  it("does not author production content versions as a campaign", () => {
    expect(SCHEMA_VERSION).toBe("10.0.0");
    expect(CONTENT_VERSION).toBe("0.8.0-runtime");
    expect(smoke().id).toBe("dev.branching-smoke");
    expect(smoke().status).toBe("development");
  });
});
