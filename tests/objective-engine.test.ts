import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBoard } from "../src/board/index.js";
import { runCascade, type CascadeReport } from "../src/cascade/index.js";
import { startPlayground } from "../src/lab/playground.js";
import {
  OBJECTIVE_FIXTURE_IDS,
  OBJECTIVE_HANDLERS,
  OBJECTIVE_TYPES,
  compareObjectiveState,
  createEmptyStats,
  createObjective,
  createObjectiveEvent,
  createObjectiveRegistry,
  createObjectiveRuntime,
  createObjectiveState,
  defaultObjectiveAccessibility,
  evaluateRuntime,
  eventsFromCascade,
  explainObjective,
  explainWinState,
  ingestCascade,
  objectiveRuntimesEqual,
  resolveWinState,
  serializeObjectiveState,
  serializeRuntime,
  validateObjectiveDefinition,
  validateObjectiveDependencies,
  validateObjectiveForest,
  type ObjectiveDefinition,
  type ObjectiveEvaluationContext,
  type ObjectiveState,
} from "../src/objectives/index.js";
import { SeededRandom } from "../src/random/index.js";
import { replayTape } from "../src/replay/index.js";
import { startLevel } from "../src/state/index.js";
import { loadAndValidateLevel } from "../src/levels/index.js";
import { lineBoard, loadObjectiveFixture, pack } from "./helpers.js";

const A = "dev.spark-a";
const B = "dev.spark-b";

function ctx(partial: Partial<ObjectiveEvaluationContext> = {}): ObjectiveEvaluationContext {
  return {
    stats: createEmptyStats(),
    movesRemaining: 5,
    occupiedIcons: {},
    hiddenCellIds: [],
    ...partial,
  };
}

function state(definition: ObjectiveDefinition, current: number, target: number, status: ObjectiveState["status"]): ObjectiveState {
  return {
    ...createObjectiveState(definition),
    current,
    target,
    status,
    lastReason: status,
  };
}

describe("objective registry", () => {
  it("registers every catalog type exactly once", () => {
    const registry = createObjectiveRegistry();
    expect(registry.list().map((item) => item.type)).toEqual([...OBJECTIVE_TYPES]);
    expect(OBJECTIVE_HANDLERS.every((handler) => handler.testHarness && handler.evaluate)).toBe(true);
  });

  it("rejects duplicate registration and unknown types", () => {
    const registry = createObjectiveRegistry();
    expect(() => registry.register(OBJECTIVE_HANDLERS[0]!)).toThrow(/already registered/);
    expect(() => registry.get("not-a-type" as never)).toThrow(/not registered/);
    expect(
      validateObjectiveDefinition({ id: "bad", type: "portal-quest" as never }).some((item) => item.code === "objective.unknown_type"),
    ).toBe(true);
  });

  it("rejects incompatible objective versions", () => {
    const issues = validateObjectiveDefinition({ id: "old", type: "score", score: 1, version: "7.9.9" });
    expect(issues.some((item) => item.code === "objective.incompatible_version")).toBe(true);
  });
});

