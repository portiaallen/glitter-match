import { describe, expect, it } from "vitest";
import { SeededRandom } from "../src/random/index.js";

describe("deterministic randomness", () => {
  it("replays the same sequence for the same seed", () => {
    const a = new SeededRandom("glitter-seed");
    const b = new SeededRandom("glitter-seed");
    const seqA = Array.from({ length: 12 }, () => a.next());
    const seqB = Array.from({ length: 12 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("restores from a snapshot", () => {
    const rng = new SeededRandom("snap");
    rng.next();
    rng.next();
    const snapshot = rng.snapshot();
    const next = rng.next();
    const restored = SeededRandom.fromSnapshot(snapshot);
    expect(restored.next()).toBe(next);
  });

  it("forks without mutating the parent stream", () => {
    const parent = new SeededRandom("parent");
    const before = parent.snapshot();
    const child = parent.fork("placement");
    child.nextInt(10);
    expect(parent.snapshot()).toEqual(before);
    expect(child.seed).toBe("parent::placement");
  });

  it("does not use uncontrolled Math.random for shuffle", () => {
    const rng = new SeededRandom("shuffle-me");
    const shuffled = rng.shuffle(["a", "b", "c", "d", "e"]);
    const again = new SeededRandom("shuffle-me").shuffle(["a", "b", "c", "d", "e"]);
    expect(shuffled).toEqual(again);
  });
});
