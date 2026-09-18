import type { CellId, IconId } from "../ids.js";
import { getCell, settleFlow, type Board } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { detectMatches, matchedCellIds, runMatchResolution, type MatchGroup, type MatchRules } from "../matching/index.js";
import { applyObstacleMatchEffects, type ObstacleRegistry } from "../obstacles/index.js";
import { applyEffectBatch, createPrimitiveRuntime } from "../primitives/index.js";
import { throwIfErrors } from "../validation.js";
import type { RandomSource } from "../random/index.js";
import type { GameStats } from "../objectives/index.js";
import { adoptBoard, cancelOrphans, collectMatchTriggers, resolvePendingActivations } from "./activation.js";
import { resolveCandidateCreation } from "./creation.js";
import { placeSpecialOccupantEffect } from "./effects.js";
import { createSpecialInteractionRegistry, type SpecialInteractionRegistry } from "./interactions.js";
import { BUILT_IN_SPECIAL_MATCH_TYPES } from "./catalog.js";
import { SpecialMatchRegistry } from "./registry.js";
import { createSpecialMatchRuntime, type SpecialMatchRuntime } from "./runtime.js";
import { gameplayFingerprint } from "./serialize.js";
import { validateCascadeLimits } from "./validate.js";
import {
  DEFAULT_CASCADE_LIMITS,
  defaultSpecialAccessibility,
  type CascadeSafetyLimits,
  type CascadeTermination,
  type CandidateCreationPolicy,
  type SpecialMatchDiagnostics,
  type SpecialMatchEvent,
} from "./types.js";

export type CascadePhase =
  | "detect"
  | "resolve"
  | "effects"
  | "move"
  | "refill"
  | "special-activate"
  | "complete";

export interface CascadeStep {
  phase: CascadePhase;
  combo: number;
  matches: MatchGroup[];
  clearedCellIds: CellId[];
  moved: Array<{ from: CellId; to: CellId; iconId: IconId }>;
  filled: Array<{ cellId: CellId; iconId: IconId }>;
}

export interface CascadeReport {
  steps: CascadeStep[];
  combo: number;
  stable: boolean;
  termination: CascadeTermination;
  specialEvents: SpecialMatchEvent[];
  specialMatchesCreated: string[];
  diagnostics: SpecialMatchDiagnostics;
}

export interface CascadeContext {
  board: Board;
  matchRules: MatchRules;
  iconRegistry: IconRegistry;
  obstacleRegistry: ObstacleRegistry;
  iconPool: IconId[];
  random: RandomSource;
  stats: GameStats;
  scoreForMatch: (group: MatchGroup, combo: number) => number;
  maxCombos?: number;
  specialRuntime?: SpecialMatchRuntime;
  specialRegistry?: SpecialMatchRegistry;
  specialInteractions?: SpecialInteractionRegistry;
  specialCreationPolicy?: CandidateCreationPolicy;
  cascadeLimits?: Partial<CascadeSafetyLimits>;
}

function defaultScore(group: MatchGroup, combo: number): number {
  return group.cellIds.length * 10 * combo;
}

let defaultRegistry: SpecialMatchRegistry | undefined;

export function getDefaultSpecialMatchRegistry(): SpecialMatchRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new SpecialMatchRegistry();
    for (const type of BUILT_IN_SPECIAL_MATCH_TYPES) {
      defaultRegistry.register(type);
    }
  }
  return defaultRegistry;
}

export function createSpecialMatchRegistry(): SpecialMatchRegistry {
  const registry = new SpecialMatchRegistry();
  for (const type of BUILT_IN_SPECIAL_MATCH_TYPES) {
    registry.register(type);
  }
  return registry;
}

function emptyStep(phase: CascadePhase, combo: number, matches: MatchGroup[]): CascadeStep {
  return { phase, combo, matches, clearedCellIds: [], moved: [], filled: [] };
}

