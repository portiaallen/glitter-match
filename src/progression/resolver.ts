import { evaluateLandComplete, landPolicyFor, requiredNodes, type CampaignProgress, type LandProgress, type PackProgress } from "./aggregates.js";
import { isBetterResult, selectBestResult } from "./best-result.js";
import { createProgressionEvent } from "./events.js";
import { finaleEligible } from "./finale.js";
import { createAttempt, createEmptyPlayerProgression, createLevelProgressState } from "./state.js";
import { evaluateUnlock, unlockContextFromPlayer } from "./unlock.js";
import { assertValidUniverse, validatePlayerProgress } from "./validate.js";
import { classifyContentVersion } from "./versioning.js";
import type {
  AttemptOutcome,
  AttemptRecord,
  BestResultStrategy,
  PlayerProgression,
  ProgressionEvent,
  ProgressionNode,
  ProgressionViewStatus,
  UniverseContent,
} from "./types.js";
import { viewStatus } from "./types.js";
import { throwIfErrors } from "../validation.js";

export interface ProgressionRuntime {
  universe: UniverseContent;
  catalog: ProgressionNode[];
  player: PlayerProgression;
}

export function createProgressionRuntime(universe: UniverseContent, catalog: ProgressionNode[], player?: PlayerProgression): ProgressionRuntime {
  assertValidUniverse(universe, catalog);
  const runtime: ProgressionRuntime = {
    universe,
    catalog,
    player: player ?? createEmptyPlayerProgression(),
  };
  ensureLevelStates(runtime);
  recalcAvailability(runtime);
  return runtime;
}

function catalogNode(runtime: ProgressionRuntime, levelId: string): ProgressionNode {
  const node = runtime.catalog.find((item) => item.id === levelId);
  if (!node) {
    throw new Error(`Unknown progression node "${levelId}".`);
  }
  return node;
}

function ensureLevelStates(runtime: ProgressionRuntime): void {
  for (const node of runtime.catalog) {
    runtime.player.levels[node.id] ??= createLevelProgressState(node);
    runtime.player.levels[node.id]!.contentVersion = node.version;
    runtime.player.levels[node.id]!.versionCompatibility = classifyContentVersion(
      runtime.player.levels[node.id]!.completion.contentVersion,
      node.version,
    );
  }
}

function nextSequence(runtime: ProgressionRuntime): number {
  runtime.player.sequence += 1;
  return runtime.player.sequence;
}

function emit(runtime: ProgressionRuntime, event: ProgressionEvent): boolean {
  if (runtime.player.processedEventIds.includes(event.id)) {
    return false;
  }
  runtime.player.processedEventIds.push(event.id);
  runtime.player.events.push(event);
  return true;
}

function withTransaction(runtime: ProgressionRuntime, fn: () => void): void {
  const snapshot = structuredClone(runtime.player);
  try {
    fn();
    throwIfErrors(validatePlayerProgress(runtime.universe, runtime.catalog, runtime.player), "Progression update rejected");
  } catch (error) {
    runtime.player = snapshot;
    throw error;
  }
}

function completedSet(runtime: ProgressionRuntime): Set<string> {
  return new Set(runtime.player.completedLevelIds);
}

function packProgressList(runtime: ProgressionRuntime): PackProgress[] {
  const completed = completedSet(runtime);
  const mastered = new Set(
    Object.values(runtime.player.levels)
      .filter((state) => state.mastery.mastered)
      .map((state) => state.levelId),
  );
  return runtime.universe.packs.map((pack) => {
    const nodes = runtime.catalog.filter((node) => node.packId === pack.id);
    const required = requiredNodes(runtime.catalog, pack.id);
    const available = nodes.filter((node) => runtime.player.levels[node.id]?.availability === "AVAILABLE").length;
    const completedCount = nodes.filter((node) => completed.has(node.id)).length;
    const masteredCount = nodes.filter((node) => mastered.has(node.id)).length;
    const locked = nodes.filter((node) => runtime.player.levels[node.id]?.availability === "LOCKED").length;
    const complete = required.length > 0 && required.every((node) => completed.has(node.id));
    return {
      packId: pack.id,
      totalLevels: nodes.length,
      availableLevels: available,
      completedLevels: completedCount,
      masteredLevels: masteredCount,
      lockedLevels: locked,
      completionRatio: nodes.length === 0 ? 0 : completedCount / nodes.length,
      masteryRatio: nodes.length === 0 ? 0 : masteredCount / nodes.length,
      complete,
    };
  });
}

