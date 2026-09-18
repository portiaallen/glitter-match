import type { LandId, LevelId } from "../ids.js";
import { createEmptyPlayerProgression } from "./state.js";
import type { PlayerProgression } from "./types.js";

export function createNewProgression(): PlayerProgression {
  return createEmptyPlayerProgression();
}

/** Compatibility helper. Prefer ProgressionRuntime.completeAttempt for unlock graphs. */
export function recordLevelClear(
  progression: PlayerProgression,
  levelId: LevelId,
  landId: LandId,
  stars: number,
): PlayerProgression {
  const completed = new Set(progression.completedLevelIds);
  completed.add(levelId);
  const unlocked = new Set(progression.unlockedLandIds.map(String));
  unlocked.add(landId);
  const next: PlayerProgression = {
    ...progression,
    unlockedLandIds: [...unlocked].sort(),
    completedLevelIds: [...completed].sort(),
    starsByLevel: {
      ...progression.starsByLevel,
      [levelId]: Math.max(progression.starsByLevel[levelId] ?? 0, stars),
    },
  };
  if (next.levels[levelId]) {
    next.levels[levelId] = {
      ...next.levels[levelId]!,
      completion: {
        ...next.levels[levelId]!.completion,
        completed: true,
        completionCount: Math.max(next.levels[levelId]!.completion.completionCount, 1),
      },
    };
  }
  return next;
}
