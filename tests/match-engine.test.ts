import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileBoardDocument, createBoard } from "../src/board/index.js";
import { DEFAULT_QUARTER_TURN_DIRECTION_MAP } from "../src/board/direction.js";
import {
  BUILT_IN_MATCH_ENGINE_RULES,
  MATCH_ENGINE_FIXTURE_IDS,
  MATCH_ENGINE_RULE_IDS,
  PATTERN_IDS,
  createMatchEngine,
  createPatternRegistry,
  detectMatches,
  matchedCellIds,
  parseMatchResolution,
  runMatchResolution,
  serializeMatchResolution,
  whyCandidateFailed,
  whyMatchCount,
  type MatchEngineRule,
} from "../src/matching/index.js";
import { createDevelopmentPack } from "../src/content/index.js";
import { lineBoard, loadMatchFixture, pack } from "./helpers.js";

function boardFromFixture(id: (typeof MATCH_ENGINE_FIXTURE_IDS)[number]) {
  return createBoard(compileBoardDocument(loadMatchFixture(id)));
}

describe("match rule engine", () => {
  it("registers built-in match rules and patterns", () => {
    const engine = createMatchEngine();
    expect(engine.rules.list().map((rule) => rule.id).sort()).toEqual([...MATCH_ENGINE_RULE_IDS].sort());
    expect(engine.patterns.list().map((handler) => handler.definition.id).sort()).toEqual([...PATTERN_IDS].sort());
    expect(BUILT_IN_MATCH_ENGINE_RULES.every((rule) => rule.deterministic)).toBe(true);
    expect(engine.wildcards.get("universal-glitter").iconId).toBe("glitter");
  });

  it("matches standard 3+ on an irregular graph, not a matrix", () => {
    const board = boardFromFixture("match.irregular-standard");
    const groups = detectMatches(board, { minGroupSize: 3, modes: ["cluster"] }, pack().icons);
    expect(groups).toHaveLength(1);
    expect(matchedCellIds(groups)).toEqual(["hub", "left", "right"]);
    expect(groups[0]?.ruleId).toBe("standard-cluster");
  });

  it("honors 4+ and 5+ minimums", () => {
    const four = lineBoard(["dev.spark-a", "dev.spark-a", "dev.spark-a", "dev.spark-a"]);
    expect(detectMatches(four, { minGroupSize: 4, modes: ["cluster"] }, pack().icons)[0]?.cellIds).toHaveLength(4);
    expect(detectMatches(four, { minGroupSize: 5, modes: ["cluster"] }, pack().icons)).toEqual([]);
    const five = lineBoard(["dev.spark-a", "dev.spark-a", "dev.spark-a", "dev.spark-a", "dev.spark-a"]);
    expect(detectMatches(five, { minGroupSize: 5, modes: ["cluster"] }, pack().icons)[0]?.cellIds).toHaveLength(5);
  });

  it("walks authored directions even when coordinates are scrambled", () => {
    const board = boardFromFixture("match.directional");
    const groups = detectMatches(board, { minGroupSize: 3, modes: ["aligned"] }, pack().icons);
    expect(groups.some((group) => group.pattern === "line")).toBe(true);
    expect(matchedCellIds(groups)).toEqual(["c0", "c1", "c2"]);
    expect(groups[0]?.explain?.directionsUsed).toContain("e");
  });

  it("recognizes L, T, and cross from authored rays", () => {
    const ell = detectMatches(boardFromFixture("match.pattern-l"), { minGroupSize: 3, modes: ["corner"] }, pack().icons);
    expect(ell.some((group) => group.pattern === "corner")).toBe(true);
    expect(matchedCellIds(ell)).toEqual(["c", "e", "n"]);

    const tee = detectMatches(boardFromFixture("match.pattern-t"), { minGroupSize: 3, modes: ["tee"] }, pack().icons);
    expect(tee.some((group) => group.pattern === "tee")).toBe(true);

    const cross = detectMatches(boardFromFixture("match.pattern-cross"), { minGroupSize: 3, modes: ["cross"] }, pack().icons);
    expect(cross.some((group) => group.pattern === "cross")).toBe(true);
    expect(matchedCellIds(cross)).toEqual(["c", "e", "n", "s", "w"]);
  });

  it("detects clusters, cycles, and paths on graph topology", () => {
    const cluster = detectMatches(boardFromFixture("match.cluster"), { minGroupSize: 3, modes: ["cluster"] }, pack().icons);
    expect(matchedCellIds(cluster)).toEqual(["a", "b", "c", "d"]);

    const cycle = runMatchResolution(boardFromFixture("match.cycle-ring"), { minGroupSize: 4, modes: ["cycle"] }, pack().icons);
    expect(cycle.groups.some((group) => group.mode === "cycle")).toBe(true);
    expect(matchedCellIds(cycle.groups)).toEqual(["a", "b", "c", "d"]);

    const path = detectMatches(boardFromFixture("match.path"), { minGroupSize: 3, modes: ["path"] }, pack().icons);
    expect(path.some((group) => group.mode === "path" && group.cellIds.slice(0, 3).join() === "c0,c1,c2" || group.cellIds.includes("c0"))).toBe(true);
    expect(matchedCellIds(path)).toEqual(expect.arrayContaining(["c0", "c1", "c2"]));
    expect(matchedCellIds(path)).not.toContain("c3");
  });

  it("lets the Glitter Icon join ordinary icons and ignores pure glitter groups", () => {
    const wild = detectMatches(boardFromFixture("match.wildcard"), { minGroupSize: 3, modes: ["cluster"] }, pack().icons);
    expect(matchedCellIds(wild)).toEqual(["c0", "c1", "c2"]);
    expect(wild[0]?.colorIconId).toBe("dev.spark-a");

    const glitterOnly = lineBoard(["glitter", "glitter", "glitter"]);
    expect(detectMatches(glitterOnly, { minGroupSize: 3, modes: ["cluster"] }, pack().icons)).toEqual([]);
  });

  it("keeps overlapping matches and records a deterministic overlap policy", () => {
    const board = boardFromFixture("match.overlapping");
    const keepAll = runMatchResolution(board, { minGroupSize: 3, modes: ["cluster", "aligned", "tee"], overlapPolicy: "keep-all" }, pack().icons);
    expect(keepAll.groups.length).toBeGreaterThan(1);
    expect(keepAll.overlaps.length).toBeGreaterThan(0);
    expect(keepAll.overlaps.every((item) => item.deferredGroupIds.length === 0)).toBe(true);

    const largest = runMatchResolution(board, { minGroupSize: 3, modes: ["cluster", "aligned", "tee"], overlapPolicy: "prefer-largest" }, pack().icons);
    expect(largest.groups.length).toBeGreaterThan(0);
    expect(largest.overlaps.some((item) => item.deferredGroupIds.length > 0 || item.keptGroupIds.length > 0)).toBe(true);

    const special = runMatchResolution(board, { minGroupSize: 3, modes: ["cluster", "aligned", "tee"], overlapPolicy: "prefer-special-priority" }, pack().icons);
    expect(special.specialMatchCandidates.length).toBeGreaterThan(0);
    expect(special.events.some((item) => item.kind === "special-match-candidate-created")).toBe(true);
  });

  it("does not create Special Match occupants; candidates are metadata only", () => {
    const board = boardFromFixture("match.pattern-cross");
    const resolution = runMatchResolution(board, { minGroupSize: 3, modes: ["cross"] }, pack().icons);
    expect(resolution.specialMatchCandidates[0]?.candidateType).toBe("cross");
    expect(board.cells["c"]?.occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
  });

  it("explains successful matches and failed pattern candidates", () => {
    const success = runMatchResolution(boardFromFixture("match.irregular-standard"), { minGroupSize: 3, modes: ["cluster"] }, pack().icons);
    expect(whyMatchCount(success.groups[0]!)).toMatch(/Cluster match/);
    expect(success.events.some((item) => item.kind === "match-resolution-complete")).toBe(true);

    const failed = runMatchResolution(boardFromFixture("match.failed-pattern"), { minGroupSize: 3, modes: ["corner"] }, pack().icons);
    expect(failed.groups).toEqual([]);
    expect(whyCandidateFailed(failed, "c").join(" ")).toMatch(/failed at c/);
  });

  it("does not match across blocked edges or disconnected islands", () => {
    const blocked = detectMatches(boardFromFixture("match.blocked-edge"), { minGroupSize: 3, modes: ["cluster", "aligned", "path"] }, pack().icons);
    expect(matchedCellIds(blocked)).toEqual([]);

    const islands = detectMatches(boardFromFixture("match.disconnected"), { minGroupSize: 3, modes: ["cluster"] }, pack().icons);
    expect(islands).toHaveLength(2);
    expect(matchedCellIds(islands)).toEqual(["a1", "a2", "a3", "b1", "b2", "b3"]);
  });

  it("rejects invalid rules loudly and does not repair them", () => {
    const engine = createMatchEngine();
    const base = engine.rules.get("standard-cluster");
    expect(() =>
      engine.rules.register({ ...base, id: "bad id" }),
    ).toThrow(/Invalid match rule/);
    expect(() =>
      engine.rules.register({ ...base, id: "bad-pattern", patternId: "not-a-pattern" as MatchEngineRule["patternId"] }),
    ).toThrow(/Unknown pattern/);
    expect(() =>
      engine.rules.register({
        ...base,
        id: "bad-dir",
        directionRequirements: { labels: ["north-pole"], vocabulary: "n → e → s → w → n", inferFromCoordinates: false },
      }),
    ).toThrow(/Unknown direction label/);
    expect(() => engine.rules.register({ ...base, id: "bad-size", minMatchSize: 5, maxMatchSize: 3 })).toThrow(/Maximum match size/);
    expect(() => engine.rules.register({ ...base, id: "bad-state", allowedCellStates: ["rainbow"] })).toThrow(/Unknown cell state/);
    expect(() =>
      engine.patterns.register({
        definition: {
          id: "bogus",
          version: "7.0.0",
          requiredTopology: "cluster",
          minCells: 5,
          maxCells: 2,
          symmetry: "none",
          allowedTransformations: ["none"],
          wildcardPositions: "any",
          requiredIconRelationships: "compatible-occupants",
          searchConstraints: {},
        },
        detect: () => [],
      }),
    ).toThrow(/maxCells is smaller than minCells/);
  });

  it("attaches accessibility metadata that does not depend on color", () => {
    const groups = detectMatches(boardFromFixture("match.irregular-standard"), { minGroupSize: 3, modes: ["cluster"] }, pack().icons);
    expect(groups[0]?.accessibility?.nonColorIndicator).toContain("cluster");
    expect(groups[0]?.accessibility?.matchedCells).toEqual(["hub", "left", "right"]);
    expect(groups[0]?.accessibility?.audioCue).toBeDefined();
  });

  it("serializes match resolution and is deterministic", () => {
    const board = boardFromFixture("match.overlapping");
    const rules = { minGroupSize: 3, modes: ["cluster", "aligned", "tee"] as const };
    const a = runMatchResolution(board, rules, pack().icons);
    const b = runMatchResolution(board, rules, pack().icons);
    expect(serializeMatchResolution(a)).toBe(serializeMatchResolution(b));
    const roundTrip = parseMatchResolution(serializeMatchResolution(a));
    expect(roundTrip.groups.map((group) => group.groupId)).toEqual(a.groups.map((group) => group.groupId));
  });

  it("bounds pathological searches", () => {
    const board = boardFromFixture("match.cycle-ring");
    const resolution = runMatchResolution(
      board,
      { minGroupSize: 3, modes: ["cycle"], searchBounds: { maxWalks: 2, maxCycleLength: 12 } },
      pack().icons,
    );
    expect(resolution.search.truncated).toBe(true);
    expect(resolution.search.walks).toBeGreaterThan(2);
  });

  it("does not invent per-level wildcards", () => {
    const engine = createMatchEngine();
    expect(() =>
      engine.wildcards.register({
        id: "level-invented",
        version: "1",
        description: "nope",
        iconId: "dev.spark-a",
        mayJoinKinds: ["ordinary"],
        mayFormSoloGroup: true,
        inventableByLevels: false,
        glitterProtected: false,
      }),
    ).not.toThrow();
    expect(() =>
      engine.wildcards.register({
        id: "illegal",
        version: "1",
        description: "nope",
        iconId: "dev.spark-a",
        mayJoinKinds: ["ordinary"],
        mayFormSoloGroup: true,
        inventableByLevels: true as false,
        glitterProtected: false,
      }),
    ).toThrow(/cannot be invented per level/);
  });

  it("exposes rotation vocabulary without using it as screen geometry", () => {
    expect(DEFAULT_QUARTER_TURN_DIRECTION_MAP.n).toBe("e");
    const source = readFileSync("src/matching/pipeline.ts", "utf8") + readFileSync("src/matching/patterns.ts", "utf8");
    expect(source).not.toMatch(/position\.x/);
    expect(source).not.toMatch(/if \(land ===/);
    expect(source).not.toMatch(/Math\.hypot/);
  });

  it("loads every match-engine fixture as an engine-fixture, never a level", () => {
    for (const id of MATCH_ENGINE_FIXTURE_IDS) {
      const document = loadMatchFixture(id);
      expect(document.purpose).toBe("engine-fixture");
      expect(document.status).toBe("development");
      expect(document.id).toBe(id);
    }
  });
});

describe("match engine regression", () => {
  it("keeps cascade-facing detectMatches compatible", () => {
    const board = lineBoard(["dev.spark-a", "dev.spark-a", "dev.spark-a"]);
    const groups = detectMatches(board, { minGroupSize: 3, modes: ["cluster"] }, createDevelopmentPack().icons);
    expect(groups[0]?.cellIds.sort()).toEqual(["c0", "c1", "c2"]);
    expect(groups[0]?.colorIconId).toBe("dev.spark-a");
    expect(groups[0]?.mode).toBe("cluster");
  });

  it("does not treat a custom pattern catalog as a Land branch", () => {
    const patterns = createPatternRegistry();
    expect(patterns.has("cluster")).toBe(true);
    expect(createDevelopmentPack().matchContracts.get("land-registered").implemented).toBe(false);
  });
});
