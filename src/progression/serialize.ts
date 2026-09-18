import { createProgressionRuntime, type ProgressionRuntime } from "./resolver.js";
import type { PlayerProgression, ProgressionNode, UniverseContent } from "./types.js";
import { throwIfErrors } from "../validation.js";
import { validatePlayerProgress } from "./validate.js";

export function serializeProgression(runtime: ProgressionRuntime): PlayerProgression {
  return structuredClone({
    ...runtime.player,
    unlockedLandIds: [...runtime.player.unlockedLandIds].sort(),
    completedLevelIds: [...runtime.player.completedLevelIds].sort(),
    processedEventIds: [...runtime.player.processedEventIds],
    events: [...runtime.player.events],
  });
}

export function restoreProgression(universe: UniverseContent, catalog: ProgressionNode[], player: PlayerProgression): ProgressionRuntime {
  throwIfErrors(validatePlayerProgress(universe, catalog, player), "Corrupted progression state");
  return createProgressionRuntime(universe, catalog, structuredClone(player));
}

export function canonicalProgression(runtime: ProgressionRuntime): string {
  return JSON.stringify(serializeProgression(runtime));
}

export function progressionsEqual(a: ProgressionRuntime, b: ProgressionRuntime): boolean {
  return canonicalProgression(a) === canonicalProgression(b);
}
