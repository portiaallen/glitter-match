import { describe, expect, it } from "vitest";
import { createBoard, getCell } from "../src/board/index.js";
import { startPlayground } from "../src/lab/playground.js";
import {
  deserializeReplayTape,
  occupantSnapshot,
  replayTape,
  serializeReplayTape,
} from "../src/replay/index.js";
import { swapOccupants } from "../src/fairness/index.js";
import { loadLabDocument, pack } from "./helpers.js";

describe("deterministic replay", () => {
  it("reproduces the same logical result for identical seed + moves", () => {
    const document = loadLabDocument("lab.cascade-chain");
    const first = startPlayground({ document, registries: pack(), seed: "replay-seed" });
    const second = startPlayground({ document, registries: pack(), seed: "replay-seed" });
    expect(first.swap("c3", "side").ok).toBe(true);
    expect(second.swap("c3", "side").ok).toBe(true);
    expect(occupantSnapshot(first.board)).toEqual(occupantSnapshot(second.board));
    expect(first.inspect().cascadeCount).toBe(second.inspect().cascadeCount);

    const replayed = replayTape(first.tape, {
      registries: pack(),
      matchRules: first.matchRules,
      iconPool: first.iconPool,
    });
    expect(occupantSnapshot(replayed.board)).toEqual(occupantSnapshot(first.board));
    expect(replayed.stats.score).toBe(first.stats.score);
  });

  it("changes replay state when the move sequence changes", () => {
    const definition = {
      topology: { kind: "linear" as const },
      cells: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 1, y: 0 } },
        { id: "c", position: { x: 2, y: 0 } },
      ],
      adjacency: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };
    const occupants = {
      a: { type: "icon" as const, iconId: "dev.spark-b" },
      b: { type: "icon" as const, iconId: "dev.spark-a" },
      c: { type: "icon" as const, iconId: "dev.spark-a" },
    };
    const boardA = createBoard(definition, occupants);
    const boardB = createBoard(definition, occupants);
    swapOccupants(boardA, "a", "b");
    swapOccupants(boardB, "b", "c");
    expect(getCell(boardA, "a").occupant).not.toEqual(getCell(boardB, "a").occupant);
  });

  it("round-trips replay tape serialization", () => {
    const playground = startPlayground({
      document: loadLabDocument("lab.diamond"),
      registries: pack(),
      seed: "tape",
    });
    const json = serializeReplayTape(playground.tape);
    const parsed = deserializeReplayTape(json);
    expect(parsed.seed).toBe("tape");
    expect(parsed.version).toBe(1);
    expect(parsed.initialOccupants).toEqual(playground.tape.initialOccupants);
  });
});
