import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileBoardDocument, createBoard, getCell } from "../src/board/index.js";
import { startPlayground } from "../src/lab/playground.js";
import { occupantSnapshot, replayTape } from "../src/replay/index.js";
import { createEmptyStats } from "../src/objectives/index.js";
import { SeededRandom, type RandomSource } from "../src/random/index.js";
import { SPECIAL_ICON_IDS } from "../src/special-icons/index.js";
import { GLITTER_ICON_ID } from "../src/ids.js";
import { runCascade } from "../src/cascade/index.js";
import { runMatchResolution, type MatchRules } from "../src/matching/index.js";
import {
  BUILT_IN_SPECIAL_MATCH_TYPES,
  SPECIAL_MATCH_TYPE_IDS,
  compareActivations,
  SpecialInteractionRegistry,
  createSpecialInteractionRegistry,
  createSpecialMatchRegistry,
  createSpecialMatchRuntime,
  cueForSpecial,
  defaultSpecialAccessibility,
  explainSpecialMatch,
  gameplayFingerprint,
  inspectSpecialMatches,
  labActivateSpecial,
  queueActivation,
  resolveCandidateCreation,
  resolvePendingActivations,
  selectAnchor,
  serializeSpecialMatchRuntime,
  serializeSpecialMatchState,
  specialMatchStatesEqual,
  validateCascadeLimits,
  validateSpecialMatchState,
  validateSpecialMatchType,
  type SpecialMatchInstance,
  type SpecialMatchTypeDefinition,
} from "../src/special-matches/index.js";
import { lineBoard, loadMatchFixture, loadSpecialFixture, pack } from "./helpers.js";

const A = "dev.spark-a";
const B = "dev.spark-b";
const C = "dev.spark-c";

const aligned: MatchRules = { minGroupSize: 3, modes: ["aligned"] };
const cluster: MatchRules = { minGroupSize: 3, modes: ["cluster"] };
const patternModes: MatchRules = { minGroupSize: 3, modes: ["cluster", "aligned", "corner", "tee", "cross"] };

