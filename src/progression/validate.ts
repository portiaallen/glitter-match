import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import { validatePrerequisiteGraph } from "./graph.js";
import { validateUnlockCondition } from "./unlock.js";
import type { PlayerProgression, ProgressionNode, UniverseContent } from "./types.js";

export function validateUniverseContent(universe: UniverseContent, catalog: readonly ProgressionNode[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!universe.id) {
    issues.push(issue("progression.invalid_universe", "universe.id", "Universe id is required."));
  }
  if (universe.purpose === "campaign" && (universe.id.startsWith("dev.") || catalog.some((node) => node.purpose === "engine-fixture"))) {
    issues.push(
      issue(
        "progression.fixture_as_campaign",
        "universe.purpose",
        "Development progression fixtures cannot be marked as campaign content.",
      ),
    );
  }
  const packIds = new Set<string>();
  for (const pack of universe.packs) {
    if (packIds.has(pack.id)) {
      issues.push(issue("progression.duplicate_pack", `packs.${pack.id}`, `Duplicate pack id "${pack.id}".`));
    }
    packIds.add(pack.id);
    if (pack.purpose === "campaign" && pack.id.startsWith("dev.")) {
      issues.push(issue("progression.fixture_as_campaign", `packs.${pack.id}.purpose`, "Development packs cannot be campaign content."));
    }
  }
  const nodeIds = new Set<string>();
  for (const node of catalog) {
    if (nodeIds.has(node.id)) {
      issues.push(issue("progression.duplicate_level", `nodes.${node.id}`, `Duplicate level id "${node.id}".`));
    }
    nodeIds.add(node.id);
  }
  for (const node of catalog) {
    if (node.purpose === "campaign" && node.id.startsWith("dev.")) {
      issues.push(issue("progression.fixture_as_campaign", `nodes.${node.id}.purpose`, "Development nodes cannot be campaign levels."));
    }
    issues.push(...validateUnlockCondition(node.unlock, nodeIds, `nodes.${node.id}.unlock`));
  }
  issues.push(...validatePrerequisiteGraph(universe, catalog));
  return issues;
}

export function assertValidUniverse(universe: UniverseContent, catalog: readonly ProgressionNode[]): void {
  throwIfErrors(validateUniverseContent(universe, catalog), "Invalid progression universe");
}

export function validatePlayerProgress(universe: UniverseContent, catalog: readonly ProgressionNode[], player: PlayerProgression): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(catalog.map((node) => node.id));
  const packIds = new Set(universe.packs.map((pack) => pack.id));
  const landIds = new Set(universe.landIds);
  for (const landId of player.unlockedLandIds) {
    if (!landIds.has(landId)) {
      issues.push(issue("progression.unknown_land", `player.unlockedLandIds.${landId}`, `Unknown land "${landId}" in saved progress.`));
    }
  }
  for (const levelId of player.completedLevelIds) {
    if (!nodeIds.has(levelId)) {
      issues.push(issue("progression.unknown_level", `player.completedLevelIds.${levelId}`, `Unknown level "${levelId}" in saved progress.`));
    }
  }
  for (const [levelId, state] of Object.entries(player.levels)) {
    if (!nodeIds.has(levelId)) {
      issues.push(issue("progression.unknown_level", `player.levels.${levelId}`, `Unknown level "${levelId}" in saved progress.`));
    }
    if (state.mastery.mastered && !state.completion.completed) {
      issues.push(issue("progression.impossible_mastery", `player.levels.${levelId}.mastery`, "Mastery without completion is impossible."));
    }
    if (state.completion.completed && state.completion.completionCount < 1) {
      issues.push(issue("progression.invalid_completion", `player.levels.${levelId}.completion`, "Completed records must have a completion count."));
    }
    for (const attemptId of state.attemptIds) {
      if (!player.attempts[attemptId]) {
        issues.push(issue("progression.orphaned_attempt", `player.levels.${levelId}.attemptIds`, `Missing attempt "${attemptId}".`));
      }
    }
  }
  const attemptIds = Object.keys(player.attempts);
  if (new Set(attemptIds).size !== attemptIds.length) {
    issues.push(issue("progression.duplicate_attempt", "player.attempts", "Duplicate attempt ids."));
  }
  for (const attempt of Object.values(player.attempts)) {
    if (!nodeIds.has(attempt.levelId)) {
      issues.push(issue("progression.unknown_level", `player.attempts.${attempt.attemptId}`, `Attempt references unknown level "${attempt.levelId}".`));
    }
    const owner = player.levels[attempt.levelId];
    if (owner && !owner.attemptIds.includes(attempt.attemptId)) {
      issues.push(issue("progression.orphaned_attempt", `player.attempts.${attempt.attemptId}`, `Attempt "${attempt.attemptId}" is not attached to its level.`));
    }
  }
  void packIds;
  return issues;
}
