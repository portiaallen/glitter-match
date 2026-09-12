import { cloneBoard } from "../board/index.js";
import { cloneSpecialMatchRuntime } from "../special-matches/index.js";
import type { CommittedGameplaySnapshot, RuntimeSnapshot } from "./types.js";

export function cloneGameplaySnapshot(snapshot: CommittedGameplaySnapshot): CommittedGameplaySnapshot {
  return {
    lifecycle: snapshot.lifecycle,
    sessionStatus: snapshot.sessionStatus,
    board: cloneBoard(snapshot.board),
    specialMatches: cloneSpecialMatchRuntime(snapshot.specialMatches),
    objectiveRuntime: structuredClone(snapshot.objectiveRuntime),
    stats: structuredClone(snapshot.stats),
    movesRemaining: snapshot.movesRemaining,
    combo: snapshot.combo,
    lastCascade: snapshot.lastCascade ? structuredClone(snapshot.lastCascade) : null,
    earnedRewards: structuredClone(snapshot.earnedRewards),
    mechanicStates: structuredClone(snapshot.mechanicStates),
    specialInventory: structuredClone(snapshot.specialInventory),
    rng: { ...snapshot.rng },
    turnNumber: snapshot.turnNumber,
    eventSequence: snapshot.eventSequence,
    events: snapshot.events.map((event) => ({ ...event, data: event.data ? { ...event.data } : undefined })),
    tape: structuredClone(snapshot.tape),
    attempt: snapshot.attempt ? { ...snapshot.attempt } : null,
    legacyProgression: structuredClone(snapshot.legacyProgression),
    presentation: structuredClone(snapshot.presentation),
    stateHash: snapshot.stateHash,
  };
}

export function cloneRuntimeSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return {
    version: 1,
    runtimeId: snapshot.runtimeId,
    levelId: snapshot.levelId,
    contentVersion: snapshot.contentVersion,
    schemaVersion: snapshot.schemaVersion,
    seed: snapshot.seed,
    accessibility: { ...snapshot.accessibility },
    gameplay: cloneGameplaySnapshot(snapshot.gameplay),
    authoritative: structuredClone(snapshot.authoritative),
  };
}
