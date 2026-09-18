import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { LAND_IDS } from "../src/ids.js";
import {
  DEV_PROGRESSION_CATALOG,
  DEV_PROGRESSION_UNIVERSE,
  abandonAttempt,
  campaignProgress,
  classifyContentVersion,
  compareAttempts,
  completeAttempt,
  createNewProgression,
  createProgressionEvent,
  createProgressionRuntime,
  createUniverseRegistry,
  defaultProgressionAccessibility,
  explainLand,
  explainLevel,
  failAttempt,
  inspectProgression,
  isBetterResult,
  levelRefKey,
  nodeView,
  parseLevelReference,
  restoreProgression,
  selectBestResult,
  serializeProgression,
  simulateCompletion,
  startAttempt,
  validatePlayerProgress,
  validateUniverseContent,
  type ProgressionNode,
  type UniverseContent,
} from "../src/progression/index.js";

function runtime() {
  return createProgressionRuntime(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG);
}

describe("progression identity and hierarchy", () => {
  it("uses stable references rather than array position", () => {
    const ref = parseLevelReference({
      universeId: "dev.universe",
      landId: "lumina",
      packId: "dev.pack.progression",
      levelId: "dev.level.root",
    });
    expect(levelRefKey(ref)).toBe("dev.universe/lumina/dev.pack.progression/dev.level.root");
    expect(DEV_PROGRESSION_CATALOG[0]?.id).not.toBe("1");
    expect(() => parseLevelReference({ universeId: "", landId: "lumina", packId: "p", levelId: "l" })).toThrow(/universeId/);
  });

  it("registers a development universe and rejects duplicates and campaign-marked fixtures", () => {
    const registry = createUniverseRegistry();
    registry.register(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG);
    expect(registry.has("dev.universe")).toBe(true);
    expect(() => registry.register(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG)).toThrow(/already registered/);
    expect(() => registry.get("glitter-universe")).toThrow(/Unknown universe/);
    const campaignMarked = { ...DEV_PROGRESSION_UNIVERSE, purpose: "campaign" as const };
    expect(validateUniverseContent(campaignMarked, DEV_PROGRESSION_CATALOG).some((item) => item.code === "progression.fixture_as_campaign")).toBe(true);
  });
});