function fingerprint(board: Board, runtime: SpecialMatchRuntime): string {
  return gameplayFingerprint(board, runtime);
}

export function runCascade(ctx: CascadeContext): CascadeReport {
  const started = Date.now();
  const steps: CascadeStep[] = [];
  const specialEvents: SpecialMatchEvent[] = [];
  const createdIds: string[] = [];
  let combo = 0;
  const scoreForMatch = ctx.scoreForMatch ?? defaultScore;
  const limits: CascadeSafetyLimits = { ...DEFAULT_CASCADE_LIMITS, maxCombos: ctx.maxCombos ?? DEFAULT_CASCADE_LIMITS.maxCombos, ...ctx.cascadeLimits };
  throwIfErrors(validateCascadeLimits(limits), "Invalid cascade safety limits");
  const runtime = ctx.specialRuntime ?? createSpecialMatchRuntime();
  const registry = ctx.specialRegistry ?? getDefaultSpecialMatchRegistry();
  const interactions = ctx.specialInteractions ?? createSpecialInteractionRegistry();
  const counts = { activations: 0, effects: 0, mutations: 0, depth: 0 };
  const seen = new Set<string>();
  let termination: CascadeTermination = "CASCADE_COMPLETED";

  while (true) {
    const resolution = runMatchResolution(ctx.board, ctx.matchRules, ctx.iconRegistry, { cascadeIndex: combo });
    const matches = resolution.groups;
    counts.depth += 1;
    if (counts.depth > limits.maxDepth) {
      termination = "CASCADE_LIMIT_REACHED";
      specialEvents.push(limitEvent("CASCADE_LIMIT_REACHED", `Cascade exceeded ${limits.maxDepth} detect steps.`, { depth: counts.depth }));
      break;
    }
    steps.push(emptyStep("detect", combo, matches));
    specialEvents.push(
      ...resolution.specialMatchCandidates.map((candidate) => ({
        kind: "SPECIAL_CANDIDATE_IDENTIFIED" as const,
        candidateType: candidate.candidateType,
        cellIds: candidate.affectedCellIds,
        message: `Match engine identified candidate ${candidate.candidateType}.`,
        explain: { candidatesConsidered: [candidate], accessibility: defaultSpecialAccessibility(candidate.candidateType, candidate.anchorCellId) },
        data: { candidate },
      })),
    );

    const createdThisCombo = new Set<string>();
    if (matches.length === 0) {
      collectMatchTriggers(ctx.board, runtime, registry, []);
      if (runtime.pending.length === 0) {
        break;
      }
    } else {
      combo += 1;
      if (combo > limits.maxCombos) {
        termination = "CASCADE_LIMIT_REACHED";
        specialEvents.push(limitEvent("CASCADE_LIMIT_REACHED", `Cascade exceeded ${limits.maxCombos} combos.`, { combo }));
        combo -= 1;
        break;
      }
      ctx.stats.maxCombo = Math.max(ctx.stats.maxCombo, combo);

      const creation = resolveCandidateCreation(
        ctx.board,
        resolution.specialMatchCandidates,
        registry,
        runtime,
        combo,
        ctx.specialCreationPolicy ?? "priority-unique-anchors",
        matches,
      );
      specialEvents.push(...creation.events);
      createdIds.push(...creation.created.map((instance) => instance.instanceId));
      for (const instance of creation.created) {
        createdThisCombo.add(instance.instanceId);
      }

      const preserve = new Set(creation.preserveCellIds);
      const clearedCellIds = matchedCellIds(matches).filter((id) => !preserve.has(id));
      resolveOrdinaryMatches(ctx, matches, combo, scoreForMatch, preserve);
      const placed = placeCreatedSpecials(ctx.board, runtime, creation.created);
      if (placed) {
        termination = "CASCADE_INVALID";
        specialEvents.push(limitEvent("CASCADE_INVALID", placed, { created: creation.created.map((item) => item.instanceId) }));
        break;
      }
      counts.mutations += clearedCellIds.length + creation.created.length;
      steps.push({ ...emptyStep("resolve", combo, matches), clearedCellIds });

      applyObstacleMatchEffects(ctx.board, matches, ctx.obstacleRegistry);
      steps.push(emptyStep("effects", combo, matches));
      collectMatchTriggers(ctx.board, runtime, registry, clearedCellIds, createdThisCombo);
    }

    const settlement = settleFlow(ctx.board);
    steps.push({
      ...emptyStep("move", combo, []),
      moved: settlement.moves.flatMap((move) =>
        move.occupant.type === "icon" ? [{ from: move.from, to: move.to, iconId: move.occupant.iconId }] : [],
      ),
    });

    const activation = resolvePendingActivations(
      ctx.board,
      runtime,
      registry,
      interactions,
      ctx.obstacleRegistry,
      { maxActivations: limits.maxActivations, maxEffects: limits.maxEffects },
      counts,
    );
    specialEvents.push(...activation.events);
    if (activation.applied.length > 0) {
      counts.mutations += activation.applied.length;
    }
    if (activation.invalid === "activation-limit" || activation.invalid === "effect-limit") {
      termination = "CASCADE_LIMIT_REACHED";
      specialEvents.push(limitEvent("CASCADE_LIMIT_REACHED", `Cascade ${activation.invalid} reached.`, { counts }));
      break;
    }
    if (activation.invalid) {
      termination = "CASCADE_INVALID";
      specialEvents.push(limitEvent("CASCADE_INVALID", activation.invalid, {}));
      break;
    }
    if (activation.applied.length > 0) {
      steps.push(emptyStep("special-activate", combo, []));
      const afterSpecial = settleFlow(ctx.board);
      steps.push({
        ...emptyStep("move", combo, []),
        moved: afterSpecial.moves.flatMap((move) =>
          move.occupant.type === "icon" ? [{ from: move.from, to: move.to, iconId: move.occupant.iconId }] : [],
        ),
      });
    }
    specialEvents.push(...cancelOrphans(ctx.board, runtime));
    if (specialEvents.length > limits.maxEvents) {
      termination = "CASCADE_LIMIT_REACHED";
      specialEvents.push(limitEvent("CASCADE_LIMIT_REACHED", "Cascade event limit reached.", { events: specialEvents.length }));
      break;
    }

    const filled = refillBoard(ctx);
    steps.push({ ...emptyStep("refill", combo, []), filled });
    counts.mutations += filled.length;

    const mark = fingerprint(ctx.board, runtime);
    if (seen.has(mark)) {
      termination = "CASCADE_STATE_REPEAT";
      specialEvents.push(limitEvent("CASCADE_STATE_REPEAT", "Repeated board/special state detected after a cascade cycle.", { fingerprint: mark }));
      break;
    }
    seen.add(mark);
  }

  if (combo > 0) {
    ctx.stats.cascadesCompleted += 1;
  }
  if (termination === "CASCADE_COMPLETED") {
    specialEvents.push(limitEvent("CASCADE_COMPLETED", "Cascade completed. No remaining matches or activations.", { combo }));
  }
  steps.push(emptyStep("complete", combo, []));
  if (ctx.specialRuntime) {
    ctx.specialRuntime.events.push(...specialEvents);
  }

  return {
    steps,
    combo,
    stable: termination === "CASCADE_COMPLETED",
    termination,
    specialEvents,
    specialMatchesCreated: createdIds,
    diagnostics: {
      eventCount: specialEvents.length,
      effectCount: counts.effects,
      cascadeDepth: counts.depth,
      activationCount: counts.activations,
      boardMutationCount: counts.mutations,
      durationMs: Date.now() - started,
    },
  };
}

