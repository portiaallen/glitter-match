import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import {
  createMatchEngineRuleRegistry,
  type MatchEngineRule,
  type MatchEngineRuleRegistry,
} from "./engine.js";
import { matchableIcon } from "./occupancy.js";
import {
  createPatternRegistry,
  detectWithPattern,
  type PatternHit,
  type PatternRegistry,
  type PatternSearchContext,
} from "./patterns.js";
import {
  defaultSearchBounds,
  type MatchAccessibility,
  type MatchDetectionContext,
  type MatchEvent,
  type MatchGroup,
  type MatchResolution,
  type MatchRules,
  type OccupantIdentity,
  type OverlapPolicy,
  type OverlapRecord,
  type SpecialMatchCandidate,
} from "./types.js";
import { createWildcardRegistry, type WildcardRegistry } from "./wildcard.js";

export interface MatchEngine {
  patterns: PatternRegistry;
  rules: MatchEngineRuleRegistry;
  wildcards: WildcardRegistry;
}

let defaultEngine: MatchEngine | undefined;

export function createMatchEngine(): MatchEngine {
  const patterns = createPatternRegistry();
  const rules = createMatchEngineRuleRegistry(patterns);
  const wildcards = createWildcardRegistry();
  return { patterns, rules, wildcards };
}

export function getDefaultMatchEngine(): MatchEngine {
  return (defaultEngine ??= createMatchEngine());
}

function groupIdFor(ruleId: string, mode: string, colorIconId: string, cellIds: CellId[]): string {
  return `mg:${ruleId}:${mode}:${colorIconId}:${[...cellIds].sort().join(",")}`;
}

function occupantIdentities(board: Board, cellIds: CellId[], rule: MatchEngineRule): OccupantIdentity[] {
  return cellIds.map((cellId) => ({
    cellId,
    iconId: matchableIcon(board, cellId, rule.allowedCellStates, rule.allowedOccupantStates) ?? "",
  }));
}

function accessibilityFor(group: MatchGroup, rule: MatchEngineRule): MatchAccessibility {
  return {
    matchType: group.pattern ?? group.mode,
    matchedCells: [...group.cellIds],
    patternExplanation: group.explain?.summary ?? rule.accessibility.patternExplanation,
    stateChanges: rule.accessibility.stateChanges,
    nonColorIndicator: `${group.mode}:${group.colorIconId}:${group.cellIds.join("+")}`,
    audioCue: rule.accessibility.audioCue,
    hapticCue: rule.accessibility.hapticCue,
  };
}

function event(
  kind: MatchEvent["kind"],
  message: string,
  accessibility: MatchAccessibility,
  extra: Partial<MatchEvent> = {},
): MatchEvent {
  return { kind, message, accessibility, ...extra };
}

function specialCandidateFor(
  hit: PatternHit,
  rule: MatchEngineRule,
  triggerMove: MatchDetectionContext["triggerMove"],
): SpecialMatchCandidate | null {
  const output = rule.specialMatchOutput;
  if (!output || hit.displayCellIds.length < output.minSize) {
    return null;
  }
  let candidateType = output.candidateType;
  if (rule.engineMode === "aligned") {
    candidateType = hit.displayCellIds.length >= 5 ? "line-5" : "line-4";
  }
  return {
    candidateType,
    affectedCellIds: [...hit.displayCellIds],
    anchorCellId: hit.pivot ?? hit.displayCellIds[0]!,
    triggerMove: triggerMove ?? null,
    ruleId: rule.id,
    priority: output.priority + Math.min(hit.displayCellIds.length, 8),
  };
}

function compareGroups(a: MatchGroup, b: MatchGroup): number {
  const aPriority = a.specialMatchCandidate?.priority ?? 0;
  const bPriority = b.specialMatchCandidate?.priority ?? 0;
  if (bPriority !== aPriority) {
    return bPriority - aPriority;
  }
  if (b.cellIds.length !== a.cellIds.length) {
    return b.cellIds.length - a.cellIds.length;
  }
  const rule = (a.ruleId ?? "").localeCompare(b.ruleId ?? "");
  if (rule !== 0) {
    return rule;
  }
  return [...a.cellIds].sort().join(",").localeCompare([...b.cellIds].sort().join(","));
}

/**
 * Overlaps are never silently discarded. keep-all retains every group and records
 * intersecting cells. Other policies defer groups into inspectable overlap records.
 */