describe("collection / clearing / score", () => {
  it("tracks collection progress, completion, maxCount, and countUnit", () => {
    const definition: ObjectiveDefinition = {
      id: "collect",
      type: "collection",
      iconId: A,
      count: 3,
      maxCount: 4,
      countUnit: "icon",
      accessibilityLabel: "Collect 3 of 3 required icons.",
    };
    const objective = createObjective(definition);
    const stats = createEmptyStats();
    stats.collectedIcons[A] = 2;
    expect(objective.evaluate(ctx({ stats })).complete).toBe(false);
    stats.collectedIcons[A] = 3;
    expect(objective.evaluate(ctx({ stats })).complete).toBe(true);
    stats.collectedIcons[A] = 9;
    expect(objective.evaluate(ctx({ stats })).current).toBe(4);
    expect(createObjectiveRegistry().get("collection").countUnit).toBe("icon");
  });

  it("counts unique cleared cells and does not treat the whole board as the target", () => {
    const objective = createObjective({ id: "clear", type: "clearing", cellIds: ["c0", "c2"], countUnit: "cell" });
    const stats = createEmptyStats();
    stats.clearedCellCounts.c0 = 2;
    stats.clearedCellCounts.c1 = 5;
    expect(objective.evaluate(ctx({ stats })).current).toBe(1);
    stats.clearedCellCounts.c2 = 1;
    expect(objective.evaluate(ctx({ stats })).complete).toBe(true);
  });

  it("asks the score engine for a threshold and does not own the formula", () => {
    const objective = createObjective({ id: "score", type: "score", score: 50 });
    const stats = createEmptyStats();
    stats.score = 40;
    expect(objective.evaluate(ctx({ stats })).complete).toBe(false);
    stats.score = 50;
    expect(objective.evaluate(ctx({ stats })).complete).toBe(true);
  });

  it("does not double-count collection when the same stats are re-evaluated after cascade ingest", () => {
    const board = lineBoard([A, A, A]);
    const stats = createEmptyStats();
    const report = runCascade({
      board,
      matchRules: { minGroupSize: 3, modes: ["aligned"] },
      iconRegistry: pack().icons,
      obstacleRegistry: pack().obstacles,
      iconPool: [B],
      random: new SeededRandom("obj-collect"),
      stats,
      scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
    });
    const runtime = createObjectiveRuntime([{ id: "collect", type: "collection", iconId: A, count: 3 }]);
    ingestCascade(runtime, report, ctx({ stats, board }));
    const first = runtime.states.collect?.current;
    evaluateRuntime(runtime, ctx({ stats, board, events: runtime.events }));
    expect(runtime.states.collect?.current).toBe(first);
    expect(runtime.states.collect?.status).toBe("COMPLETE");
    expect(stats.collectedIcons[A]).toBe(3);
  });
});