function limitEvent(kind: SpecialMatchEvent["kind"], message: string, data: Record<string, unknown>): SpecialMatchEvent {
  return {
    kind,
    message,
    explain: {
      whyCascadeStopped: message,
      whyCascadeContinued: kind === "CASCADE_COMPLETED" ? undefined : undefined,
      accessibility: defaultSpecialAccessibility("cascade", "board"),
    },
    data,
  };
}

function resolveOrdinaryMatches(
  ctx: CascadeContext,
  matches: MatchGroup[],
  combo: number,
  scoreForMatch: (group: MatchGroup, combo: number) => number,
  preserve: Set<CellId>,
): void {
  const seen = new Set<CellId>();
  for (const group of matches) {
    ctx.stats.score += scoreForMatch(group, combo);
    for (const cellId of group.cellIds) {
      if (seen.has(cellId)) {
        continue;
      }
      seen.add(cellId);
      const cell = getCell(ctx.board, cellId);
      if (cell.occupant.type === "icon") {
        const iconId = cell.occupant.iconId;
        if (iconId === group.colorIconId) {
          ctx.stats.collectedIcons[iconId] = (ctx.stats.collectedIcons[iconId] ?? 0) + 1;
        }
      }
      ctx.stats.clearedCellCounts[cellId] = (ctx.stats.clearedCellCounts[cellId] ?? 0) + 1;
      if (cell.flags.hidden) {
        cell.flags.hidden = false;
        ctx.stats.revealedCellIds.push(cellId);
      }
      if (preserve.has(cellId)) {
        continue;
      }
      if (!cell.flags.protected) {
        cell.occupant = { type: "empty" };
      }
    }
  }
}

