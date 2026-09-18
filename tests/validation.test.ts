import { describe, expect, it } from "vitest";
import { createBoard, validateBoardDefinition } from "../src/board/index.js";
import { createDevelopmentPack } from "../src/content/index.js";
import { ValidationError } from "../src/validation.js";

describe("board validation hardening", () => {
  it("identifies duplicate portals, self-edges, and illegal rotation cycles", () => {
    const issues = validateBoardDefinition({
      topology: { kind: "rotating" },
      cells: [
        { id: "a", position: { x: 0, y: 0 }, initialIcon: "nope.icon", sectionId: "wheel" },
        { id: "b", position: { x: 1, y: 0 }, sectionId: "wheel" },
      ],
      adjacency: [
        { from: "a", to: "a", kind: "adjacent" },
        { from: "a", to: "b", direction: "" },
      ],
      portals: [
        { id: "p1", from: "a", to: "b" },
        { id: "p2", from: "b", to: "a" },
      ],
      sections: [
        {
          id: "wheel",
          cellIds: ["a", "b"],
          rotation: {
            incrementDegrees: Number.NaN,
            rotatable: true,
            occupantCycles: [["a", "ghost"]],
          },
        },
      ],
    });
    expect(issues.some((item) => item.code === "edge.self")).toBe(true);
    expect(issues.some((item) => item.code === "portal.duplicate_relationship")).toBe(true);
    expect(issues.some((item) => item.code === "rotation.unknown_cell")).toBe(true);
    expect(issues.some((item) => item.code === "rotation.invalid_increment")).toBe(true);
  });

  it("rejects unknown icon references when a registry is supplied", () => {
    const pack = createDevelopmentPack();
    const issues = validateBoardDefinition(
      {
        topology: { kind: "linear" },
        cells: [{ id: "a", position: { x: 0, y: 0 }, initialIcon: "missing.icon" }],
        adjacency: [],
      },
      { knownIconIds: pack.icons.list().map((icon) => icon.id) },
    );
    expect(issues.some((item) => item.code === "cell.unknown_icon")).toBe(true);
  });

  it("throws BoardValidationError without repairing authoring mistakes", () => {
    expect(() =>
      createBoard({
        topology: { kind: "custom" },
        cells: [{ id: "cell_14", position: { x: 0, y: 0 } }],
        adjacency: [],
        flow: [{ from: "cell_14", to: "cell_22" }],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      createBoard({
        topology: { kind: "custom" },
        cells: [{ id: "cell_14", position: { x: 0, y: 0 } }],
        adjacency: [],
        flow: [{ from: "cell_14", to: "cell_22" }],
      }),
    ).toThrow(/BoardValidationError: flow edge "cell_14 → cell_22" references missing cell "cell_22"/);
  });
});