describe("path / pattern / combo / precision / survival / discovery", () => {
  it("evaluates graph paths from authored edges, never x/y", () => {
    const connected = createBoard({
      topology: { kind: "linear" },
      cells: [
        { id: "start", position: { x: 0, y: 0 } },
        { id: "end", position: { x: 99, y: 99 } },
      ],
      adjacency: [{ from: "start", to: "end", direction: "along" }],
    });
    const disconnected = createBoard({
      topology: { kind: "linear" },
      cells: [
        { id: "start", position: { x: 0, y: 0 } },
        { id: "end", position: { x: 1, y: 0 } },
      ],
      adjacency: [],
    });
    const objective = createObjective({
      id: "path",
      type: "path",
      startCellId: "start",
      endCellId: "end",
      pathMode: "graph",
    });
    expect(objective.evaluate(ctx({ board: connected })).complete).toBe(true);
    expect(objective.evaluate(ctx({ board: disconnected })).complete).toBe(false);
    const cleared = createObjective({ id: "ends", type: "path", startCellId: "start", endCellId: "end" });
    const stats = createEmptyStats();
    stats.clearedCellCounts.start = 1;
    stats.clearedCellCounts.end = 1;
    expect(cleared.evaluate(ctx({ stats })).complete).toBe(true);
  });

  it("uses a registered pattern id and occupancy, and rejects unknown patterns", () => {
    const objective = createObjective({
      id: "pattern",
      type: "pattern",
      patternId: "cluster",
      iconByCell: { c0: A, c1: A },
    });
    expect(objective.evaluate(ctx({ occupiedIcons: { c0: A, c1: B } })).complete).toBe(false);
    expect(objective.evaluate(ctx({ occupiedIcons: { c0: A, c1: A } })).complete).toBe(true);
    expect(() =>
      createObjective({ id: "bad-pattern", type: "pattern", patternId: "not-a-pattern", iconByCell: { c0: A } }).evaluate(ctx()),
    ).toThrow(/Unknown pattern/);
  });

  it("counts only registered combo events and does not treat every cascade as a combo", () => {
    const objective = createObjective({
      id: "combo",
      type: "combo",
      combo: 2,
      comboEvents: ["REGISTERED_COMBO"],
    });
    const cascadeOnly = [
      createObjectiveEvent("CASCADE_COMPLETED", 1, "after-cascade", "done", { combo: 1 }),
    ];
    expect(objective.evaluate(ctx({ events: cascadeOnly })).complete).toBe(false);
    const combos = [
      createObjectiveEvent("REGISTERED_COMBO", 1, "after-match-resolution", "combo", { combo: 2 }),
      createObjectiveEvent("REGISTERED_COMBO", 2, "after-match-resolution", "combo", { combo: 3 }),
    ];
    expect(objective.evaluate(ctx({ events: combos })).complete).toBe(true);
    const stats = createEmptyStats();
    stats.maxCombo = 2;
    expect(createObjective({ id: "max", type: "combo", combo: 2 }).evaluate(ctx({ stats })).complete).toBe(true);
  });

  it("evaluates precision deterministically from moves and score", () => {
    const objective = createObjective({ id: "precision", type: "precision", moves: 2 });
    const stats = createEmptyStats();
    expect(objective.evaluate(ctx({ stats, movesRemaining: 4 })).complete).toBe(false);
    stats.score = 10;
    expect(objective.evaluate(ctx({ stats, movesRemaining: 1 })).complete).toBe(false);
    expect(objective.evaluate(ctx({ stats, movesRemaining: 2 })).complete).toBe(true);
  });

  it("fails survival on forbidden events or exhausted surviveMoves", () => {
    const forbidden = createObjective({
      id: "survive",
      type: "survival",
      cascades: 3,
      forbiddenEvents: ["REGISTERED_COMBO"],
    });
    const stats = createEmptyStats();
    stats.cascadesCompleted = 1;
    expect(forbidden.evaluate(ctx({ stats })).status).toBe("INCOMPLETE");
    expect(
      forbidden.evaluate(
        ctx({
          stats,
          events: [createObjectiveEvent("REGISTERED_COMBO", 1, "after-match-resolution", "combo")],
        }),
      ).failed,
    ).toBe(true);
    const moves = createObjective({ id: "turns", type: "survival", cascades: 1, surviveMoves: 2 });
    stats.movesUsed = 3;
    expect(moves.evaluate(ctx({ stats })).failed).toBe(true);
  });

  it("treats discovery as an event/reveal contract and ignores duplicate reveals", () => {
    const objective = createObjective({ id: "find", type: "discovery", cellIds: ["secret"] });
    expect(objective.evaluate(ctx({ hiddenCellIds: ["secret"] })).complete).toBe(false);
    const stats = createEmptyStats();
    stats.revealedCellIds = ["secret", "secret"];
    expect(objective.evaluate(ctx({ stats, hiddenCellIds: ["secret"] })).complete).toBe(true);
    const evented = createObjective({ id: "evt", type: "discovery", cellIds: [] });
    expect(
      evented.evaluate(
        ctx({
          events: [createObjectiveEvent("DISCOVERY_OCCURRED", 1, "after-objective-event", "found")],
        }),
      ).complete,
    ).toBe(true);
  });
});