export function resolveOverlaps(
  groups: MatchGroup[],
  policy: OverlapPolicy,
): { groups: MatchGroup[]; overlaps: OverlapRecord[] } {
  const cellToGroups = new Map<string, string[]>();
  for (const group of groups) {
    for (const cellId of group.cellIds) {
      const list = cellToGroups.get(cellId) ?? [];
      list.push(group.groupId ?? "");
      cellToGroups.set(cellId, list);
    }
  }

  if (policy === "keep-all") {
    const overlaps: OverlapRecord[] = [];
    for (const [cellId, groupIds] of [...cellToGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (groupIds.length > 1) {
        overlaps.push({
          cellId,
          groupIds: [...groupIds].sort(),
          policy,
          keptGroupIds: [...groupIds].sort(),
          deferredGroupIds: [],
        });
      }
    }
    return { groups, overlaps };
  }

  const ordered = [...groups].sort(compareGroups);
  if (policy === "prefer-largest") {
    ordered.sort((a, b) => b.cellIds.length - a.cellIds.length || compareGroups(a, b));
  }

  const kept: MatchGroup[] = [];
  const deferred: MatchGroup[] = [];
  const claimed = new Set<string>();
  for (const group of ordered) {
    const fullyClaimed = group.cellIds.every((id) => claimed.has(id));
    if (fullyClaimed && kept.length > 0) {
      deferred.push(group);
      continue;
    }
    kept.push(group);
    for (const id of group.cellIds) {
      claimed.add(id);
    }
  }

  const overlaps: OverlapRecord[] = [];
  for (const [cellId, groupIds] of [...cellToGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (groupIds.length > 1) {
      const keptIds = kept.map((group) => group.groupId ?? "").filter((id) => groupIds.includes(id));
      const deferredIds = deferred.map((group) => group.groupId ?? "").filter((id) => groupIds.includes(id));
      overlaps.push({
        cellId,
        groupIds: [...groupIds].sort(),
        policy,
        keptGroupIds: keptIds.sort(),
        deferredGroupIds: deferredIds.sort(),
      });
    }
  }

  return { groups: kept, overlaps };
}

function selectRules(engine: MatchEngine, rules: MatchRules): MatchEngineRule[] {
  if (rules.ruleIds?.length) {
    return rules.ruleIds.map((id) => engine.rules.get(id));
  }
  return engine.rules.rulesForModes(rules.modes);
}

function toMatchGroup(
  hit: PatternHit,
  rule: MatchEngineRule,
  board: Board,
  context: MatchDetectionContext | undefined,
): MatchGroup {
  const cellIds = hit.pattern === "line" || hit.pattern === "path" ? hit.displayCellIds : hit.cellIds;
  const id = groupIdFor(rule.id, hit.mode, hit.colorIconId, cellIds);
  const triggerMove = context?.triggerMove ?? null;
  const candidate = specialCandidateFor(hit, rule, triggerMove);
  const group: MatchGroup = {
    cellIds,
    colorIconId: hit.colorIconId,
    mode: hit.mode,
    pattern: hit.pattern,
    groupId: id,
    ruleId: rule.id,
    occupantIdentities: occupantIdentities(board, cellIds, rule),
    patternMetadata: {
      patternId: hit.patternId,
      pivot: hit.pivot,
      directionsUsed: hit.directionsUsed,
      symmetry: rule.symmetry,
    },
    triggerMove,
    cascadeIndex: context?.cascadeIndex ?? 0,
    specialMatchCandidate: candidate,
    explain: hit.explain,
  };
  group.accessibility = accessibilityFor(group, rule);
  return group;
}

function dedupeGroups(groups: MatchGroup[]): MatchGroup[] {
  const seen = new Set<string>();
  const result: MatchGroup[] = [];
  for (const group of groups) {
    const key = `${group.mode}:${group.colorIconId}:${group.cellIds.join(",")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(group);
  }
  return result;
}

/**
 * Detect → Group → Resolve Overlaps → Identify Special-Match Candidates →
 * Mark Matched Cells → Emit Match Events.
 *
 * Does not mutate the board and is not the cascade engine. Cascade consumes groups.
 */
export function runMatchResolution(
  board: Board,
  rules: MatchRules,
  registry: IconRegistry,
  context?: MatchDetectionContext,
  engine: MatchEngine = getDefaultMatchEngine(),
): MatchResolution {
  const bounds = defaultSearchBounds(rules.searchBounds);
  const budget = { walks: 0, truncated: false };
  const failures: MatchResolution["failures"] = [];
  const events: MatchEvent[] = [];
  const detected: MatchGroup[] = [];
  const selected = selectRules(engine, rules);

  for (const rule of selected) {
    const handler = engine.patterns.get(rule.patternId);
    const ctx: PatternSearchContext = {
      board,
      registry,
      minSize: Math.max(rules.minGroupSize, rule.minMatchSize),
      maxSize: rule.maxMatchSize,
      bounds: defaultSearchBounds({
        ...rule.searchBounds,
        ...handler.definition.searchConstraints,
        ...rules.searchBounds,
      }),
      allowedDirections: rule.traversal.allowedDirections,
      allowedCellStates: rule.allowedCellStates,
      allowedOccupantStates: rule.allowedOccupantStates,
      budget,
      ruleId: rule.id,
      failures,
    };
    const hits = detectWithPattern(handler, ctx, handler.definition.steps);
    for (const hit of hits) {
      const group = toMatchGroup(hit, rule, board, context);
      detected.push(group);
      events.push(
        event("match-detected", group.explain?.summary ?? "Match detected.", group.accessibility!, {
          groupId: group.groupId,
          ruleId: rule.id,
          cellIds: group.cellIds,
          patternId: hit.patternId,
        }),
      );
      events.push(
        event("pattern-recognized", `Pattern ${hit.patternId} recognized.`, group.accessibility!, {
          groupId: group.groupId,
          ruleId: rule.id,
          patternId: hit.patternId,
          cellIds: group.cellIds,
        }),
      );
    }
  }

  const grouped = dedupeGroups(detected);
  for (const group of grouped) {
    events.push(
      event("match-group-created", `Match group ${group.groupId} created.`, group.accessibility!, {
        groupId: group.groupId,
        ruleId: group.ruleId,
        cellIds: group.cellIds,
      }),
    );
  }

  const policy: OverlapPolicy = rules.overlapPolicy ?? "keep-all";
  const resolved = resolveOverlaps(grouped, policy);
  if (resolved.overlaps.length > 0) {
    const a11y: MatchAccessibility = {
      matchType: "overlap",
      matchedCells: resolved.overlaps.map((item) => item.cellId),
      patternExplanation: `Overlap policy ${policy} applied to ${resolved.overlaps.length} shared cells.`,
      stateChanges: "No group was silently discarded.",
      nonColorIndicator: `overlap:${policy}`,
    };
    events.push(
      event("overlap-resolved", `Overlaps resolved with policy "${policy}".`, a11y, {
        data: { overlaps: resolved.overlaps, policy },
      }),
    );
  }

  const specialMatchCandidates: SpecialMatchCandidate[] = [];
  const competing = new Map<string, SpecialMatchCandidate[]>();
  for (const group of resolved.groups) {
    const candidate = group.specialMatchCandidate;
    if (!candidate) {
      continue;
    }
    specialMatchCandidates.push(candidate);
    for (const cellId of candidate.affectedCellIds) {
      const list = competing.get(cellId) ?? [];
      list.push(candidate);
      competing.set(cellId, list);
    }
    events.push(
      event(
        "special-match-candidate-created",
        `Special-match candidate ${candidate.candidateType} at ${candidate.anchorCellId} (not created as an inventory Special Icon).`,
        group.accessibility ?? {
          matchType: candidate.candidateType,
          matchedCells: candidate.affectedCellIds,
          patternExplanation: "Special Match candidate metadata only.",
          stateChanges: "No board occupant was created.",
          nonColorIndicator: candidate.candidateType,
        },
        {
          ruleId: candidate.ruleId,
          cellIds: candidate.affectedCellIds,
          data: { candidate },
        },
      ),
    );
  }

  for (const [cellId, candidates] of [...competing.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (candidates.length < 2) {
      continue;
    }
    const ranked = [...candidates].sort(
      (a, b) =>
        b.priority - a.priority ||
        a.ruleId.localeCompare(b.ruleId) ||
        a.anchorCellId.localeCompare(b.anchorCellId) ||
        a.affectedCellIds.join(",").localeCompare(b.affectedCellIds.join(",")),
    );
    events.push(
      event(
        "overlap-resolved",
        `Special-match candidates competing for ${cellId}: winner ${ranked[0]?.candidateType} by priority/tie-break.`,
        {
          matchType: "special-candidate-tiebreak",
          matchedCells: [cellId],
          patternExplanation: `Winner ${ranked[0]?.candidateType} (${ranked[0]?.priority}); competitors recorded.`,
          stateChanges: "Candidates remain metadata only.",
          nonColorIndicator: "special-candidate-tiebreak",
        },
        {
          cellIds: [cellId],
          data: { winner: ranked[0], ranked },
        },
      ),
    );
  }

  const markedCellIds = [...new Set(resolved.groups.flatMap((group) => group.cellIds))].sort();
  const markA11y: MatchAccessibility = {
    matchType: "marked",
    matchedCells: markedCellIds,
    patternExplanation: "Matched cells marked for cascade consumption. Board is not mutated here.",
    stateChanges: "Marked only.",
    nonColorIndicator: "marked-cells",
  };
  events.push(event("matched-cells-marked", `Marked ${markedCellIds.length} cells.`, markA11y, { cellIds: markedCellIds }));
  events.push(
    event("match-resolution-complete", "Match resolution complete.", markA11y, {
      data: { groupCount: resolved.groups.length, truncated: budget.truncated, walks: budget.walks },
    }),
  );

  return {
    groups: resolved.groups,
    markedCellIds,
    specialMatchCandidates,
    overlaps: resolved.overlaps,
    events,
    explanations: resolved.groups.map((group) => group.explain!).filter(Boolean),
    failures,
    search: { walks: budget.walks, truncated: budget.truncated, bounds },
  };
}

export function serializeMatchResolution(resolution: MatchResolution): string {
  return JSON.stringify(resolution);
}

export function parseMatchResolution(serialized: string): MatchResolution {
  return JSON.parse(serialized) as MatchResolution;
}

export function whyMatchCount(group: MatchGroup): string {
  return group.explain?.summary ?? `Match ${group.mode} on ${group.cellIds.join(", ")}.`;
}

export function whyCandidateFailed(resolution: MatchResolution, startCell?: string): string[] {
  return resolution.failures
    .filter((item) => !startCell || item.startingCell === startCell)
    .map((item) => item.summary);
}
