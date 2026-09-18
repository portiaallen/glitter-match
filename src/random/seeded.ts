/**
 * Replaceable randomness. The engine never calls Math.random() for gameplay.
 * A later authoritative server can supply its own RandomSource.
 */

export interface RandomSnapshot {
  algorithm: string;
  seed: string;
  state: number;
}

export interface RandomSource {
  readonly seed: string;
  next(): number;
  nextInt(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  fork(salt: string): RandomSource;
  snapshot(): RandomSnapshot;
}

export class RandomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RandomError";
  }
}

/** FNV-1a 32-bit. Stable across Node versions. */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mulberry32. Small, deterministic, and easy to snapshot.
 * Not a cryptographic generator — gameplay fairness only.
 */
export class SeededRandom implements RandomSource {
  readonly algorithm = "mulberry32";
  readonly seed: string;
  private state: number;

  constructor(seed: string, state?: number) {
    if (seed.length === 0) {
      throw new RandomError("Random seed must be a non-empty string.");
    }
    this.seed = seed;
    this.state = state ?? hashString(seed);
  }

  static fromSnapshot(snapshot: RandomSnapshot): SeededRandom {
    if (snapshot.algorithm !== "mulberry32") {
      throw new RandomError(
        `Cannot restore RNG algorithm "${snapshot.algorithm}". This build only ships mulberry32.`,
      );
    }
    return new SeededRandom(snapshot.seed, snapshot.state);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RandomError(`nextInt requires a positive integer, received ${maxExclusive}.`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RandomError("Cannot pick from an empty collection.");
    }
    return items[this.nextInt(items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1);
      const current = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = current;
    }
    return copy;
  }

  fork(salt: string): SeededRandom {
    return new SeededRandom(`${this.seed}::${salt}`);
  }

  snapshot(): RandomSnapshot {
    return { algorithm: this.algorithm, seed: this.seed, state: this.state };
  }
}

export function createRandomSource(seed: string): RandomSource {
  return new SeededRandom(seed);
}

export function restoreRandomSource(snapshot: RandomSnapshot): RandomSource {
  return SeededRandom.fromSnapshot(snapshot);
}