describe("multi-stage, hybrid, and dependencies", () => {
  it("advances stages in order and keeps later stages inactive", () => {
    const definition: ObjectiveDefinition = {
      id: "stages",
      type: "multi-stage",
      stages: [
        { id: "stage-1", type: "score", score: 10 },
        { id: "stage-2", type: "collection", iconId: A, count: 2 },
      ],
    };
    const runtime = createObjectiveRuntime([definition]);
    const stats = createEmptyStats();
    evaluateRuntime(runtime, ctx({ stats }));
    expect(runtime.states.stages?.current).toBe(0);
    expect(runtime.states.stages?.activeStageId).toBe("stage-1");
    expect(runtime.states["stage-2"]?.current).toBe(0);
    stats.score = 10;
    evaluateRuntime(runtime, ctx({ stats }));
    expect(runtime.states.stages?.current).toBe(1);
    expect(runtime.states.stages?.activeStageId).toBe("stage-2");
    stats.collectedIcons[A] = 2;
    evaluateRuntime(runtime, ctx({ stats }));
    expect(runtime.states.stages?.status).toBe("COMPLETE");
  });

  it("composes AND, OR, SEQUENCE, NOT, and nested trees", () => {
    const and = createObjective({
      id: "and",
      type: "hybrid",
      composition: "and",
      children: [
        { id: "and-score", type: "score", score: 10 },
        { id: "and-combo", type: "combo", combo: 2 },
      ],
    });
    const or = createObjective({
      id: "or",
      type: "hybrid",
      composition: "or",
      children: [
        { id: "or-score", type: "score", score: 99 },
        { id: "or-combo", type: "combo", combo: 2 },
      ],
    });
    const sequence = createObjective({
      id: "seq",
      type: "hybrid",
      composition: "sequence",
      children: [
        { id: "seq-a", type: "score", score: 10 },
        { id: "seq-b", type: "combo", combo: 3 },
      ],
    });
    const not = createObjective({
      id: "not",
      type: "hybrid",
      composition: "not",
      children: [{ id: "not-child", type: "score", score: 10 }],
    });
    const nested = createObjective({
      id: "nest",
      type: "hybrid",
      composition: "and",
      children: [
        { id: "nest-score", type: "score", score: 10 },
        {
          id: "nest-or",
          type: "hybrid",
          composition: "or",
          children: [
            { id: "nest-combo", type: "combo", combo: 9 },
            { id: "nest-collect", type: "collection", iconId: A, count: 1 },
          ],
        },
      ],
    });
    const stats = createEmptyStats();
    stats.score = 10;
    stats.maxCombo = 2;
    stats.collectedIcons[A] = 1;
    expect(and.evaluate(ctx({ stats })).complete).toBe(true);
    expect(or.evaluate(ctx({ stats })).complete).toBe(true);
    expect(sequence.evaluate(ctx({ stats })).current).toBe(1);
    expect(not.evaluate(ctx({ stats })).complete).toBe(false);
    expect(nested.evaluate(ctx({ stats })).complete).toBe(true);
    expect(
      validateObjectiveForest([{ id: "bad-and", type: "hybrid", composition: "and", children: [{ id: "only", type: "score", score: 1 }] }]).some(
        (item) => item.code === "objective.malformed_composition",
      ),
    ).toBe(true);
  });

  it("validates missing and circular dependencies and gates progress", () => {
    expect(
      validateObjectiveDependencies([{ id: "b", type: "score", score: 1, dependsOn: ["missing"] }]).some(
        (item) => item.code === "objective.missing_dependency",
      ),
    ).toBe(true);
    expect(
      validateObjectiveDependencies([
        { id: "a", type: "score", score: 1, dependsOn: ["b"] },
        { id: "b", type: "score", score: 1, dependsOn: ["a"] },
      ]).some((item) => item.code === "objective.dependency_cycle"),
    ).toBe(true);
    const runtime = createObjectiveRuntime([
      { id: "first", type: "score", score: 20 },
      { id: "second", type: "score", score: 1, dependsOn: ["first"] },
    ]);
    const stats = createEmptyStats();
    stats.score = 5;
    evaluateRuntime(runtime, ctx({ stats }));
    expect(runtime.states.second?.current).toBe(0);
    stats.score = 20;
    evaluateRuntime(runtime, ctx({ stats }));
    expect(runtime.states.first?.status).toBe("COMPLETE");
    expect(runtime.states.second?.status).toBe("COMPLETE");
  });
});

