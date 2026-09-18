import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  CONTENT_VERSION,
  SCHEMA_VERSION,
  createProductionPack,
  emptyArchitecturePack,
  UNIVERSE_ID,
  versionsCompatible,
} from "../src/content/index.js";
import {
  compareDifficulty,
  DIFFICULTY_DIMENSIONS,
  emptyDifficultyVector,
  isCompleteDifficulty,
} from "../src/difficulty/model.js";
import { validateReward } from "../src/economy/index.js";
import { gateReferenceSchema } from "../src/gates/contract.js";
import { isLaboratoryFixtureId, loadAndValidateLevel, parseLevelJson, validateLevel } from "../src/levels/index.js";
import { createMatchRuleRegistry } from "../src/matching/index.js";
import { createObjectiveRegistry, OBJECTIVE_TYPES } from "../src/objectives/index.js";
import { createMechanicRegistry } from "../src/mechanics/index.js";
import { createObstacleRegistry } from "../src/obstacles/index.js";
import { secretContractSchema } from "../src/secrets/contract.js";
import { twistContractSchema } from "../src/twists/contract.js";
import { museumReferenceSchema, personalStoryReferenceSchema, sanctuaryReferenceSchema } from "../src/universe/references.js";
import { pack } from "./helpers.js";
import { DEFAULT_LEVEL_ACCESSIBILITY } from "../src/ui/index.js";

function dnaBoard() {
  return {
    topology: { kind: "linear" as const, notes: "contract fixture graph" },
    cells: [
      { id: "a", position: { x: 0, y: 0 }, initialIcon: "lumina.lion" },
      { id: "b", position: { x: 2, y: 1 }, initialIcon: "lumina.rose" },
      { id: "c", position: { x: 4, y: 0 }, initialIcon: "lumina.lipstick" },
    ],
    adjacency: [
      { from: "a", to: "b", direction: "along" },
      { from: "b", to: "c", direction: "along" },
    ],
  };
}

function completeDifficulty() {
  return Object.fromEntries(DIFFICULTY_DIMENSIONS.map((dimension) => [dimension, 2]));
}

function contractLevel(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract.lumina-dna",
    status: "production",
    land: "lumina",
    title: "DNA contract fixture — not a campaign level",
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    purpose: "contract-fixture",
    shape: "crooked-path",
    symmetry: { kind: "asymmetric", notes: "authored only" },
    board: dnaBoard(),
    iconPool: ["lumina.lion", "lumina.rose", "lumina.lipstick", "glitter"],
    matchRules: { minGroupSize: 3, modes: ["cluster"], contracts: ["cluster", "standard-3+"] },
    movementModel: { traversal: "graph", swap: { allowed: true, requireMatch: true } },
    objective: { id: "collect-lion", type: "collection", iconId: "lumina.lion", count: 1, accessibilityLabel: "Collect one Lion" },
    difficulty: completeDifficulty(),
    pacing: "rest",
    ruleOfThree: { familiar: ["swap"], new: ["crooked path"], surprising: ["rest after complexity"] },
    moveLimit: 8,
    timer: { enabled: false, durationMs: null },
    mastery: { maxMovesUsed: 4, noSpecialIcons: true, rewardRef: "mastery.contract" },
    rewards: [{ kind: "glitter-chips", amount: 5 }],
    accessibility: DEFAULT_LEVEL_ACCESSIBILITY,
    placement: { mode: "authored" },
    ...overrides,
  };
}

