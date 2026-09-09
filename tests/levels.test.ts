import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/validation.js";
import { loadAndValidateLevel, parseLevelJson, validateLevel } from "../src/levels/index.js";
import { createProductionPack } from "../src/content/index.js";
import { pack } from "./helpers.js";

const fixture = () => JSON.parse(readFileSync("data/dev/branching-smoke.json", "utf8"));

describe("level schema validation", () => {
  it("accepts the development fixture under the development profile", () => {
    const level = loadAndValidateLevel(fixture(), { ...pack(), profile: "development" });
    expect(level.id).toBe("dev.branching-smoke");
    expect(level.status).toBe("development");
  });

  it("rejects the development fixture in production", () => {
    const parsed = parseLevelJson(fixture());
    const issues = validateLevel(parsed, { ...createProductionPack(), profile: "production" });
    expect(
      issues.some(
        (item) =>
          item.code === "level.dev_icon" ||
          item.code === "level.dev_in_production" ||
          item.code === "level.unknown_icon",
      ),
    ).toBe(true);
  });

  it("fails loudly on unknown icon references", () => {
    const raw = fixture();
    raw.iconPool = ["not-a-real-icon"];
    raw.board.cells = raw.board.cells.map((cell: { initialIcon?: string }) => ({
      ...cell,
      initialIcon: "not-a-real-icon",
    }));
    expect(() => loadAndValidateLevel(raw, { ...pack(), profile: "development" })).toThrow(ValidationError);
  });

  it("fails loudly on illegal objectives", () => {
    const raw = fixture();
    raw.objective = { id: "bad", type: "collection" };
    expect(() => loadAndValidateLevel(raw, { ...pack(), profile: "development" })).toThrow(/collection objectives require/);
  });

  it("fails loudly on unimplemented obstacles", () => {
    const raw = fixture();
    raw.board.cells[0].initialObstacles = [{ type: "stone" }];
    expect(() => loadAndValidateLevel(raw, { ...pack(), profile: "development" })).toThrow(/not implemented/);
  });

  it("fails loudly on unknown fields", () => {
    const raw = fixture();
    raw.surpriseMechanic = true;
    expect(() => parseLevelJson(raw)).toThrow();
  });
});