describe("win-state resolver", () => {
  it("keeps optional objectives from blocking required completion", () => {
    const required = state({ id: "need", type: "score", score: 1, role: "required" }, 1, 1, "COMPLETE");
    const optional = state({ id: "extra", type: "score", score: 99, role: "optional" }, 0, 99, "INCOMPLETE");
    const mastery = state({ id: "master", type: "precision", moves: 1, role: "mastery" }, 0, 1, "INCOMPLETE");
    const result = resolveWinState([required, optional, mastery]);
    expect(result.state).toBe("COMPLETED");
    expect(result.optionalComplete).toEqual([]);
    expect(result.remainingRequired).toEqual([]);
  });

  it("applies explicit completion/failure precedence", () => {
    const won = state({ id: "won", type: "score", score: 1, role: "required" }, 1, 1, "COMPLETE");
    const failed = state({ id: "failed", type: "survival", cascades: 1, role: "required" }, 0, 1, "FAILED");
    const completionFirst = resolveWinState([won, failed], {
      completionPolicy: "ANY_REQUIRED_OBJECTIVE",
      failurePolicy: "ANY_FAILURE",
      conflictPolicy: "completion-first",
    });
    const failureFirst = resolveWinState([won, failed], {
      completionPolicy: "ANY_REQUIRED_OBJECTIVE",
      failurePolicy: "ANY_FAILURE",
      conflictPolicy: "failure-first",
    });
    expect(completionFirst.state).toBe("COMPLETED");
    expect(failureFirst.state).toBe("FAILED");
    expect(failureFirst.whyFailed).toMatch(/ANY_FAILURE/);
  });

  it("uses MOVE_LIMIT only as an authored failure policy", () => {
    const incomplete = state({ id: "need", type: "score", score: 10, role: "required" }, 0, 10, "INCOMPLETE");
    expect(
      resolveWinState([incomplete], { completionPolicy: "ALL_REQUIRED_OBJECTIVES", failurePolicy: "MOVE_LIMIT", conflictPolicy: "completion-first" }, 0)
        .state,
    ).toBe("FAILED");
    expect(
      resolveWinState([incomplete], { completionPolicy: "ALL_REQUIRED_OBJECTIVES", failurePolicy: "NONE", conflictPolicy: "completion-first" }, 0)
        .state,
    ).toBe("IN_PROGRESS");
    const complete = state({ id: "need", type: "score", score: 10, role: "required" }, 10, 10, "COMPLETE");
    expect(
      resolveWinState([complete], { completionPolicy: "ALL_REQUIRED_OBJECTIVES", failurePolicy: "MOVE_LIMIT", conflictPolicy: "completion-first" }, 0)
        .state,
    ).toBe("COMPLETED");
  });
});