function landProgressList(runtime: ProgressionRuntime, packs: PackProgress[]): LandProgress[] {
  const completed = completedSet(runtime);
  const packCompleted = new Set(packs.filter((pack) => pack.complete).map((pack) => pack.packId));
  const mastered = new Set(
    Object.values(runtime.player.levels)
      .filter((state) => state.mastery.mastered)
      .map((state) => state.levelId),
  );
  return runtime.universe.lands.map((land) => {
    const nodes = runtime.catalog.filter((node) => node.landId === land.landId);
    const required = requiredNodes(runtime.catalog).filter((node) => node.landId === land.landId && node.kind !== "finale");
    const ctx = unlockContextFromPlayer(runtime.player, packCompleted, new Set());
    const finaleNode = land.finaleNodeId ? runtime.catalog.find((item) => item.id === land.finaleNodeId) : undefined;
    const policy = landPolicyFor(runtime.universe, land.landId);
    const complete = evaluateLandComplete(policy.policy, required, completed, land.finaleNodeId, land.requiredThreshold);
    return {
      landId: land.landId,
      packIds: land.packIds,
      totalLevels: nodes.length,
      availableLevels: nodes.filter((node) => runtime.player.levels[node.id]?.availability === "AVAILABLE").length,
      completedLevels: nodes.filter((node) => completed.has(node.id)).length,
      masteredLevels: nodes.filter((node) => mastered.has(node.id)).length,
      completionRatio: nodes.length === 0 ? 0 : nodes.filter((node) => completed.has(node.id)).length / nodes.length,
      masteryRatio: nodes.length === 0 ? 0 : nodes.filter((node) => mastered.has(node.id)).length / nodes.length,
      complete,
      finaleEligible: finaleNode ? finaleEligible(finaleNode, ctx) : false,
    };
  });
}

export function campaignProgress(runtime: ProgressionRuntime): CampaignProgress {
  const packs = packProgressList(runtime);
  const lands = landProgressList(runtime, packs);
  const totalLevels = runtime.catalog.length;
  const completedLevels = runtime.player.completedLevelIds.length;
  const masteredLevels = Object.values(runtime.player.levels).filter((state) => state.mastery.mastered).length;
  return {
    universeId: runtime.universe.id,
    lands,
    packs,
    totalLevels,
    completedLevels,
    masteredLevels,
    completionRatio: totalLevels === 0 ? 0 : completedLevels / totalLevels,
    masteryRatio: totalLevels === 0 ? 0 : masteredLevels / totalLevels,
  };
}

function packCompletedIds(runtime: ProgressionRuntime): Set<string> {
  return new Set(packProgressList(runtime).filter((pack) => pack.complete).map((pack) => pack.packId));
}

function landCompletedIds(runtime: ProgressionRuntime): Set<string> {
  return new Set(landProgressList(runtime, packProgressList(runtime)).filter((land) => land.complete).map((land) => land.landId));
}