describe("availability and unlocking", () => {
  it("starts root available and everything else locked", () => {
    const progress = runtime();
    expect(nodeView(progress, "dev.level.root")).toBe("AVAILABLE");
    expect(nodeView(progress, "dev.level.linear")).toBe("LOCKED");
    expect(explainLevel(progress, "dev.level.linear")).toContain("WHY IS THIS LEVEL LOCKED?");
    expect(explainLevel(progress, "dev.level.linear")).toContain("dev.level.root");
  });

  it("unlocks linearly after completion", () => {
    const progress = runtime();
    simulateCompletion(progress, "dev.level.root");
    expect(nodeView(progress, "dev.level.root")).toBe("COMPLETED");
    expect(nodeView(progress, "dev.level.linear")).toBe("AVAILABLE");
    expect(nodeView(progress, "dev.level.branch-a")).toBe("AVAILABLE");
    expect(explainLevel(progress, "dev.level.linear")).toContain("WHY DID THIS LEVEL UNLOCK?");
  });

  it("supports branching AND, OR, NOT, threshold, and SEQUENCE", () => {
    const progress = runtime();
    simulateCompletion(progress, "dev.level.root");
    simulateCompletion(progress, "dev.level.branch-a");
    expect(nodeView(progress, "dev.level.or")).toBe("AVAILABLE");
    expect(nodeView(progress, "dev.level.and")).toBe("LOCKED");
    simulateCompletion(progress, "dev.level.branch-b");
    expect(nodeView(progress, "dev.level.and")).toBe("AVAILABLE");
    simulateCompletion(progress, "dev.level.linear");
    expect(nodeView(progress, "dev.level.threshold")).toBe("AVAILABLE");

    const notUniverse: UniverseContent = {
      ...DEV_PROGRESSION_UNIVERSE,
      id: "dev.universe.not",
      packs: [{ ...DEV_PROGRESSION_UNIVERSE.packs[0]!, universeId: "dev.universe.not", nodeIds: ["dev.level.root", "dev.level.not"], edges: [] }],
      lands: [{ landId: "lumina", packIds: ["dev.pack.progression"], completionPolicy: "ALL_REQUIRED_LEVELS" }],
    };
    const notCatalog: ProgressionNode[] = [
      DEV_PROGRESSION_CATALOG[0]!,
      {
        ...DEV_PROGRESSION_CATALOG[0]!,
        id: "dev.level.not",
        unlock: { op: "not", children: [{ op: "level-completed", levelId: "dev.level.root" }] },
        accessibilityLabel: "NOT root",
      },
    ];
    const notRuntime = createProgressionRuntime(notUniverse, notCatalog);
    expect(nodeView(notRuntime, "dev.level.not")).toBe("AVAILABLE");
    simulateCompletion(notRuntime, "dev.level.root");
    expect(nodeView(notRuntime, "dev.level.not")).toBe("LOCKED");

    const seqUniverse: UniverseContent = {
      ...DEV_PROGRESSION_UNIVERSE,
      id: "dev.universe.seq",
      packs: [
        {
          ...DEV_PROGRESSION_UNIVERSE.packs[0]!,
          universeId: "dev.universe.seq",
          nodeIds: ["dev.level.root", "dev.level.linear", "dev.level.seq"],
          edges: [{ from: "dev.level.root", to: "dev.level.linear" }],
        },
      ],
      lands: [{ landId: "lumina", packIds: ["dev.pack.progression"], completionPolicy: "ALL_REQUIRED_LEVELS" }],
    };
    const seq = createProgressionRuntime(seqUniverse, [
      DEV_PROGRESSION_CATALOG[0]!,
      DEV_PROGRESSION_CATALOG[1]!,
      {
        ...DEV_PROGRESSION_CATALOG[1]!,
        id: "dev.level.seq",
        unlock: {
          op: "sequence",
          children: [
            { op: "level-completed", levelId: "dev.level.root" },
            { op: "level-completed", levelId: "dev.level.linear" },
          ],
        },
      },
    ]);
    expect(nodeView(seq, "dev.level.seq")).toBe("LOCKED");
    simulateCompletion(seq, "dev.level.root");
    expect(nodeView(seq, "dev.level.seq")).toBe("LOCKED");
    simulateCompletion(seq, "dev.level.linear");
    expect(nodeView(seq, "dev.level.seq")).toBe("AVAILABLE");
  });

  it("rejects missing prerequisites and cycles", () => {
    const missing: ProgressionNode[] = [
      { ...DEV_PROGRESSION_CATALOG[0]!, unlock: { op: "level-completed", levelId: "dev.level.ghost" } },
    ];
    expect(validateUniverseContent({ ...DEV_PROGRESSION_UNIVERSE, packs: [{ ...DEV_PROGRESSION_UNIVERSE.packs[0]!, nodeIds: ["dev.level.root"], edges: [] }] }, missing).some((item) => item.code === "progression.missing_prerequisite")).toBe(true);
    const cyclic: ProgressionNode[] = [
      { ...DEV_PROGRESSION_CATALOG[0]!, id: "dev.level.a", unlock: { op: "level-completed", levelId: "dev.level.b" } },
      { ...DEV_PROGRESSION_CATALOG[0]!, id: "dev.level.b", unlock: { op: "level-completed", levelId: "dev.level.a" } },
    ];
    expect(
      validateUniverseContent(
        { ...DEV_PROGRESSION_UNIVERSE, packs: [{ ...DEV_PROGRESSION_UNIVERSE.packs[0]!, nodeIds: ["dev.level.a", "dev.level.b"], edges: [{ from: "dev.level.a", to: "dev.level.b" }] }] },
        cyclic,
      ).some((item) => item.code === "progression.dependency_cycle"),
    ).toBe(true);
  });
});