function scriptedRandom(picks: string[]): RandomSource {
  const inner = new SeededRandom("scripted-special");
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

function cascade(
  board: ReturnType<typeof createBoard>,
  rules: MatchRules = aligned,
  extra: Partial<Parameters<typeof runCascade>[0]> = {},
) {
  const runtime = extra.specialRuntime ?? createSpecialMatchRuntime();
  const stats = extra.stats ?? createEmptyStats();
  const report = runCascade({
    board,
    matchRules: rules,
    iconRegistry: pack().icons,
    obstacleRegistry: pack().obstacles,
    iconPool: extra.iconPool ?? [B, C],
    random: extra.random ?? new SeededRandom("special-cascade"),
    stats,
    scoreForMatch: extra.scoreForMatch ?? ((group, combo) => group.cellIds.length * 10 * combo),
    specialRuntime: runtime,
    specialRegistry: extra.specialRegistry,
    specialInteractions: extra.specialInteractions,
    specialCreationPolicy: extra.specialCreationPolicy,
    cascadeLimits: extra.cascadeLimits,
    maxCombos: extra.maxCombos,
  });
  return { report, runtime, stats, board };
}

function twoDisjointLines() {
  return createBoard(
    {
      topology: { kind: "custom", notes: "Two disjoint four-cell lines." },
      cells: [
        { id: "a0", position: { x: 0, y: 0 } },
        { id: "a1", position: { x: 1, y: 0 } },
        { id: "a2", position: { x: 2, y: 0 } },
        { id: "a3", position: { x: 3, y: 0 } },
        { id: "b0", position: { x: 0, y: 2 } },
        { id: "b1", position: { x: 1, y: 2 } },
        { id: "b2", position: { x: 2, y: 2 } },
        { id: "b3", position: { x: 3, y: 2 } },
      ],
      adjacency: [
        { from: "a0", to: "a1", direction: "e" },
        { from: "a1", to: "a2", direction: "e" },
        { from: "a2", to: "a3", direction: "e" },
        { from: "b0", to: "b1", direction: "e" },
        { from: "b1", to: "b2", direction: "e" },
        { from: "b2", to: "b3", direction: "e" },
      ],
      movement: { mode: "none", refill: { mode: "none" } },
    },
    {
      a0: { type: "icon", iconId: A },
      a1: { type: "icon", iconId: A },
      a2: { type: "icon", iconId: A },
      a3: { type: "icon", iconId: A },
      b0: { type: "icon", iconId: B },
      b1: { type: "icon", iconId: B },
      b2: { type: "icon", iconId: B },
      b3: { type: "icon", iconId: B },
    },
  );
}

function armedInstance(overrides: Partial<SpecialMatchInstance> & Pick<SpecialMatchInstance, "instanceId" | "anchorCellId">): SpecialMatchInstance {
  return {
    typeId: "line-clear",
    typeVersion: "8.0.0",
    sourceMatchGroupId: "mg:test",
    createdAtMove: 0,
    createdAtCombo: 1,
    state: "armed",
    activationState: "armed",
    metadata: {
      candidateType: "line-4",
      affectedCellIds: [overrides.anchorCellId],
      directionsUsed: ["e"],
      ruleId: "directional-aligned",
      category: "line-clear",
    },
    ...overrides,
  };
}

describe("Special Match registry", () => {
  it("registers built-in generic types without inventory Special Icon ids", () => {
    const registry = createSpecialMatchRegistry();
    expect(registry.list().map((type) => type.id).sort()).toEqual([...SPECIAL_MATCH_TYPE_IDS].sort());
    expect(BUILT_IN_SPECIAL_MATCH_TYPES.every((type) => type.deterministic && type.testHarness)).toBe(true);
    for (const id of SPECIAL_ICON_IDS) {
      expect(registry.has(id)).toBe(false);
    }
    expect(registry.has(GLITTER_ICON_ID)).toBe(false);
  });

  it("rejects duplicate registration and unknown types", () => {
    const registry = createSpecialMatchRegistry();
    expect(() => registry.register(BUILT_IN_SPECIAL_MATCH_TYPES[0]!)).toThrow(/already registered/);
    expect(() => registry.get("not-a-special")).toThrow(/Unknown Special Match type/);
  });

  it("validates versions, policies, triggers, and handlers", () => {
    const broken = {
      ...BUILT_IN_SPECIAL_MATCH_TYPES[0]!,
      id: "bad-type",
      version: "",
      activationTriggers: ["not-a-trigger"],
      emitEffects: undefined,
    } as unknown as SpecialMatchTypeDefinition;
    const issues = validateSpecialMatchType(broken);
    expect(issues.some((item) => item.code === "special.invalid_version")).toBe(true);
    expect(issues.some((item) => item.code === "special.unknown_trigger")).toBe(true);
    expect(issues.some((item) => item.code === "special.missing_handler")).toBe(true);
  });
});

describe("Special Match creation", () => {
  it("creates a board instance from a line-4 candidate and preserves the anchor", () => {
    const { report, runtime, board } = cascade(lineBoard([A, A, A, A]), aligned);
    const instances = Object.values(runtime.instances);
    expect(instances).toHaveLength(1);
    expect(instances[0]?.typeId).toBe("line-clear");
    expect(instances[0]?.state).toBe("armed");
    const anchor = instances[0]!.anchorCellId;
    expect(getCell(board, anchor).occupant).toEqual({
      type: "special-match",
      typeId: "line-clear",
      instanceId: instances[0]!.instanceId,
    });
    for (const id of board.topology.cellIds) {
      if (id !== anchor) {
        expect(getCell(board, id).occupant).toEqual({ type: "empty" });
      }
    }
    expect(report.specialMatchesCreated).toEqual([instances[0]!.instanceId]);
    expect(report.specialEvents.some((event) => event.kind === "SPECIAL_CANDIDATE_IDENTIFIED")).toBe(true);
    expect(report.specialEvents.some((event) => event.kind === "SPECIAL_MATCH_CREATED")).toBe(true);
  });

  it("selects a deterministic graph-aware anchor and never uses coordinates", () => {
    const candidate = {
      candidateType: "line-4",
      affectedCellIds: ["c3", "c0", "c1", "c2"],
      anchorCellId: "missing",
      triggerMove: null,
      ruleId: "directional-aligned",
      priority: 24,
    };
    const first = selectAnchor(candidate, "canonical-cell", ["c0", "c1", "c2", "c3"]);
    const second = selectAnchor(candidate, "canonical-cell", ["c0", "c1", "c2", "c3"]);
    expect(first.cellId).toBe("c0");
    expect(second.cellId).toBe("c0");
    expect(first.why).toMatch(/lexicographically first/);
    expect(first.why).not.toMatch(/x\/y|screen|visual/i);

    const authored = selectAnchor({ ...candidate, anchorCellId: "c2" }, "authored-candidate", ["c0", "c1", "c2", "c3"]);
    expect(authored.cellId).toBe("c2");
  });

  it("keeps losing candidates inspectable when creation policy claims an anchor", () => {
    const board = createBoard(compileBoardDocument(loadMatchFixture("match.pattern-cross")));
    const resolution = runMatchResolution(board, patternModes, pack().icons);
    expect(resolution.specialMatchCandidates.length).toBeGreaterThan(1);
    const runtime = createSpecialMatchRuntime();
    const decision = resolveCandidateCreation(
      board,
      resolution.specialMatchCandidates,
      createSpecialMatchRegistry(),
      runtime,
      1,
      "priority-unique-anchors",
      resolution.groups,
    );
    expect(decision.created.some((instance) => instance.typeId === "cross-clear")).toBe(true);
    expect(decision.deferred.length).toBeGreaterThan(0);
    expect(decision.events.some((event) => event.kind === "SPECIAL_CANDIDATE_DEFERRED")).toBe(true);
    expect(resolution.specialMatchCandidates.map((item) => item.candidateType)).toEqual(
      expect.arrayContaining(decision.deferred.map((item) => item.candidateType)),
    );
  });

  it("can create more than one Special Match when groups do not share an anchor", () => {
    const { runtime } = cascade(twoDisjointLines(), aligned);
    const created = Object.values(runtime.instances);
    expect(created).toHaveLength(2);
    expect(created.map((item) => item.typeId).sort()).toEqual(["line-clear", "line-clear"]);
    expect(new Set(created.map((item) => item.anchorCellId)).size).toBe(2);
  });

  it("maps a cluster-4+ candidate to area-clear without inventing inventory items", () => {
    const { runtime, board } = cascade(lineBoard([A, A, A, A]), cluster);
    const instance = Object.values(runtime.instances)[0];
    expect(instance?.typeId).toBe("area-clear");
    expect(instance?.metadata.candidateType).toBe("cluster-special");
    expect(getCell(board, instance!.anchorCellId).occupant.type).toBe("special-match");
  });
});

describe("Special Match activation", () => {
  it("activates a registered direct trigger and consumes the default lifecycle", () => {
    const { runtime, board } = cascade(lineBoard([A, A, A, A]), aligned);
    const instance = Object.values(runtime.instances)[0]!;
    labActivateSpecial(runtime, instance.instanceId);
    const again = cascade(board, aligned, { specialRuntime: runtime });
    expect(again.report.steps.some((step) => step.phase === "special-activate")).toBe(true);
    expect(runtime.instances[instance.instanceId]?.state).toBe("resolved");
    expect(getCell(board, instance.anchorCellId).occupant).toEqual({ type: "empty" });
    expect(again.report.specialEvents.some((event) => event.kind === "SPECIAL_MATCH_ACTIVATED")).toBe(true);
    expect(again.report.specialEvents.some((event) => event.kind === "SPECIAL_MATCH_CONSUMED")).toBe(true);
  });

  it("prevents duplicate and consumed-instance triggers", () => {
    const runtime = createSpecialMatchRuntime();
    runtime.instances.sm1 = armedInstance({ instanceId: "sm1", anchorCellId: "c0" });
    expect(queueActivation(runtime, "sm1", "direct", 25)).not.toBeNull();
    expect(queueActivation(runtime, "sm1", "direct", 25)).toBeNull();
    runtime.instances.sm1.state = "resolved";
    runtime.pending = [];
    expect(queueActivation(runtime, "sm1", "direct", 25)).toBeNull();
  });

  it("orders activations by sequence, move, priority, anchor, then instance id", () => {
    const left = {
      activationId: "act:2:sm-z:direct",
      instanceId: "sm-z",
      trigger: "direct" as const,
      sequence: 1,
      createdAtMove: 1,
      priority: 10,
      anchorCellId: "c9",
    };
    const right = {
      activationId: "act:1:sm-a:direct",
      instanceId: "sm-a",
      trigger: "direct" as const,
      sequence: 1,
      createdAtMove: 1,
      priority: 50,
      anchorCellId: "c0",
    };
    expect(compareActivations(right, left)).toBeLessThan(0);
    expect([right, left].sort(compareActivations).map((item) => item.instanceId)).toEqual(["sm-a", "sm-z"]);
  });
});

describe("Special Match effects and transactions", () => {
  it("emits primitive effects that clear along authored directions", () => {
    const { runtime, board } = cascade(lineBoard([A, A, A, A, B]), aligned);
    const instance = Object.values(runtime.instances)[0]!;
    expect(getCell(board, "c4").occupant).toEqual({ type: "icon", iconId: B });
    labActivateSpecial(runtime, instance.instanceId);
    cascade(board, aligned, { specialRuntime: runtime });
    expect(getCell(board, "c4").occupant).toEqual({ type: "empty" });
    expect(runtime.events.some((event) => event.kind === "SPECIAL_MATCH_EFFECT_EMITTED")).toBe(true);
  });

  it("rolls back an invalid effect batch and leaves the board unchanged", () => {
    const board = lineBoard([A, B, C]);
    const registry = createSpecialMatchRegistry();
    registry.register({
      ...BUILT_IN_SPECIAL_MATCH_TYPES[1]!,
      id: "fail-batch",
      creationEligibility: ["harness-only"],
      emitEffects: () => [
        {
          kind: "change-occupant",
          cellIds: ["missing-cell"],
          occupant: { type: "empty" },
          cue: cueForSpecial("fail-batch", "Invalid cell for rollback proof"),
        },
      ],
    });
    const runtime = createSpecialMatchRuntime();
    runtime.instances.fail = armedInstance({
      instanceId: "fail",
      typeId: "fail-batch",
      anchorCellId: "c0",
    });
    getCell(board, "c0").occupant = { type: "special-match", typeId: "fail-batch", instanceId: "fail" };
    queueActivation(runtime, "fail", "direct", 1);
    const before = occupantSnapshot(board);
    const result = resolvePendingActivations(
      board,
      runtime,
      registry,
      createSpecialInteractionRegistry(),
      pack().obstacles,
      { maxActivations: 8, maxEffects: 32 },
      { activations: 0, effects: 0 },
    );
    expect(result.invalid).toBeTruthy();
    expect(occupantSnapshot(board)).toEqual(before);
    expect(runtime.instances.fail?.state).toBe("armed");
  });
});

describe("Special Match cascades", () => {
  it("feeds special effects back into ordinary match detection", () => {
    const board = createBoard(
      {
        topology: { kind: "custom", notes: "Special clear then flow creates an ordinary match." },
        cells: [
          { id: "s0", position: { x: 0, y: 0 } },
          { id: "x1", position: { x: 1, y: 0 } },
          { id: "b0", position: { x: 1, y: -1 } },
          { id: "b1", position: { x: 1, y: 1 } },
          { id: "src", position: { x: 2, y: 0 } },
        ],
        adjacency: [
          { from: "s0", to: "x1", direction: "e" },
          { from: "b0", to: "x1", direction: "s" },
          { from: "x1", to: "b1", direction: "s" },
        ],
        flow: [{ from: "src", to: "x1" }],
        movement: { mode: "along-flow", refill: { mode: "none" } },
      },
      {
        s0: { type: "empty" },
        x1: { type: "icon", iconId: C },
        b0: { type: "icon", iconId: B },
        b1: { type: "icon", iconId: B },
        src: { type: "icon", iconId: B },
      },
    );
    const runtime = createSpecialMatchRuntime();
    runtime.instances.line = armedInstance({
      instanceId: "line",
      anchorCellId: "s0",
      metadata: {
        candidateType: "line-4",
        affectedCellIds: ["s0", "x1"],
        directionsUsed: ["e"],
        ruleId: "directional-aligned",
        category: "line-clear",
      },
    });
    getCell(board, "s0").occupant = { type: "special-match", typeId: "line-clear", instanceId: "line" };
    queueActivation(runtime, "line", "direct", 25);
    const { report } = cascade(board, cluster, { specialRuntime: runtime });
    expect(report.combo).toBeGreaterThanOrEqual(1);
    expect(report.steps.some((step) => step.phase === "special-activate")).toBe(true);
    expect(report.steps.some((step) => step.phase === "resolve" && step.matches.some((group) => group.colorIconId === B))).toBe(true);
  });

  it("activates a struck Special Match only through a registered interaction", () => {
    const board = lineBoard([A, A, A, A]);
    const { runtime } = cascade(board, aligned);
    const first = Object.values(runtime.instances)[0]!;
    runtime.instances.target = armedInstance({
      instanceId: "target",
      typeId: "line-clear",
      anchorCellId: "c3",
      metadata: {
        candidateType: "line-4",
        affectedCellIds: ["c3"],
        directionsUsed: ["e"],
        ruleId: "directional-aligned",
        category: "line-clear",
      },
    });
    getCell(board, "c3").occupant = { type: "special-match", typeId: "line-clear", instanceId: "target" };
    labActivateSpecial(runtime, first.instanceId);
    const { report } = cascade(board, aligned, { specialRuntime: runtime });
    expect(report.specialEvents.some((event) => event.kind === "SPECIAL_INTERACTION_RESOLVED")).toBe(true);
    expect(runtime.instances.target?.state).toBe("resolved");
    expect(createSpecialInteractionRegistry().resolve("line-clear", "line-clear", "strike").result).toBe("activate-target");
    expect(new SpecialInteractionRegistry([]).resolve("line-clear", "area-clear", "strike").result).toBe("ignore");
  });

  it("lets lock obstacles weaken instead of hardcoding obstacle ids in the special", () => {
    const board = lineBoard([A, A, A, A, B]);
    const { runtime } = cascade(board, aligned);
    getCell(board, "c4").obstacles.push({ type: "lock", durability: 2, config: {} });
    const instance = Object.values(runtime.instances)[0]!;
    labActivateSpecial(runtime, instance.instanceId);
    cascade(board, aligned, { specialRuntime: runtime });
    expect(getCell(board, "c4").occupant).toEqual({ type: "icon", iconId: B });
    expect(getCell(board, "c4").obstacles[0]?.durability).toBe(1);
  });

  it("stops with an explicit cascade limit and repeated-state diagnostic", () => {
    const limited = cascade(lineBoard([A, A, A]), cluster, {
      maxCombos: 1,
      iconPool: [A],
      random: scriptedRandom([A, A, A, A, A, A]),
      cascadeLimits: { maxCombos: 1, maxDepth: 64, maxEffects: 256, maxEvents: 512, maxActivations: 64 },
    });
    expect(limited.report.termination === "CASCADE_COMPLETED" || limited.report.termination === "CASCADE_LIMIT_REACHED").toBe(true);

    const looping = createBoard(
      {
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
        movement: { mode: "none", refill: { mode: "spawn-at-sources", sourceCellIds: ["a", "b", "c"] } },
      },
      {
        a: { type: "icon", iconId: A },
        b: { type: "icon", iconId: A },
        c: { type: "icon", iconId: A },
      },
    );
    const { report } = cascade(looping, cluster, {
      iconPool: [A],
      random: scriptedRandom([A, A, A, A, A, A, A, A, A]),
      cascadeLimits: { maxCombos: 8, maxDepth: 8, maxEffects: 256, maxEvents: 512, maxActivations: 64 },
    });
    expect(report.termination).toBe("CASCADE_STATE_REPEAT");
    expect(report.specialEvents.some((event) => event.kind === "CASCADE_STATE_REPEAT")).toBe(true);
    expect(report.stable).toBe(false);
  });

  it("rejects out-of-bounds cascade limits loudly", () => {
    expect(validateCascadeLimits({ maxCombos: 0, maxDepth: 1, maxEffects: 1, maxEvents: 1, maxActivations: 1 }).length).toBeGreaterThan(0);
    expect(() =>
      cascade(lineBoard([A, A, A]), cluster, {
        cascadeLimits: { maxCombos: 0, maxDepth: 1, maxEffects: 1, maxEvents: 1, maxActivations: 1 },
      }),
    ).toThrow(/cascade safety limits/i);
  });
});

describe("Special Match serialization, replay, and accessibility", () => {
  it("round-trips runtime and canonical state", () => {
    const { runtime, board } = cascade(lineBoard([A, A, A, A]), aligned);
    const serialized = serializeSpecialMatchState(board, runtime);
    const again = JSON.parse(JSON.stringify(serialized));
    expect(again).toEqual(serialized);
    expect(serializeSpecialMatchRuntime(runtime).createSeq).toBe(runtime.createSeq);
    expect(
      specialMatchStatesEqual({ board, runtime }, { board, runtime: serializeSpecialMatchRuntime(runtime) }),
    ).toBe(true);
    const cloneBoard = lineBoard([A, A, A, A]);
    expect(gameplayFingerprint(board, runtime)).not.toEqual(gameplayFingerprint(cloneBoard, createSpecialMatchRuntime()));
  });

  it("validates instances, orphans, and unknown types without repairing them", () => {
    const board = lineBoard([A, B, C]);
    const runtime = createSpecialMatchRuntime();
    runtime.instances.orphan = armedInstance({ instanceId: "orphan", typeId: "line-clear", anchorCellId: "c0" });
    const issues = validateSpecialMatchState(board, runtime, createSpecialMatchRegistry());
    expect(issues.some((item) => item.code === "special.orphan_instance")).toBe(true);
    runtime.instances.orphan.typeId = "invented";
    const unknown = validateSpecialMatchState(board, runtime, createSpecialMatchRegistry());
    expect(unknown.some((item) => item.code === "special.unknown_type")).toBe(true);
  });

  it("replays Special Match creation, activation order, and final occupants", () => {
    const document = {
      ...loadSpecialFixture("special.line-create"),
      cells: [
        { id: "c0", position: { x: 0, y: 0 }, initialIcon: A },
        { id: "c1", position: { x: 1, y: 0 }, initialIcon: A },
        { id: "c2", position: { x: 2, y: 0 }, initialIcon: A },
        { id: "c3", position: { x: 3, y: 0 }, initialIcon: B },
        { id: "side", position: { x: 3, y: 1 }, initialIcon: A },
      ],
      connections: [
        { from: "c0", to: "c1", direction: "e" },
        { from: "c1", to: "c2", direction: "e" },
        { from: "c2", to: "c3", direction: "e" },
        { from: "c3", to: "side", direction: "s" },
      ],
    };
    const first = startPlayground({ document, registries: pack(), seed: "special-replay" });
    const second = startPlayground({ document, registries: pack(), seed: "special-replay" });
    expect(first.swap("c3", "side").ok).toBe(true);
    expect(second.swap("c3", "side").ok).toBe(true);
    expect(first.specialRuntime.createSeq).toBe(second.specialRuntime.createSeq);
    expect(Object.keys(first.specialRuntime.instances)).toEqual(Object.keys(second.specialRuntime.instances));
    expect(occupantSnapshot(first.board)).toEqual(occupantSnapshot(second.board));

    const replayed = replayTape(first.tape, {
      registries: pack(),
      matchRules: first.matchRules,
      iconPool: first.iconPool,
    });
    expect(occupantSnapshot(replayed.board)).toEqual(occupantSnapshot(first.board));
    expect(replayed.cascade?.specialMatchesCreated).toEqual(first.lastCascade?.specialMatchesCreated);
    expect(replayed.cascade?.termination).toBe(first.lastCascade?.termination);
    const created = replayed.tape.events.find((event) => event.kind === "special-match");
    expect(created && created.kind === "special-match" ? created.created.length : 0).toBeGreaterThan(0);
  });

  it("describes Special Matches without color and stays reduced-motion compatible", () => {
    const { runtime, board } = cascade(lineBoard([A, A, A, A]), aligned);
    const instance = Object.values(runtime.instances)[0]!;
    const a11y = defaultSpecialAccessibility(instance.typeId, instance.anchorCellId);
    expect(a11y.label).toBe(`line-clear Special Match at cell ${instance.anchorCellId}`);
    expect(a11y.nonColorIndicator).toContain(instance.typeId);
    expect(a11y.description).toMatch(/Not an inventory Special Icon/);
    expect(a11y.reducedMotion).toMatch(/presentation only/i);
    expect(explainSpecialMatch(instance, runtime.events)).toMatch(/WHY WAS THIS SPECIAL MATCH CREATED/);
    const inspection = inspectSpecialMatches(board, aligned, pack().icons, runtime);
    expect(inspection.validation.filter((item) => item.severity === "error")).toEqual([]);
    expect(inspection.serialized).toContain(instance.instanceId);
  });
});

describe("Special Match architecture boundaries", () => {
  it("does not branch on Land and does not treat inventory Special Icons as board specials", () => {
    const sources = [
      "src/special-matches/cascade.ts",
      "src/special-matches/creation.ts",
      "src/special-matches/activation.ts",
      "src/special-matches/catalog.ts",
      "src/cascade/pipeline.ts",
    ].map((path) => readFileSync(path, "utf8"));
    expect(sources.join("\n")).not.toMatch(/if \(land ===/);
    expect(sources.join("\n")).not.toMatch(/Math\.random\(/);
    expect(SPECIAL_MATCH_TYPE_IDS.some((id) => (SPECIAL_ICON_IDS as readonly string[]).includes(id))).toBe(false);
  });

  it("keeps special fixtures as engine tests, not campaign levels", () => {
    for (const name of readdirSync("data/lab/special").filter((file) => file.endsWith(".json"))) {
      const doc = JSON.parse(readFileSync(`data/lab/special/${name}`, "utf8"));
      expect(doc.purpose).toBe("engine-fixture");
      expect(doc.status).toBe("development");
      expect(doc.land).toBeUndefined();
      expect(doc.id).not.toMatch(/level[-.]?(1|80|640)/i);
    }
  });
});
