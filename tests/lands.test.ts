import { describe, expect, it } from "vitest";
import { LAND_IDS } from "../src/ids.js";
import { createLandRegistry, LAND_CATALOG } from "../src/lands/index.js";
import { throwIfErrors } from "../src/validation.js";

describe("land registry", () => {
  it("registers exactly the eight established Lands", () => {
    const lands = createLandRegistry();
    expect(lands.list().map((land) => land.id)).toEqual([...LAND_IDS]);
    expect(LAND_CATALOG).toHaveLength(8);
    expect(LAND_CATALOG.map((land) => land.slug)).toEqual([...LAND_IDS]);
    expect(LAND_CATALOG.map((land) => land.name)).toEqual([
      "Lumina",
      "Glimmer",
      "Bloomara",
      "Transcendia",
      "Quintara",
      "Iridescia",
      "Aurelia",
      "Infinity Isles",
    ]);
    expect(LAND_CATALOG.map((land) => land.philosophicalQuestion)).toEqual([
      "Who are you?",
      "How do you express yourself?",
      "What connects you?",
      "What are you becoming?",
      "What do you believe?",
      "Can you flow?",
      "What will you protect?",
      "What is possible?",
    ]);
    expect(() => throwIfErrors(lands.validateIntegrity())).not.toThrow();
  });

  it("does not invent extra lands", () => {
    const lands = createLandRegistry();
    expect(lands.has("lumina")).toBe(true);
    expect(lands.has("shadowmere")).toBe(false);
  });
});