describe("attempts, completion, best result, mastery", () => {
  it("tracks failed, abandoned, and completed attempts separately", () => {
    const progress = runtime();
    const failed = startAttempt(progress, "dev.level.root", "seed-a");
    failAttempt(progress, failed.attemptId, { score: 1, moveCount: 2 });
    expect(progress.player.attempts[failed.attemptId]?.outcome).toBe("failed");
    const abandoned = startAttempt(progress, "dev.level.root", "seed-b");
    abandonAttempt(progress, abandoned.attemptId);
    expect(progress.player.attempts[abandoned.attemptId]?.outcome).toBe("abandoned");
    simulateCompletion(progress, "dev.level.root", { score: 10, moveCount: 4 });
    expect(progress.player.levels["dev.level.root"]?.completion.completed).toBe(true);
    expect(progress.player.levels["dev.level.root"]?.completion.completionCount).toBe(1);
    simulateCompletion(progress, "dev.level.root", { score: 8, moveCount: 4 });
    expect(progress.player.levels["dev.level.root"]?.completion.completionCount).toBe(2);
  });

  it("is idempotent for duplicate completion events", () => {
    const progress = runtime();
    const attempt = startAttempt(progress, "dev.level.root");
    completeAttempt(progress, attempt.attemptId, { score: 9, moveCount: 3 });
    const count = progress.player.levels["dev.level.root"]?.completion.completionCount;
    const events = progress.player.events.length;
    completeAttempt(progress, attempt.attemptId, { score: 9, moveCount: 3 });
    expect(progress.player.levels["dev.level.root"]?.completion.completionCount).toBe(count);
    expect(progress.player.events.length).toBe(events);
  });

  it("replaces best results only when the registered comparator says so", () => {
    const progress = runtime();
    simulateCompletion(progress, "dev.level.root", { score: 10, moveCount: 5 });
    const first = progress.player.levels["dev.level.root"]?.best?.attemptId;
    simulateCompletion(progress, "dev.level.root", { score: 4, moveCount: 5 });
    expect(progress.player.levels["dev.level.root"]?.best?.attemptId).toBe(first);
    simulateCompletion(progress, "dev.level.root", { score: 40, moveCount: 5 });
    expect(progress.player.levels["dev.level.root"]?.best?.score).toBe(40);
    const a = { attemptId: "a", levelId: "x", contentVersion: "10.0.0", moveCount: 3, score: 10, outcome: "completed" as const, completed: true, mastered: false };
    const b = { ...a, attemptId: "b" };
    expect(compareAttempts("higher-score", a, b)).toBeGreaterThan(0);
    expect(isBetterResult("higher-score", a)).toBe(true);
    expect(selectBestResult("fewer-moves", [a, { ...b, moveCount: 1 }])?.attemptId).toBe("b");
  });

  it("keeps mastery separate from completion and versioned", () => {
    const progress = runtime();
    simulateCompletion(progress, "dev.level.root", { score: 10, moveCount: 3, mastered: false });
    expect(progress.player.levels["dev.level.root"]?.completion.completed).toBe(true);
    expect(progress.player.levels["dev.level.root"]?.mastery.mastered).toBe(false);
    expect(nodeView(progress, "dev.level.root")).toBe("COMPLETED");
    simulateCompletion(progress, "dev.level.root", { score: 10, moveCount: 3, mastered: true });
    expect(progress.player.levels["dev.level.root"]?.mastery.state).toBe("MASTERED");
    expect(progress.player.levels["dev.level.root"]?.mastery.masteryVersion).toBe("10.0.0");
    expect(nodeView(progress, "dev.level.root")).toBe("MASTERED");
  });
});

