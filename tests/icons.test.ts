import { describe, expect, it } from "vitest";
import { createEmptyIconRegistry, createGlitterIcon } from "../src/icons/index.js";
import { GLITTER_ICON_ID } from "../src/ids.js";
import { createProductionIconRegistry } from "../src/content/index.js";
import { registerDevIcons } from "../src/content/dev-icons.js";
import { throwIfErrors } from "../src/validation.js";

describe("icon registry", () => {
  it("registers the Glitter Icon as a universal identity with no Land", () => {
    const registry = createEmptyIconRegistry();
    const glitter = registry.get(GLITTER_ICON_ID);
    expect(glitter.kind).toBe("glitter");
    if (glitter.kind === "glitter") {
      expect(glitter.landId).toBeNull();
    }
  });

  it("rejects duplicate ordinary icon identities across Lands", () => {
    const registry = createEmptyIconRegistry();
    registry.register({
      id: "spark",
      kind: "ordinary",
      landId: "lumina",
      familyId: "lumina.ordinary",
      contentVersion: "0.1.0-architecture",
      presentation: { displayName: "Spark", patternId: "spark" },
    });
    expect(() =>
      registry.register({
        id: "spark",
        kind: "ordinary",
        landId: "glimmer",
        familyId: "glimmer.ordinary",
        contentVersion: "0.1.0-architecture",
        presentation: { displayName: "Spark", patternId: "spark" },
      }),
    ).toThrow(/ZERO DUPLICATES/);
  });

  it("detects duplicate ordinary display names across Lands", () => {
    const registry = createEmptyIconRegistry();
    registry.register({
      id: "lumina-spark",
      kind: "ordinary",
      landId: "lumina",
      familyId: "lumina.ordinary",
      contentVersion: "0.1.0-architecture",
      presentation: { displayName: "Radiant Spark", patternId: "a" },
    });
    registry.register({
      id: "glimmer-spark",
      kind: "ordinary",
      landId: "glimmer",
      familyId: "glimmer.ordinary",
      contentVersion: "0.1.0-architecture",
      presentation: { displayName: "Radiant Spark", patternId: "b" },
    });
    expect(() => throwIfErrors(registry.validateIntegrity())).toThrow(/duplicated across Lands/);
  });

  it("keeps special icons out of land families", () => {
    const registry = createProductionIconRegistry();
    const bomb = registry.get("glitter-bomb");
    expect(bomb.kind).toBe("special");
    expect(registry.ordinaryIconsFor("lumina").every((icon) => icon.kind === "ordinary")).toBe(true);
    expect(registry.ordinaryIconsFor("lumina").some((icon) => icon.id === "glitter-bomb")).toBe(false);
  });

  it("allows development icons only as explicit fixtures", () => {
    const registry = createEmptyIconRegistry();
    registerDevIcons(registry);
    expect(registry.get("dev.spark-a").kind).toBe("dev");
  });

  it("does not treat the Glitter Icon as a land family member", () => {
    const glitter = createGlitterIcon();
    expect(glitter.landId).toBeNull();
    expect(glitter.id).toBe("glitter");
  });
});