describe("serialization, replay, accessibility, fixtures", () => {
  it("round-trips objective state without losing progress", () => {
    const runtime = createObjectiveRuntime([{ id: "collect", type: "collection", iconId: A, count: 3, version: "9.0.0" }]);
    const stats = createEmptyStats();
    stats.collectedIcons[A] = 2;
    evaluateRuntime(runtime, ctx({ stats }));
    const serialized = serializeRuntime(runtime);
    expect(serialized.states.collect?.objectiveVersion).toBe("9.0.0");
    expect(compareObjectiveState(serialized.states.collect!, JSON.parse(JSON.stringify(serializeObjectiveState(serialized.states.collect!))))).toBe(
      true,
    );
    const clone = JSON.parse(JSON.stringify(serialized));
    expect(objectiveRuntimesEqual(runtime, clone)).toBe(true);
  });

  it("replays the same collection progress from the same cascade", () => {
    const definition: ObjectiveDefinition = { id: "collect", type: "collection", iconId: A, count: 3 };
    const run = () => {
      const board = lineBoard([A, A, A]);
      const stats = createEmptyStats();
      const report = runCascade({
        board,
        matchRules: { minGroupSize: 3, modes: ["aligned"] },
        iconRegistry: pack().icons,
        obstacleRegistry: pack().obstacles,
        iconPool: [B],
        random: new SeededRandom("obj-replay"),
        stats,
        scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
      });
      const runtime = createObjectiveRuntime([definition]);
      ingestCascade(runtime, report, ctx({ stats, board }));
      return { runtime, stats, board };
    };
    const first = run();
    const second = run();
    expect(objectiveRuntimesEqual(first.runtime, second.runtime)).toBe(true);
    expect(first.runtime.states.collect?.status).toBe("COMPLETE");
    const playground = startPlayground({ document: loadObjectiveFixture("objective.collection"), registries: pack(), seed: "lab-obj" });
    const replayed = replayTape(playground.tape, {
      registries: pack(),
      matchRules: playground.matchRules,
      iconPool: playground.iconPool,
      objective: playground.document.demoObjective as ObjectiveDefinition,
    });
    expect(replayed.stats.score).toBe(playground.stats.score);
  });

  it("replays a session win-state deterministically", () => {
    const level = loadAndValidateLevel(JSON.parse(readFileSync("data/dev/branching-smoke.json", "utf8")), {
      ...pack(),
      profile: "development",
    });
    const a = startLevel({ level, registries: pack(), seed: "obj-win" });
    const b = startLevel({ level, registries: pack(), seed: "obj-win" });
    a.swap("hub", "left");
    b.swap("hub", "left");
    expect(a.inspectWinState().state).toBe("COMPLETED");
    expect(b.inspectWinState()).toEqual(a.inspectWinState());
    expect(a.state.status).toBe("won");
  });

  it("exposes text progress that is not color-only", () => {
    const a11y = defaultObjectiveAccessibility("Collect 10 icons", 7, 10, "INCOMPLETE");
    expect(a11y.progressText).toContain("7 / 10");
    expect(a11y.statusText).toContain("3 remain");
    expect(a11y.nonColorIndicator).toBe("OBJ:INCOMPLETE:7/10");
    expect(a11y.reducedMotion).toMatch(/presentation only/);
    const explained = explainObjective(state({ id: "collect", type: "collection", iconId: A, count: 10 }, 7, 10, "INCOMPLETE"));
    expect(explained).toContain("WHY INCOMPLETE?");
    expect(explained).toContain("7 / 10");
    expect(explainWinState(resolveWinState([state({ id: "need", type: "score", score: 1, role: "required" }, 0, 1, "INCOMPLETE")]))).toContain(
      "WHY INCOMPLETE?",
    );
  });

  it("marks every objective fixture as non-campaign engine content", () => {
    for (const id of OBJECTIVE_FIXTURE_IDS) {
      const document = loadObjectiveFixture(id);
      expect(document.purpose).toBe("engine-fixture");
      expect(document.id.startsWith("objective.")).toBe(true);
      expect(document.notes).toMatch(/ENGINE TEST FIXTURE ONLY/);
      expect(document.demoObjective).toBeTruthy();
      const playground = startPlayground({ document, registries: pack(), seed: "fixture" });
      const inspection = playground.inspectObjectives();
      expect(inspection?.validation.filter((item) => item.severity === "error")).toEqual([]);
      expect(inspection?.accessibility[0]?.nonColorIndicator).toMatch(/^OBJ:/);
    }
  });

  it("maps cascade and Special Match events without inferring combos from combo=1", () => {
    const report = {
      steps: [
        {
          phase: "resolve",
          combo: 1,
          matches: [{ mode: "cluster", cellIds: ["c0", "c1", "c2"], colorIconId: A }],
          clearedCellIds: ["c0"],
          moved: [],
          filled: [],
        },
      ],
      combo: 1,
      stable: true,
      termination: "CASCADE_COMPLETED",
      specialEvents: [
        { kind: "SPECIAL_MATCH_CREATED", message: "created", instanceId: "sm1", cellIds: ["c0"], explain: {} },
        { kind: "SPECIAL_MATCH_ACTIVATED", message: "activated", instanceId: "sm1", explain: {} },
        { kind: "SPECIAL_MATCH_RESOLVED", message: "resolved", instanceId: "sm1", explain: {} },
      ],
      specialMatchesCreated: ["sm1"],
      diagnostics: { durationMs: 0 },
    } as CascadeReport;
    const events = eventsFromCascade(report, 1);
    expect(events.map((event) => event.kind)).toEqual([
      "CASCADE_STARTED",
      "CASCADE_STEP",
      "MATCH_RESOLVED",
      "CELL_CLEARED",
      "SPECIAL_MATCH_CREATED",
      "SPECIAL_MATCH_ACTIVATED",
      "SPECIAL_MATCH_RESOLVED",
      "CASCADE_COMPLETED",
    ]);
    expect(events.some((event) => event.kind === "REGISTERED_COMBO")).toBe(false);
  });

  it("contains no Land-specific objective branches", () => {
    const dir = "src/objectives";
    const sources = readdirSync(dir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(`${dir}/${name}`, "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/if\s*\(\s*land\s*===/);
    expect(sources).not.toMatch(/land\s*===\s*["']lumina["']/);
  });
});