describe("aggregates, finale, events, persistence", () => {
  it("derives pack, land, and campaign progress and finale eligibility", () => {
    const progress = runtime();
    expect(campaignProgress(progress).completionRatio).toBe(0);
    expect(explainLand(progress, "lumina")).toContain("WHY IS THIS LAND INCOMPLETE?");
    expect(campaignProgress(progress).lands[0]?.finaleEligible).toBe(false);
    simulateCompletion(progress, "dev.level.root");
    simulateCompletion(progress, "dev.level.linear");
    simulateCompletion(progress, "dev.level.branch-a");
    simulateCompletion(progress, "dev.level.branch-b");
    simulateCompletion(progress, "dev.level.and");
    simulateCompletion(progress, "dev.level.or");
    simulateCompletion(progress, "dev.level.threshold");
    expect(campaignProgress(progress).packs[0]?.complete).toBe(true);
    expect(campaignProgress(progress).lands[0]?.complete).toBe(true);
    expect(campaignProgress(progress).lands[0]?.finaleEligible).toBe(true);
    expect(nodeView(progress, "dev.level.capstone")).toBe("AVAILABLE");
    simulateCompletion(progress, "dev.level.capstone");
    expect(nodeView(progress, "dev.level.post")).toBe("AVAILABLE");
    expect(explainLand(progress, "lumina")).toContain("It is complete.");
  });

  it("rolls back a failed transaction and serializes without loss", () => {
    const progress = runtime();
    const before = serializeProgression(progress);
    expect(() => completeAttempt(progress, "missing", { score: 1, moveCount: 1 })).toThrow(/Unknown attempt/);
    expect(serializeProgression(progress)).toEqual(before);
    simulateCompletion(progress, "dev.level.root", { score: 12, moveCount: 2 });
    const restored = restoreProgression(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG, serializeProgression(progress));
    expect(restored.player.completedLevelIds).toEqual(["dev.level.root"]);
    expect(nodeView(restored, "dev.level.linear")).toBe("AVAILABLE");
    const corrupt = serializeProgression(progress);
    corrupt.completedLevelIds.push("does-not-exist");
    expect(validatePlayerProgress(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG, corrupt).some((item) => item.code === "progression.unknown_level")).toBe(true);
    expect(() => restoreProgression(DEV_PROGRESSION_UNIVERSE, DEV_PROGRESSION_CATALOG, corrupt)).toThrow(/Corrupted progression state/);
  });

  it("replays the same completion sequence deterministically", () => {
    const script = ["dev.level.root", "dev.level.linear", "dev.level.branch-a"] as const;
    const run = () => {
      const progress = runtime();
      for (const id of script) {
        simulateCompletion(progress, id, { score: 7, moveCount: 3 });
      }
      return serializeProgression(progress);
    };
    expect(run()).toEqual(run());
    expect(createProgressionEvent("LEVEL_COMPLETED", 1, "done", { attemptId: "a1" }).id).toBe("a1:LEVEL_COMPLETED");
  });

  it("classifies historical content versions without inventing migration policy", () => {
    expect(classifyContentVersion("10.0.0", "10.0.0")).toBe("VALID");
    expect(classifyContentVersion("10.0.0", "10.1.0")).toBe("STALE");
    expect(classifyContentVersion("9.0.0", "10.0.0")).toBe("INVALIDATED");
    expect(classifyContentVersion("nope", "10.0.0")).toBe("UNKNOWN");
  });

  it("exposes non-color accessibility text", () => {
    const a11y = defaultProgressionAccessibility("LOCKED", "Linear unlock");
    expect(a11y.statusText).toBe("Locked");
    expect(a11y.nonColorIndicator).toBe("PROG:LOCKED");
    expect(a11y.reducedMotion).toMatch(/presentation only/);
    const inspection = inspectProgression(runtime(), "dev.level.root");
    expect(inspection.levels["dev.level.root"]?.accessibility.nonColorIndicator).toBe("PROG:AVAILABLE");
  });

  it("keeps createNewProgression empty of campaign assumptions and contains no hardcoded 640/8-land logic", () => {
    const fresh = createNewProgression();
    expect(fresh.completedLevelIds).toEqual([]);
    expect(fresh.unlockedLandIds).toEqual([]);
    const sources = readdirSync("src/progression")
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(`src/progression/${name}`, "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/if\s*\(\s*land\s*===/);
    expect(sources).not.toMatch(/completedLevels\s*===\s*640/);
    expect(sources).not.toMatch(/levelNumber\s*===\s*640/);
    expect(sources).not.toMatch(/LAND_IDS\.length/);
    expect(DEV_PROGRESSION_UNIVERSE.purpose).toBe("engine-fixture");
    expect(DEV_PROGRESSION_UNIVERSE.landIds[0]).toBe(LAND_IDS[0]);
    expect(readFileSync("data/lab/progression/dev-universe.json", "utf8")).toMatch(/ENGINE TEST FIXTURE ONLY/);
  });
});
