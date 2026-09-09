import { describe, expect, it } from "vitest";
import { GLITTER_ICON_ID, LAND_IDS } from "../src/ids.js";
import { createEmptyIconRegistry } from "../src/icons/index.js";
import { createLandRegistry, LAND_CATALOG } from "../src/lands/index.js";
import {
  createProductionPack,
  ordinaryIconId,
  ORDINARY_ICONS_PER_LAND,
  validateIconLaw,
} from "../src/content/index.js";
import { SPECIAL_ICON_IDS } from "../src/special-icons/index.js";

describe("canon firewall", () => {
  it("registers exactly eight Lands and no ninth Land", () => {
    const lands = createLandRegistry();
    expect(lands.list()).toHaveLength(8);
    expect(LAND_CATALOG.map((land) => land.id)).toEqual([...LAND_IDS]);
    expect(lands.has("ninth-realm")).toBe(false);
    expect(LAND_CATALOG.every((land) => land.philosophicalQuestion.length > 0)).toBe(true);
  });

  it("gives every ordinary icon exactly one Land and eight icons per Land", () => {
    const pack = createProductionPack();
    const issues = validateIconLaw(pack.icons, pack.lands);
    expect(issues.filter((item) => item.severity === "error")).toEqual([]);
    for (const landId of LAND_IDS) {
      const family = pack.icons.ordinaryIconsFor(landId);
      expect(family).toHaveLength(ORDINARY_ICONS_PER_LAND);
      expect(family.every((icon) => icon.landId === landId)).toBe(true);
    }
  });

  it("keeps the Glitter Icon and Special Icons landless", () => {
    const pack = createProductionPack();
    const glitter = pack.icons.get(GLITTER_ICON_ID);
    expect(glitter.kind).toBe("glitter");
    if (glitter.kind === "glitter") {
      expect(glitter.landId).toBeNull();
    }
    for (const id of SPECIAL_ICON_IDS) {
      const special = pack.icons.get(id);
      expect(special.kind).toBe("special");
    }
  });

  it("rejects unauthorized icons, Lands, and silent reassignment", () => {
    const pack = createProductionPack();
    expect(pack.icons.has("shadowmere.void")).toBe(false);
    expect(pack.lands.has("shadowmere")).toBe(false);
    const lion = ordinaryIconId("lumina", "lion");
    const current = pack.icons.get(lion);
    if (current.kind !== "ordinary") {
      throw new Error("expected ordinary lion");
    }
    expect(() => pack.icons.reassignOrdinaryLand(lion, "glimmer", current.contentVersion)).toThrow(
      /content-version change/,
    );
    expect(() => pack.icons.reassignOrdinaryLand(lion, "glimmer", "9.9.9-reassigned")).not.toThrow();
  });

  it("does not allow a ninth Land to appear through icon ownership", () => {
    const icons = createEmptyIconRegistry();
    const lands = createLandRegistry();
    expect(() =>
      icons.register({
        id: "ghost.mark",
        kind: "ordinary",
        landId: "shadowmere" as never,
        familyId: "shadowmere.ordinary",
        contentVersion: "1",
        presentation: { displayName: "Ghost", patternId: "ghost" },
      }),
    ).toThrow(/unknown land/);
    expect(lands.has("shadowmere")).toBe(false);
    expect(icons.list().every((icon) => icon.kind !== "ordinary" || lands.has(icon.landId))).toBe(true);
  });

  it("marks the Champagne Glass as a non-alcoholic decorative theme", () => {
    const pack = createProductionPack();
    const glass = pack.icons.get("glimmer.champagne-glass");
    expect(glass.kind).toBe("ordinary");
    if (glass.kind === "ordinary") {
      expect(glass.notes).toMatch(/non-alcoholic/i);
    }
  });
});