export function recalcAvailability(runtime: ProgressionRuntime): string[] {
  const unlocked: string[] = [];
  const ctx = unlockContextFromPlayer(runtime.player, packCompletedIds(runtime), landCompletedIds(runtime));
  const sorted = [...runtime.catalog].sort((a, b) => a.id.localeCompare(b.id));
  for (const node of sorted) {
    const state = runtime.player.levels[node.id]!;
    const previous = state.availability;
    const open = evaluateUnlock(node.unlock, ctx);
    if (!open) {
      state.availability = "LOCKED";
      continue;
    }
    state.availability = "AVAILABLE";
    if (previous === "LOCKED") {
      unlocked.push(node.id);
      emit(
        runtime,
        createProgressionEvent("LEVEL_UNLOCKED", nextSequence(runtime), `Unlocked ${node.id}.`, {
          id: `LEVEL_UNLOCKED:${node.id}`,
          levelId: node.id,
          packId: node.packId,
          landId: node.landId,
        }),
      );
    }
  }
  runtime.player.unlockedLandIds = [...new Set(runtime.universe.landIds.filter((landId) =>
    runtime.catalog.some((node) => node.landId === landId && runtime.player.levels[node.id]?.availability !== "UNAVAILABLE" && runtime.player.levels[node.id]?.availability !== "LOCKED"),
  ))].sort();
  return unlocked;
}

export function nodeView(runtime: ProgressionRuntime, levelId: string): ProgressionViewStatus {
  return viewStatus(runtime.player.levels[levelId]);
}

export function startAttempt(runtime: ProgressionRuntime, levelId: string, seed?: string): AttemptRecord {
  const node = catalogNode(runtime, levelId);
  let attempt!: AttemptRecord;
  withTransaction(runtime, () => {
    if (runtime.player.levels[levelId]?.availability === "LOCKED") {
      throw new Error(`Level "${levelId}" is locked.`);
    }
    const attemptId = `${levelId}:attempt-${runtime.player.sequence + 1}`;
    attempt = createAttempt({
      attemptId,
      levelId,
      contentVersion: node.version,
      seed,
      moveCount: 0,
      score: 0,
      outcome: "in-progress",
    });
    runtime.player.attempts[attemptId] = attempt;
    const state = runtime.player.levels[levelId]!;
    state.currentAttemptId = attemptId;
    state.play = "IN_PROGRESS";
    state.attemptIds = [...state.attemptIds, attemptId].sort();
    emit(runtime, createProgressionEvent("LEVEL_STARTED", nextSequence(runtime), `Started ${levelId}.`, { levelId, attemptId, landId: node.landId, packId: node.packId }));
    emit(runtime, createProgressionEvent("LEVEL_ATTEMPTED", nextSequence(runtime), `Attempted ${levelId}.`, { levelId, attemptId, landId: node.landId, packId: node.packId }));
  });
  return attempt;
}

