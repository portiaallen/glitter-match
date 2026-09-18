import { describe, expect, it } from "vitest";
import { createBoard, getCell, settleFlow, validateBoardDefinition } from "../src/board/index.js";
import { runCascade } from "../src/cascade/index.js";
import { createEmptyStats } from "../src/objectives/index.js";
import { SeededRandom } from "../src/random/index.js";
import { matchRules, pack } from "./helpers.js";

describe("flow authoring", () => {
  it("settles a straight authored path, not y+1", () => {
    const board = createBoard(
      {
        topology: { kind: "custom" },
        cells: [
          { id: "uphill", position: { x: 0, y: 8 } },
          { id: "mid", position: { x: 3, y: 0 } },
          { id: "sink", position: { x: 1, y: -4 } },
        ],
        adjacency: [
          { from: "uphill", to: "mid" },
          { from: "mid", to: "sink" },
        ],
        flow: [
          { from: "uphill", to: "mid", kind: "gravity" },
          { from: "mid", to: "sink", kind: "gravity" },
        ],
        movement: { mode: "along-flow", refill: { mode: "none" } },
      },
      {
        uphill: { type: "icon", iconId: "dev.spark-a" },
        mid: { type: "empty" },
        sink: { type: "empty" },
      },
    );
    settleFlow(board);
    expect(getCell(board, "sink").occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
    expect(getCell(board, "uphill").occupant).toEqual({ type: "empty" });
  });

  it("supports branching flow", () => {
    const board = createBoard(
      {
        topology: { kind: "branching" },
        cells: [
          { id: "src", position: { x: 0, y: 0 } },
          { id: "left", position: { x: -1, y: 2 } },
          { id: "right", position: { x: 1, y: 2 } },
        ],
        adjacency: [
          { from: "src", to: "left" },
          { from: "src", to: "right" },
        ],
        flow: [
          { from: "src", to: "left", kind: "branch" },
          { from: "src", to: "right", kind: "branch" },
        ],
        movement: { mode: "along-flow", refill: { mode: "none" } },
      },
      {
        src: { type: "icon", iconId: "dev.spark-a" },
        left: { type: "empty" },
        right: { type: "empty" },
      },
    );
    settleFlow(board);
    expect(getCell(board, "left").occupant.type).toBe("icon");
    expect(getCell(board, "src").occupant.type).toBe("empty");
    expect(getCell(board, "right").occupant.type).toBe("empty");
  });

  it("supports bottleneck flow into a shared cell", () => {
    const board = createBoard(
      {
        topology: { kind: "custom" },
        cells: [
          { id: "a", position: { x: 0, y: 0 } },
          { id: "b", position: { x: 2, y: 0 } },
          { id: "neck", position: { x: 1, y: 2 } },
        ],
        adjacency: [
          { from: "a", to: "neck" },
          { from: "b", to: "neck" },
        ],
        flow: [
          { from: "a", to: "neck" },
          { from: "b", to: "neck" },
        ],
        movement: { mode: "along-flow", refill: { mode: "none" } },
      },
      {
        a: { type: "icon", iconId: "dev.spark-a" },
        b: { type: "icon", iconId: "dev.spark-b" },
        neck: { type: "empty" },
      },
    );
    settleFlow(board);
    expect(getCell(board, "neck").occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
    expect(getCell(board, "b").occupant).toEqual({ type: "icon", iconId: "dev.spark-b" });
  });

  it("leaves disconnected flow regions independent", () => {
    const board = createBoard(
      {
        topology: { kind: "custom", connectivity: "optional" },
        cells: [
          { id: "a1", position: { x: 0, y: 0 } },
          { id: "a2", position: { x: 0, y: 1 } },
          { id: "b1", position: { x: 8, y: 0 } },
          { id: "b2", position: { x: 8, y: 1 } },
        ],
        adjacency: [
          { from: "a1", to: "a2" },
          { from: "b1", to: "b2" },
        ],
        flow: [{ from: "a1", to: "a2" }],
        movement: { mode: "along-flow", refill: { mode: "none" } },
      },
      {
        a1: { type: "icon", iconId: "dev.spark-a" },
        a2: { type: "empty" },
        b1: { type: "icon", iconId: "dev.spark-b" },
        b2: { type: "empty" },
      },
    );
    settleFlow(board);
    expect(getCell(board, "a2").occupant).toEqual({ type: "icon", iconId: "dev.spark-a" });
    expect(getCell(board, "b1").occupant).toEqual({ type: "icon", iconId: "dev.spark-b" });
    expect(getCell(board, "b2").occupant).toEqual({ type: "empty" });
  });

  it("rejects invalid cycles and missing flow references loudly", () => {
    const cycle = validateBoardDefinition({
      topology: { kind: "custom" },
      cells: [
        { id: "cell_14", position: { x: 0, y: 0 } },
        { id: "cell_22", position: { x: 1, y: 0 } },
      ],
      adjacency: [{ from: "cell_14", to: "cell_22" }],
      flow: [
        { from: "cell_14", to: "cell_22" },
        { from: "cell_22", to: "cell_14" },
      ],
    });
    expect(cycle.some((item) => item.code === "flow.cycle")).toBe(true);
    expect(cycle.find((item) => item.code === "flow.cycle")?.message).toMatch(/cell_14 → cell_22 → cell_14/);

    const missing = validateBoardDefinition({
      topology: { kind: "custom" },
      cells: [{ id: "cell_14", position: { x: 0, y: 0 } }],
      adjacency: [],
      flow: [{ from: "cell_14", to: "cell_22" }],
    });
    expect(missing.find((item) => item.code === "flow.unknown_to")?.message).toBe(
      'flow edge "cell_14 → cell_22" references missing cell "cell_22".',
    );
  });

  it("settles cascades through irregular topology deterministically with a seed", () => {
    const definition = {
      topology: { kind: "custom" as const },
      cells: [
        { id: "spawn", position: { x: 4, y: -2 } },
        { id: "bend", position: { x: 0, y: 1 } },
        { id: "kink", position: { x: 2, y: 3 } },
        { id: "end", position: { x: 3, y: 5 } },
      ],
      adjacency: [
        { from: "spawn", to: "bend" },
        { from: "bend", to: "kink" },
        { from: "kink", to: "end" },
      ],
      flow: [
        { from: "spawn", to: "bend" },
        { from: "bend", to: "kink" },
        { from: "kink", to: "end" },
      ],
      movement: { mode: "along-flow" as const, refill: { mode: "none" as const } },
    };
    const occupants = {
      spawn: { type: "icon" as const, iconId: "dev.spark-b" },
      bend: { type: "icon" as const, iconId: "dev.spark-a" },
      kink: { type: "icon" as const, iconId: "dev.spark-a" },
      end: { type: "icon" as const, iconId: "dev.spark-a" },
    };
    const run = (seed: string) => {
      const board = createBoard(definition, occupants);
      const stats = createEmptyStats();
      runCascade({
        board,
        matchRules,
        iconRegistry: pack().icons,
        obstacleRegistry: pack().obstacles,
        iconPool: ["dev.spark-c"],
        random: new SeededRandom(seed),
        stats,
        scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
      });
      return {
        spawn: getCell(board, "spawn").occupant,
        bend: getCell(board, "bend").occupant,
        kink: getCell(board, "kink").occupant,
        end: getCell(board, "end").occupant,
        score: stats.score,
      };
    };
    expect(run("flow-seed")).toEqual(run("flow-seed"));
    expect(run("flow-seed").end).toEqual({ type: "icon", iconId: "dev.spark-b" });
  });
});