describe("Level DNA and content architecture", () => {
  it("parses Level DNA and accepts a production-shaped contract fixture", () => {
    const parsed = parseLevelJson(contractLevel());
    const issues = validateLevel(parsed, { ...createProductionPack(), profile: "production" });
    expect(issues.filter((item) => item.severity === "error")).toEqual([]);
    expect(parsed.ruleOfThree?.familiar).toContain("swap");
    expect(parsed.pacing).toBe("rest");
    expect(parsed.movementModel?.traversal).toBe("graph");
  });

  it("keeps the development branching fixture legal under development only", () => {
    const raw = JSON.parse(readFileSync("data/dev/branching-smoke.json", "utf8"));
    const level = loadAndValidateLevel(raw, { ...pack(), profile: "development" });
    expect(level.id).toBe("dev.branching-smoke");
    expect(level.purpose).toBeUndefined();
  });

  it("rejects laboratory fixtures as production content", () => {
    expect(isLaboratoryFixtureId("lab.heart")).toBe(true);
    const issues = validateLevel(parseLevelJson(contractLevel({ id: "lab.heart", purpose: "engine-fixture" })), {
      ...createProductionPack(),
      profile: "production",
      sourcePath: "data/lab/heart.json",
    });
    expect(issues.some((item) => item.code === "content.lab_as_production")).toBe(true);
  });

  it("rejects campaign purpose and unauthorized icons / Lands", () => {
    const campaign = validateLevel(parseLevelJson(contractLevel({ purpose: "campaign" })), {
      ...createProductionPack(),
      profile: "production",
    });
    expect(campaign.some((item) => item.code === "content.campaign_forbidden")).toBe(true);

    const raw = contractLevel({ iconPool: ["not-a-real-icon"], board: dnaBoard() });
    (raw.board as { cells: Array<{ initialIcon?: string }> }).cells = raw.board.cells.map((cell) => ({
      ...cell,
      initialIcon: "not-a-real-icon",
    }));
    expect(() => loadAndValidateLevel(raw, { ...createProductionPack(), profile: "production" })).toThrow(/Unknown icon/);

    expect(() => parseLevelJson(contractLevel({ land: "shadowmere" }))).toThrow();
  });

  it("requires Rule of Three, complete difficulty, and accessibility for production DNA", () => {
    const missing = validateLevel(parseLevelJson(contractLevel({ ruleOfThree: undefined, accessibility: undefined })), {
      ...createProductionPack(),
      profile: "production",
    });
    expect(missing.some((item) => item.code === "rule_of_three.missing" || item.code === "dna.missing_field")).toBe(true);
    expect(missing.some((item) => item.code === "a11y.missing" || item.code === "dna.missing_field")).toBe(true);

    const colorOnly = validateLevel(
      parseLevelJson(contractLevel({ accessibility: { ...DEFAULT_LEVEL_ACCESSIBILITY, nonColorOnly: false } })),
      { ...createProductionPack(), profile: "production" },
    );
    expect(colorOnly.some((item) => item.code === "a11y.color_only")).toBe(true);
  });

  it("keeps secrets optional unless authored as an objective", () => {
    const issues = validateLevel(
      parseLevelJson(
        contractLevel({
          secret: {
            id: "hidden-beat",
            optional: true,
            hidden: true,
            requiredForCompletion: true,
            accessibility: { label: "Hidden beat", description: "Optional lore" },
          },
        }),
      ),
      { ...createProductionPack(), profile: "production" },
    );
    expect(issues.some((item) => item.code === "secret.required_without_objective")).toBe(true);
  });

  it("separates completion from mastery", () => {
    const issues = validateLevel(
      parseLevelJson(
        contractLevel({
          objective: { id: "precise", type: "precision", moves: 5 },
          mastery: { maxMovesUsed: 8 },
        }),
      ),
      { ...createProductionPack(), profile: "production" },
    );
    expect(issues.some((item) => item.code === "mastery.not_stricter")).toBe(true);
  });

  it("registers objectives, obstacles, mechanics, and match contracts without land branching", () => {
    expect(createObjectiveRegistry().list().map((item) => item.type)).toEqual([...OBJECTIVE_TYPES]);
    expect(createMatchRuleRegistry().has("L")).toBe(true);
    expect(createMatchRuleRegistry().engineModesFor(["L"])).toEqual(["corner"]);
    const mechanics = createMechanicRegistry();
    expect(mechanics.handlersForLand("lumina")[0]?.id).toBe("land.lumina");
    expect(mechanics.get("land.lumina").implemented).toBe(false);
    const source = readFileSync("src/matching/detect.ts", "utf8") + readFileSync("src/cascade/pipeline.ts", "utf8");
    expect(source).not.toMatch(/if \(land ===/);
  });

  it("versions content packs independently and records empty architecture packs", () => {
    const packManifest = emptyArchitecturePack("aurelia");
    expect(packManifest.universeId).toBe(UNIVERSE_ID);
    expect(packManifest.levelIds).toEqual([]);
    expect(packManifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(versionsCompatible("7.1.0", SCHEMA_VERSION)).toBe(true);
    expect(versionsCompatible("6.0.0", SCHEMA_VERSION)).toBe(false);
    const a = emptyDifficultyVector();
    const b = { ...a, movePressure: 4 };
    expect(compareDifficulty(b, a).movePressure).toBe(4);
    expect(isCompleteDifficulty({ authored: completeDifficulty() })).toBe(true);
    expect(isCompleteDifficulty({ authored: { movePressure: 1 } })).toBe(false);
  });

  it("parses optional twist, secret, Gate, and universe references without implementing them", () => {
    const twist = twistContractSchema.parse({
      id: "contract.twist",
      category: "constraint",
      accessibility: { label: "Constraint", description: "Optional twist", nonColorIndicator: "badge" },
    });
    expect(twist.activation).toBe("always");
    expect(
      secretContractSchema.parse({
        id: "contract.secret",
        accessibility: { label: "Hidden", description: "Optional lore" },
      }).requiredForCompletion,
    ).toBe(false);
    expect(
      gateReferenceSchema.parse({
        gateId: "gate.ref",
        originLand: "lumina",
        destinationLand: "glimmer",
        assignment: { mode: "server-authoritative" },
      }).assignment.mode,
    ).toBe("server-authoritative");
    expect(sanctuaryReferenceSchema.parse({ kind: "sanctuary", slotId: "home.1" }).kind).toBe("sanctuary");
    expect(museumReferenceSchema.parse({ kind: "museum", entryId: "entry.1", catalog: "lore" }).catalog).toBe("lore");
    expect(personalStoryReferenceSchema.parse({ kind: "personal-story", beatId: "beat.1" }).kind).toBe(
      "personal-story",
    );
    expect(validateReward({ kind: "museum-entry", amount: 1 }, "rewards[0]")).toMatch(/require an id/);
    expect(validateReward({ kind: "glitter-chips", amount: 3 }, "rewards[0]")).toBeNull();
  });

  it("keeps obstacle handlers accessible and ships zero production levels", () => {
    const obstacles = createObstacleRegistry();
    expect(obstacles.get("lock").accessibilityDescription.length).toBeGreaterThan(0);
    expect(obstacles.get("stone").implemented).toBe(false);
    const campaignFiles = [
      ...readdirSync("data/dev").filter((name) => name.endsWith(".json")),
      ...readdirSync("data/lab").filter((name) => name.endsWith(".json")),
    ];
    expect(campaignFiles.some((name) => /level[-.]?(1|80|640)/i.test(name))).toBe(false);
    for (const name of readdirSync("data/lab").filter((file) => file.endsWith(".json"))) {
      const doc = JSON.parse(readFileSync(`data/lab/${name}`, "utf8"));
      expect(doc.purpose).toBe("engine-fixture");
    }
  });
});
