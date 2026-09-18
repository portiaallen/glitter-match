import { describe, expect, it } from "vitest";
import { LAND_IDS } from "../src/ids.js";
import {
  CANONICAL_MECHANICAL_VERBS,
  createLandRegistry,
  createMechanicalVerbRegistry,
  LAND_CATALOG,
  UNRESOLVED_FINALE,
  validateLandDna,
} from "../src/lands/index.js";
import { createMechanicRegistry } from "../src/mechanics/index.js";
import { throwIfErrors } from "../src/validation.js";

describe("Land DNA", () => {
  it("registers eight canonical mechanical identities", () => {
    const lands = createLandRegistry();
    const verbs = createMechanicalVerbRegistry();
    const mechanics = createMechanicRegistry();
    expect(() => throwIfErrors(validateLandDna(lands, verbs, mechanics))).not.toThrow();
    expect(LAND_CATALOG).toHaveLength(8);
    expect(LAND_CATALOG.map((land) => land.id)).toEqual([...LAND_IDS]);
    expect(LAND_CATALOG.map((land) => [land.philosophicalQuestion, land.designPrinciple])).toEqual([
      ["Who are you?", "Look carefully."],
      ["How do you express yourself?", "Express yourself."],
      ["What connects you?", "Connection changes the board."],
      ["What are you becoming?", "Change creates possibility."],
      ["What do you believe?", "Not everything is what it appears to be."],
      ["Can you flow?", "Move with the system."],
      ["What will you protect?", "Position is power."],
      ["What is possible?", "Possibility has no edge."],
    ]);
  });

  it("keeps finale and mechanic-introduction references unresolved", () => {
    for (const land of LAND_CATALOG) {
      expect(land.finale).toEqual(UNRESOLVED_FINALE);
      expect(land.finale.levelRef).toBeNull();
      expect(land.progression.finaleDesignation).toBe("level-80-signature");
      expect(land.progression.mechanicIntroductionRefs).toEqual([]);
      expect(land.progression.gateTransitionRefs).toEqual([]);
      expect(land.mechanicRegistry).toEqual([`land.${land.id}`]);
    }
  });

  it("binds each Land to registered mechanical verbs and vocabulary", () => {
    const verbs = createMechanicalVerbRegistry();
    expect(verbs.list().map((verb) => verb.id)).toEqual([...CANONICAL_MECHANICAL_VERBS]);
    for (const land of LAND_CATALOG) {
      expect(land.mechanicalVerbs.length).toBeGreaterThan(0);
      expect(land.mechanicalLanguage.length).toBeGreaterThan(0);
      expect(land.boardLanguage.length).toBeGreaterThan(0);
      expect(land.movementLanguage.length).toBeGreaterThan(0);
      expect(land.matchLanguage.length).toBeGreaterThan(0);
      expect(land.obstacleLanguage.length).toBeGreaterThan(0);
      expect(land.objectiveLanguage.length).toBeGreaterThan(0);
      expect(land.visualLanguage.length).toBeGreaterThan(0);
      expect(land.audioLanguage.length).toBeGreaterThan(0);
      expect(land.accessibilityConsiderations.nonColorOnly.length).toBeGreaterThan(0);
      for (const verb of land.mechanicalVerbs) {
        expect(verbs.has(verb)).toBe(true);
      }
    }
    expect(LAND_CATALOG.find((land) => land.id === "quintara")?.difficultyBias.rngSensitivity).toBe(1);
    expect(LAND_CATALOG.find((land) => land.id === "glimmer")?.accessibilityConsiderations.timingAccommodations).toMatch(
      /Puzzle thinking/,
    );
  });

  it("rejects unknown verbs and authored finale references", () => {
    const verbs = createMechanicalVerbRegistry();
    const lumina = LAND_CATALOG[0]!;
    const lands = createLandRegistry([
      {
        ...lumina,
        mechanicalVerbs: ["not-a-verb"],
        finale: { ...lumina.finale, levelRef: "lumina.80" },
      },
      ...LAND_CATALOG.slice(1),
    ]);
    expect(lands.get("lumina").mechanicalVerbs).toEqual(["not-a-verb"]);
    const issues = validateLandDna(lands, verbs, createMechanicRegistry());
    expect(issues.map((item) => item.code)).toContain("land.unknown_verb");
    expect(issues.map((item) => item.code)).toContain("land.finale_authored");
  });

  it("allows future verbs without rewriting the engine", () => {
    const verbs = createMechanicalVerbRegistry();
    verbs.register({ id: "resonate", description: "Future vocabulary only.", mechanicIds: [] });
    verbs.associate("resonate", "land.lumina");
    expect(verbs.get("resonate").mechanicIds).toEqual(["land.lumina"]);
  });
});