function finishAttempt(
  runtime: ProgressionRuntime,
  attemptId: string,
  outcome: AttemptOutcome,
  result: { score: number; moveCount: number; mastered?: boolean },
): void {
  withTransaction(runtime, () => {
    const attempt = runtime.player.attempts[attemptId];
    if (!attempt) {
      throw new Error(`Unknown attempt "${attemptId}".`);
    }
    const eventKind = outcome === "completed" ? "LEVEL_COMPLETED" : outcome === "failed" ? "LEVEL_FAILED" : "LEVEL_ATTEMPTED";
    const eventId = `${attemptId}:${eventKind}`;
    if (runtime.player.processedEventIds.includes(eventId) && attempt.outcome === outcome) {
      return;
    }
    const node = catalogNode(runtime, attempt.levelId);
    attempt.outcome = outcome;
    attempt.score = result.score;
    attempt.moveCount = result.moveCount;
    attempt.completed = outcome === "completed";
    attempt.mastered = Boolean(result.mastered) && attempt.completed;
    attempt.replayRef = { seed: attempt.seed, contentVersion: attempt.contentVersion, moveCount: attempt.moveCount };
    const state = runtime.player.levels[attempt.levelId]!;
    if (outcome === "abandoned") {
      state.play = "ABANDONED";
    } else if (outcome !== "completed") {
      state.play = "NOT_STARTED";
    }
    if (outcome === "completed") {
      const already = state.completion.completed;
      state.completion.completed = true;
      state.completion.completionCount += runtime.player.processedEventIds.includes(eventId) ? 0 : 1;
      state.completion.lastCompletedAttemptId = attemptId;
      state.completion.firstCompletedAttemptId ??= attemptId;
      state.completion.contentVersion = node.version;
      state.play = "NOT_STARTED";
      if (!runtime.player.completedLevelIds.includes(attempt.levelId)) {
        runtime.player.completedLevelIds = [...runtime.player.completedLevelIds, attempt.levelId].sort();
      }
      if (attempt.mastered) {
        state.mastery = { state: "MASTERED", mastered: true, contentVersion: node.version, masteryVersion: node.masteryVersion ?? node.version };
      } else if (state.mastery.state === "NOT_ATTEMPTED") {
        state.mastery = { state: "NOT_MASTERED", mastered: false, contentVersion: node.version, masteryVersion: node.masteryVersion ?? node.version };
      }
      const strategy: BestResultStrategy = node.bestResultStrategy ?? "higher-score";
      if (isBetterResult(strategy, attempt, state.best)) {
        state.best = selectBestResult(strategy, Object.values(runtime.player.attempts).filter((item) => item.levelId === attempt.levelId));
        emit(runtime, createProgressionEvent("BEST_RESULT_UPDATED", nextSequence(runtime), `Best result updated for ${attempt.levelId}.`, { levelId: attempt.levelId, attemptId }));
      }
      void already;
    }
    emit(runtime, createProgressionEvent(eventKind, nextSequence(runtime), `${outcome} ${attempt.levelId}.`, { levelId: attempt.levelId, attemptId, landId: node.landId, packId: node.packId }));
    if (attempt.mastered) {
      emit(runtime, createProgressionEvent("LEVEL_MASTERED", nextSequence(runtime), `Mastered ${attempt.levelId}.`, { levelId: attempt.levelId, attemptId, landId: node.landId, packId: node.packId }));
    }
    const beforePacks = packCompletedIds(runtime);
    const beforeLands = landCompletedIds(runtime);
    recalcAvailability(runtime);
    const afterPacks = packCompletedIds(runtime);
    const afterLands = landCompletedIds(runtime);
    if ([...afterPacks].some((id) => !beforePacks.has(id))) {
      emit(runtime, createProgressionEvent("PACK_PROGRESS_UPDATED", nextSequence(runtime), "Pack progress updated.", { id: `PACK_PROGRESS_UPDATED:${node.packId}`, packId: node.packId }));
    }
    if ([...afterLands].some((id) => !beforeLands.has(id))) {
      emit(runtime, createProgressionEvent("LAND_PROGRESS_UPDATED", nextSequence(runtime), "Land progress updated.", { id: `LAND_PROGRESS_UPDATED:${node.landId}`, landId: node.landId }));
      emit(runtime, createProgressionEvent("CAMPAIGN_PROGRESS_UPDATED", nextSequence(runtime), "Campaign progress updated.", { id: "CAMPAIGN_PROGRESS_UPDATED", landId: node.landId }));
      emit(runtime, createProgressionEvent("PROGRESSION_MILESTONE_REACHED", nextSequence(runtime), "Progression milestone reached.", { id: `PROGRESSION_MILESTONE_REACHED:${node.landId}`, landId: node.landId }));
    }
    state.currentAttemptId = undefined;
  });
}

export function completeAttempt(runtime: ProgressionRuntime, attemptId: string, result: { score: number; moveCount: number; mastered?: boolean }): void {
  finishAttempt(runtime, attemptId, "completed", result);
}

export function failAttempt(runtime: ProgressionRuntime, attemptId: string, result: { score: number; moveCount: number } = { score: 0, moveCount: 0 }): void {
  finishAttempt(runtime, attemptId, "failed", result);
}

export function abandonAttempt(runtime: ProgressionRuntime, attemptId: string, result: { score: number; moveCount: number } = { score: 0, moveCount: 0 }): void {
  finishAttempt(runtime, attemptId, "abandoned", result);
}

export function simulateCompletion(runtime: ProgressionRuntime, levelId: string, result: { score: number; moveCount: number; mastered?: boolean; seed?: string } = { score: 10, moveCount: 3 }): void {
  const attempt = startAttempt(runtime, levelId, result.seed);
  completeAttempt(runtime, attempt.attemptId, result);
}

export { packProgressList, landProgressList };
