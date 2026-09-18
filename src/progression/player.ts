import { LAND_IDS, type LandId, type LevelId } from "../ids.js";

export interface PlayerProgression {
  unlockedLandIds: LandId[];
  completedLevelIds: LevelId[];
  starsByLevel: Record<LevelId, number>;
}

export function createNewProgression(): PlayerProgression {
  return {
    unlockedLandIds: ["lumina"],
    completedLevelIds: [],
    starsByLevel: {},
  };
}

export function recordLevelClear(
  progression: PlayerProgression,
  levelId: LevelId,
  landId: LandId,
  stars: number,
): PlayerProgression {
  const completed = new Set(progression.completedLevelIds);
  completed.add(levelId);
  const unlocked = new Set(progression.unlockedLandIds);
  unlocked.add(landId);
  return {
    unlockedLandIds: LAND_IDS.filter((id) => unlocked.has(id)),
    completedLevelIds: [...completed],
    starsByLevel: {
      ...progression.starsByLevel,
      [levelId]: Math.max(progression.starsByLevel[levelId] ?? 0, stars),
    },
  };
}