function placeCreatedSpecials(board: Board, runtime: SpecialMatchRuntime, created: { instanceId: string }[]): string | undefined {
  const primitive = createPrimitiveRuntime(board);
  const effects = created.map((item) => placeSpecialOccupantEffect(runtime.instances[item.instanceId]!));
  if (effects.length === 0) {
    return undefined;
  }
  const batch = applyEffectBatch(primitive, effects);
  if (!batch.ok) {
    return batch.explanation.failure ?? "Failed to place Special Match occupants.";
  }
  adoptBoard(board, batch.runtime.board);
  return undefined;
}

export function refillBoard(ctx: CascadeContext): Array<{ cellId: CellId; iconId: IconId }> {
  const filled: Array<{ cellId: CellId; iconId: IconId }> = [];
  const refill = ctx.board.topology.movement.refill;
  if (refill.mode === "none") {
    return filled;
  }

  const sources = (refill.sourceCellIds ?? ctx.board.topology.spawnSources).slice().sort();
  const maxAttempts = refill.maxAvoidAttempts ?? 8;

  for (const cellId of sources) {
    const cell = getCell(ctx.board, cellId);
    if (!cell.flags.active || cell.occupant.type !== "empty") {
      continue;
    }
    let chosen: IconId | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = ctx.random.pick(ctx.iconPool);
      cell.occupant = { type: "icon", iconId: candidate };
      if (!refill.avoidImmediateMatches) {
        chosen = candidate;
        break;
      }
      const matches = detectMatches(ctx.board, ctx.matchRules, ctx.iconRegistry);
      const createsMatch = matches.some((group) => group.cellIds.includes(cellId));
      if (!createsMatch) {
        chosen = candidate;
        break;
      }
      cell.occupant = { type: "empty" };
    }
    if (!chosen) {
      chosen = ctx.random.pick(ctx.iconPool);
      cell.occupant = { type: "icon", iconId: chosen };
    }
    filled.push({ cellId, iconId: chosen });
  }

  if (ctx.board.topology.movement.mode === "along-flow") {
    settleFlow(ctx.board);
    for (const cellId of sources) {
      const cell = getCell(ctx.board, cellId);
      if (cell.flags.active && cell.occupant.type === "empty" && ctx.iconPool.length > 0) {
        const iconId = ctx.random.pick(ctx.iconPool);
        cell.occupant = { type: "icon", iconId };
        filled.push({ cellId, iconId });
      }
    }
    settleFlow(ctx.board);
  }

  return filled;
}
