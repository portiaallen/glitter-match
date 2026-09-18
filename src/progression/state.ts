import type {
  AttemptRecord,
  CompletionRecord,
  LevelProgressState,
  MasteryRecord,
  PlayerProgression,
  ProgressionNode,
} from "./types.js";
import { PROGRESSION_SCHEMA_VERSION } from "./types.js";

export function createEmptyPlayerProgression(): PlayerProgression {
  return {
    version: PROGRESSION_SCHEMA_VERSION,
    unlockedLandIds: [],
    completedLevelIds: [],
    starsByLevel: {},
    levels: {},
    attempts: {},
    events: [],
    processedEventIds: [],
    sequence: 0,
  };
}

export function emptyCompletion(levelId: string): CompletionRecord {
  return { levelId, completed: false, completionCount: 0 };
}

export function emptyMastery(): MasteryRecord {
  return { state: "NOT_ATTEMPTED", mastered: false };
}

export function createLevelProgressState(node: ProgressionNode): LevelProgressState {
  return {
    levelId: node.id,
    contentVersion: node.version,
    availability: node.unlock.op === "always" ? "AVAILABLE" : "LOCKED",
    play: "NOT_STARTED",
    completion: emptyCompletion(node.id),
    mastery: emptyMastery(),
    attemptIds: [],
    versionCompatibility: "VALID",
  };
}

export function createAttempt(partial: Omit<AttemptRecord, "completed" | "outcome" | "mastered"> & Partial<Pick<AttemptRecord, "completed" | "outcome" | "mastered">>): AttemptRecord {
  const outcome = partial.outcome ?? "in-progress";
  return {
    ...partial,
    outcome,
    completed: partial.completed ?? outcome === "completed",
    mastered: partial.mastered ?? false,
  };
}
