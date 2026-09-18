import { describe, expect, it } from "vitest";
import {
  applyRotationState,
  cloneBoard,
  createBoard,
  getCell,
  rotateSection,
  serializeRotationState,
} from "../src/board/index.js";
import { detectMatches } from "../src/matching/index.js";
import { pack } from "./helpers.js";

function rotatingRegion() {
  return createBoard(
    {
      topology: { kind: "rotating" },
      cells: [
        { id: "a", position: { x: 0, y: 0 }, sectionId: "wheel", terrain: "socket-a" },
        { id: "b", position: { x: 2.2, y: 0.4 }, sectionId: "wheel", terrain: "socket-b" },
        { id: "c", position: { x: 1.1, y: 2.1 }, sectionId: "wheel", terrain: "socket-c" },
        { id: "d", position: { x: 4, y: 1 }, sectionId: "wheel", terrain: "socket-d" },
      ],
      adjacency: [
        { from: "a", to: "b", direction: "n" },
        { from: "b", to: "c", direction: "e" },
        { from: "c", to: "d", direction: "s" },
      ],
      sections: [
        {
          id: "wheel",
          cellIds: ["a", "b", "c", "d"],
          rotation: {
            incrementDegrees: 90,
            rotatable: true,
            occupantCycles: [["a", "b", "c", "d"]],
            remapDirections: true,
          },
        },
      ],
    },
    {
      a: { type: "icon", iconId: "dev.spark-a" },
      b: { type: "icon", iconId: "dev.spark-a" },
      c: { type: "icon", iconId: "dev.spark-b" },
      d: { type: "icon", iconId: "dev.spark-a" },
    },
  );
}

describe("rotation architecture", () => {
  it("rotates occupants on an irregular region without changing cell ids", () => {
    const board = rotatingRegion();
    const ids = [...board.topology.cellIds];
    rotateSection(board, "wheel", 1);
    expect(board.topology.cellIds).toEqual(ids);
    expect(getCell(board, "a").occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
    expect(getCell(board, "b").occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
    expect(getCell(board, "c").occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
    expect(getCell(board, "d").occupant).toEqual({ type: "icon", iconId: "dev.spark-b" });
    expect(board.topology.cells["a"]?.terrain).toBe("socket-a");
  });

  it("rotating twice then twice more returns to the original occupants on a 4-cycle", () => {
    const board = rotatingRegion();
    const original = cloneBoard(board);
    rotateSection(board, "wheel", 2);
    expect(getCell(board, "a").occupant).toEqual({ type: "icon", iconId: "dev.spark-b" });
    rotateSection(board, "wheel", 2);
    expect(getCell(board, "a").occupant).toEqual(getCell(original, "a").occupant);
    expect(getCell(board, "b").occupant).toEqual(getCell(original, "b").occupant);
    expect(getCell(board, "c").occupant).toEqual(getCell(original, "c").occupant);
    expect(getCell(board, "d").occupant).toEqual(getCell(original, "d").occupant);
    expect(board.rotation.wheel?.steps).toBe(4);
  });

  it("four quarter-turns restore authored direction labels", () => {
    const board = rotatingRegion();
    const before = board.topology.directed["a"]?.find((edge) => edge.to === "b")?.direction;
    rotateSection(board, "wheel", 4);
    const after = board.topology.directed["a"]?.find((edge) => edge.to === "b")?.direction;
    expect(before).toBe("n");
    expect(after).toBe("n");
  });

  it("preserves graph integrity and does not introduce self-edges", () => {
    const board = rotatingRegion();
    rotateSection(board, "wheel", 3);
    for (const from of board.topology.cellIds) {
      for (const edge of board.topology.directed[from] ?? []) {
        expect(edge.to).not.toBe(from);
      }
    }
    expect(board.topology.adjacency["a"]).toEqual(["b"]);
  });

  it("matching uses the graph after occupants rotate", () => {
    const board = rotatingRegion();
    const rules = { minGroupSize: 3, modes: ["cluster" as const] };
    expect(detectMatches(board, rules, pack().icons)).toEqual([]);
    rotateSection(board, "wheel", 1);
    const groups = detectMatches(board, rules, pack().icons);
    expect(groups[0]?.cellIds).toEqual(["a", "b", "c"]);
  });

  it("serializes and reapplies logical rotation state", () => {
    const board = rotatingRegion();
    rotateSection(board, "wheel", 1);
    const state = serializeRotationState(board);
    const restored = rotatingRegion();
    applyRotationState(restored, state);
    expect(getCell(restored, "c").occupant).toEqual(getCell(board, "c").occupant);
    expect(restored.rotation.wheel?.steps).toBe(1);
  });
});
