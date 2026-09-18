import type { CellId, IconId } from "../ids.js";
import type { Board } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { issue, throwIfErrors } from "../validation.js";
import { groupColor } from "./compatibility.js";
import {
  canJoinIconSequence,
  canParticipate,
  connectivityNeighbors,
  matchableIcon,
  matchNeighbors,
} from "./occupancy.js";
import {
  PATTERN_IDS,
  PATTERN_SYMMETRIES,
  type MatchExplain,
  type MatchMode,
  type MatchSearchBounds,
  type PatternId,
  type PatternSymmetry,
} from "./types.js";
import { beginWalk, commitStep, explainFromWalk, walkSameDirection, type PatternWalk } from "./walk.js";

export type { PatternId };

export interface PatternDefinition {
  id: PatternId | string;
  version: string;
  requiredTopology: "rays" | "cluster" | "cycle" | "path" | "authored-walk";
  minCells: number;
  maxCells?: number;
  relativeRelationships?: string;
  directionalRequirements?: string[];
  /** Metadata only. Matching never assumes geometric symmetry exists on every graph. */
  symmetry: PatternSymmetry;
  allowedTransformations: Array<"none" | "rotate-direction-vocabulary" | "reflect-graph">;
  wildcardPositions: "any" | "none";
  requiredIconRelationships: "compatible-occupants";
  steps?: Array<{ direction: string }>;
  searchConstraints: Partial<MatchSearchBounds>;
}

export interface PatternHit {
  cellIds: CellId[];
  displayCellIds: CellId[];
  colorIconId: string;
  patternId: string;
  mode: MatchMode;
  pattern?: "line" | "corner" | "tee" | "cross" | "cluster" | "path" | "cycle";
  pivot?: CellId;
  directionsUsed: string[];
  edgesTraversed: PatternWalk["edgesTraversed"];
  explain: MatchExplain;
}

export interface PatternSearchContext {
  board: Board;
  registry: IconRegistry;
  minSize: number;
  maxSize?: number;
  bounds: MatchSearchBounds;
  allowedDirections?: readonly string[];
  allowedCellStates: readonly string[];
  allowedOccupantStates: readonly string[];
  startCellIds?: readonly CellId[];
  endCellIds?: readonly CellId[];
  allowRepeatedCells?: boolean;
  budget: { walks: number; truncated: boolean };
  ruleId: string;
  failures: MatchExplain[];
}

export interface PatternHandler {
  definition: PatternDefinition;
  detect(ctx: PatternSearchContext): PatternHit[];
}

function bump(ctx: PatternSearchContext): boolean {
  ctx.budget.walks += 1;
  if (ctx.budget.walks > ctx.bounds.maxWalks) {
    ctx.budget.truncated = true;
    return false;
  }
  return true;
}

function recordFailure(ctx: PatternSearchContext, explain: MatchExplain): void {
  if (ctx.failures.length < ctx.bounds.maxFailuresRecorded) {
    ctx.failures.push(explain);
  }
}

function hitFromWalk(
  walk: PatternWalk,
  colorIconId: string,
  patternId: string,
  mode: MatchMode,
  pattern: PatternHit["pattern"],
  ctx: PatternSearchContext,
  keepOrder: boolean,
  pivot?: CellId,
): PatternHit {
  const displayCellIds = keepOrder ? [...walk.cellIds] : [...walk.cellIds].sort();
  return {
    cellIds: [...walk.cellIds].sort(),
    displayCellIds,
    colorIconId,
    patternId,
    mode,
    pattern,
    pivot,
    directionsUsed: [...walk.directionsUsed],
    edgesTraversed: [...walk.edgesTraversed],
    explain: explainFromWalk(
      walk,
      ctx.ruleId,
      patternId,
      "matched",
      `Matched ${patternId} of ${walk.cellIds.length} cells starting at ${walk.start}.`,
      colorIconId,
    ),
  };
}

function iconsOn(ctx: PatternSearchContext, cellIds: CellId[]): IconId[] {
  return cellIds.map((id) => matchableIcon(ctx.board, id, ctx.allowedCellStates, ctx.allowedOccupantStates)!);
}

export class PatternRegistry {
  private readonly handlers = new Map<string, PatternHandler>();

  register(handler: PatternHandler): void {
    const definition = handler.definition;
    if (this.handlers.has(definition.id)) {
      throwIfErrors(
        [issue("pattern.duplicate", `patterns.${definition.id}`, `Pattern "${definition.id}" is already registered.`)],
        "Duplicate pattern",
      );
    }
    if (definition.minCells < 2) {
      throwIfErrors(
        [issue("pattern.impossible_size", `patterns.${definition.id}`, "Pattern minCells must be at least 2.")],
        "Invalid pattern",
      );
    }
    if (definition.maxCells !== undefined && definition.maxCells < definition.minCells) {
      throwIfErrors(
        [issue("pattern.impossible_size", `patterns.${definition.id}`, "Pattern maxCells is smaller than minCells.")],
        "Invalid pattern",
      );
    }
    if (!(PATTERN_SYMMETRIES as readonly string[]).includes(definition.symmetry)) {
      throwIfErrors(
        [issue("pattern.invalid_symmetry", `patterns.${definition.id}`, `Unknown symmetry "${definition.symmetry}".`)],
        "Invalid pattern",
      );
    }
    this.handlers.set(definition.id, handler);
  }

  get(id: string): PatternHandler {
    const handler = this.handlers.get(id);
    if (!handler) {
      throwIfErrors(
        [issue("pattern.unknown", `patterns.${id}`, `Unknown pattern "${id}". Register it before referencing it.`)],
        "Unknown pattern",
      );
      throw new Error("unreachable");
    }
    return handler;
  }

  has(id: string): boolean {
    return this.handlers.has(id);
  }

  list(): PatternHandler[] {
    return [...this.handlers.values()];
  }
}

function define(
  id: PatternId,
  requiredTopology: PatternDefinition["requiredTopology"],
  extra: Partial<PatternDefinition> = {},
): PatternDefinition {
  return {
    id,
    version: "7.0.0",
    requiredTopology,
    minCells: extra.minCells ?? 3,
    maxCells: extra.maxCells,
    relativeRelationships: extra.relativeRelationships,
    directionalRequirements: extra.directionalRequirements,
    symmetry: extra.symmetry ?? "graph-defined",
    allowedTransformations: extra.allowedTransformations ?? ["rotate-direction-vocabulary"],
    wildcardPositions: extra.wildcardPositions ?? "any",
    requiredIconRelationships: "compatible-occupants",
    steps: extra.steps,
    searchConstraints: extra.searchConstraints ?? {},
  };
}

function detectCluster(ctx: PatternSearchContext): PatternHit[] {
  const colors = new Set<string>();
  for (const id of ctx.board.topology.cellIds) {
    const icon = matchableIcon(ctx.board, id, ctx.allowedCellStates, ctx.allowedOccupantStates);
    if (!icon) {
      continue;
    }
    const kind = ctx.registry.get(icon).kind;
    if (kind === "ordinary" || kind === "dev") {
      colors.add(icon);
    }
  }

  const hits: PatternHit[] = [];
  for (const color of [...colors].sort()) {
    const eligible = new Set<CellId>();
    for (const id of ctx.board.topology.cellIds) {
      const icon = matchableIcon(ctx.board, id, ctx.allowedCellStates, ctx.allowedOccupantStates);
      if (!icon || !canParticipate(ctx.board, id, ctx.allowedCellStates, ctx.allowedOccupantStates)) {
        continue;
      }
      if (icon === color || ctx.registry.get(icon).kind === "glitter") {
        eligible.add(id);
      }
    }

    const seen = new Set<CellId>();
    for (const start of [...eligible].sort()) {
      if (seen.has(start)) {
        continue;
      }
      if (!bump(ctx)) {
        return hits;
      }
      const stack = [start];
      const component: CellId[] = [];
      const edgesTraversed: PatternWalk["edgesTraversed"] = [];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (seen.has(current) || !eligible.has(current)) {
          continue;
        }
        seen.add(current);
        component.push(current);
        for (const next of connectivityNeighbors(ctx.board, current)) {
          if (!seen.has(next) && eligible.has(next)) {
            edgesTraversed.push({ from: current, to: next });
            stack.push(next);
          }
        }
      }
      if (ctx.maxSize !== undefined && component.length > ctx.maxSize) {
        recordFailure(ctx, {
          ruleId: ctx.ruleId,
          patternId: "cluster",
          startingCell: start,
          traversedCells: [...component].sort(),
          edgesTraversed,
          directionsUsed: [],
          occupantCompatibility: [],
          rejectedCandidates: [{ cellId: start, reason: `cluster size ${component.length} exceeds max ${ctx.maxSize}` }],
          finalMatchedCells: [],
          outcome: "failed",
          summary: `Cluster from ${start} failed: size ${component.length} exceeds maximum ${ctx.maxSize}.`,
        });
        continue;
      }
      const colorIconId = groupColor(iconsOn(ctx, component), ctx.registry);
      if (component.length >= ctx.minSize && colorIconId === color) {
        const cellIds = component.sort();
        hits.push({
          cellIds,
          displayCellIds: cellIds,
          colorIconId: color,
          patternId: "cluster",
          mode: "cluster",
          pattern: "cluster",
          directionsUsed: [],
          edgesTraversed,
          explain: {
            ruleId: ctx.ruleId,
            patternId: "cluster",
            startingCell: start,
            traversedCells: cellIds,
            edgesTraversed,
            directionsUsed: [],
            occupantCompatibility: cellIds.map((id) => ({
              cellId: id,
              iconId: matchableIcon(ctx.board, id, ctx.allowedCellStates, ctx.allowedOccupantStates)!,
              accepted: true,
              reason: "connected compatible occupant",
            })),
            rejectedCandidates: [],
            finalMatchedCells: cellIds,
            outcome: "matched",
            summary: `Cluster match of ${cellIds.length} cells for ${color} starting at ${start}.`,
          },
        });
      }
    }
  }
  return hits;
}

function detectStraight(ctx: PatternSearchContext): PatternHit[] {
  const hits: PatternHit[] = [];
  const seen = new Set<string>();
  for (const from of ctx.board.topology.cellIds) {
    const startIcon = matchableIcon(ctx.board, from, ctx.allowedCellStates, ctx.allowedOccupantStates);
    if (!startIcon) {
      continue;
    }
    const outgoing = ctx.board.topology.directed[from] ?? [];
    for (const edge of outgoing) {
      if (!edge.direction || !edge.allowsMatch) {
        continue;
      }
      if (edge.kind === "portal" && !ctx.board.topology.portalsConductMatches) {
        continue;
      }
      if (ctx.allowedDirections && !ctx.allowedDirections.includes(edge.direction)) {
        continue;
      }
      if (!bump(ctx)) {
        return hits;
      }
      const walk = walkSameDirection(ctx.board, from, edge.direction, ctx.registry, {
        maxVisitedPerWalk: ctx.bounds.maxVisitedPerWalk,
      });
      if (!walk) {
        continue;
      }
      const colorIconId = groupColor(iconsOn(ctx, walk.cellIds), ctx.registry);
      if (walk.cellIds.length < ctx.minSize || !colorIconId) {
        if (walk.cellIds.length >= 2) {
          recordFailure(
            ctx,
            explainFromWalk(
              walk,
              ctx.ruleId,
              "straight",
              "failed",
              `Aligned walk from ${from} along "${edge.direction}" failed size/color constraints.`,
            ),
          );
        }
        continue;
      }
      if (ctx.maxSize !== undefined && walk.cellIds.length > ctx.maxSize) {
        continue;
      }
      const key = `${colorIconId}:${[...walk.cellIds].sort().join(",")}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hits.push(hitFromWalk(walk, colorIconId, "straight", "aligned", "line", ctx, true));
    }
  }
  return hits;
}

function detectJunction(ctx: PatternSearchContext, kind: "L" | "T" | "cross"): PatternHit[] {
  const hits: PatternHit[] = [];
  const wantRays = kind === "cross" ? 4 : kind === "T" ? 3 : 2;
  const mode: MatchMode = kind === "cross" ? "cross" : kind === "T" ? "tee" : "corner";
  const pattern = kind === "cross" ? "cross" : kind === "T" ? "tee" : "corner";

  for (const pivot of ctx.board.topology.cellIds) {
    const startIcon = matchableIcon(ctx.board, pivot, ctx.allowedCellStates, ctx.allowedOccupantStates);
    if (!startIcon) {
      continue;
    }
    if (!bump(ctx)) {
      return hits;
    }
    const rays: PatternWalk[] = [];
    const directions = new Set(
      (ctx.board.topology.directed[pivot] ?? [])
        .filter((edge) => edge.allowsMatch)
        .map((edge) => edge.direction)
        .filter((direction): direction is string => Boolean(direction)),
    );
    for (const direction of [...directions].sort()) {
      if (ctx.allowedDirections && !ctx.allowedDirections.includes(direction)) {
        continue;
      }
      const walk = walkSameDirection(ctx.board, pivot, direction, ctx.registry, {
        maxVisitedPerWalk: ctx.bounds.maxVisitedPerWalk,
      });
      if (walk && walk.cellIds.length >= 2 && groupColor(iconsOn(ctx, walk.cellIds), ctx.registry)) {
        rays.push(walk);
      }
    }
    if (rays.length !== wantRays && !(kind === "cross" && rays.length >= 4)) {
      if (directions.size >= 2) {
        recordFailure(ctx, {
          ruleId: ctx.ruleId,
          patternId: kind,
          startingCell: pivot,
          traversedCells: [...new Set(rays.flatMap((ray) => ray.cellIds))],
          edgesTraversed: rays.flatMap((ray) => ray.edgesTraversed),
          directionsUsed: rays.flatMap((ray) => ray.directionsUsed),
          occupantCompatibility: [],
          rejectedCandidates: [{ cellId: pivot, reason: `expected ${wantRays} compatible rays, found ${rays.length}` }],
          finalMatchedCells: [],
          outcome: "failed",
          summary: `Pattern ${kind} failed at ${pivot}: expected ${wantRays} authored rays, found ${rays.length}.`,
        });
      }
      continue;
    }
    const usedRays = kind === "cross" ? rays : rays.slice(0, wantRays);
    const cellIds = [...new Set(usedRays.flatMap((ray) => ray.cellIds))].sort();
    if (cellIds.length < ctx.minSize) {
      continue;
    }
    if (ctx.maxSize !== undefined && cellIds.length > ctx.maxSize) {
      continue;
    }
    const colorIconId = groupColor(iconsOn(ctx, cellIds), ctx.registry);
    if (!colorIconId) {
      continue;
    }
    const combined = beginWalk(pivot, startIcon);
    combined.cellIds = cellIds;
    combined.visited = new Set(cellIds);
    combined.edgesTraversed = usedRays.flatMap((ray) => ray.edgesTraversed);
    combined.directionsUsed = [...new Set(usedRays.flatMap((ray) => ray.directionsUsed))];
    combined.occupantCompatibility = cellIds.map((id) => ({
      cellId: id,
      iconId: matchableIcon(ctx.board, id, ctx.allowedCellStates, ctx.allowedOccupantStates)!,
      accepted: true,
      reason: id === pivot ? "junction pivot" : "ray occupant",
    }));
    hits.push(hitFromWalk(combined, colorIconId, kind, mode, pattern, ctx, false, pivot));
  }
  return hits;
}

function canonicalizeCycle(cellIds: CellId[]): string {
  const n = cellIds.length;
  const rotations: string[] = [];
  for (let index = 0; index < n; index += 1) {
    const rotated = [...cellIds.slice(index), ...cellIds.slice(0, index)];
    rotations.push(rotated.join(","));
  }
  const reversed = [...cellIds].reverse();
  for (let index = 0; index < n; index += 1) {
    const rotated = [...reversed.slice(index), ...reversed.slice(0, index)];
    rotations.push(rotated.join(","));
  }
  return rotations.sort()[0]!;
}

function detectCycle(ctx: PatternSearchContext): PatternHit[] {
  const hits: PatternHit[] = [];
  const seen = new Set<string>();
  const minLen = Math.max(ctx.minSize, 3);
  const maxLen = Math.min(ctx.maxSize ?? ctx.bounds.maxCycleLength, ctx.bounds.maxCycleLength);

  const dfs = (start: CellId, path: CellId[], visited: Set<CellId>, walk: PatternWalk, icons: IconId[]): void => {
    if (!bump(ctx) || path.length > maxLen) {
      return;
    }
    const current = path[path.length - 1]!;
    for (const next of matchNeighbors(ctx.board, current, ctx.allowedDirections)) {
      if (next.to === start && path.length >= minLen) {
        const colorIconId = groupColor(icons, ctx.registry);
        if (!colorIconId) {
          continue;
        }
        const key = canonicalizeCycle(path);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const cellIds = [...path].sort();
        hits.push({
          cellIds,
          displayCellIds: [...path],
          colorIconId,
          patternId: "ring",
          mode: "cycle",
          pattern: "cycle",
          directionsUsed: [...walk.directionsUsed],
          edgesTraversed: [...walk.edgesTraversed, { from: current, to: next.to, direction: next.direction }],
          explain: {
            ruleId: ctx.ruleId,
            patternId: "ring",
            startingCell: start,
            traversedCells: [...path],
            edgesTraversed: [...walk.edgesTraversed],
            directionsUsed: [...walk.directionsUsed],
            occupantCompatibility: walk.occupantCompatibility,
            rejectedCandidates: walk.rejectedCandidates,
            finalMatchedCells: cellIds,
            outcome: "matched",
            summary: `Cycle of ${path.length} cells starting at ${start} for ${colorIconId}.`,
          },
        });
        continue;
      }
      if (visited.has(next.to) || path.length >= maxLen) {
        continue;
      }
      const icon = matchableIcon(ctx.board, next.to, ctx.allowedCellStates, ctx.allowedOccupantStates);
      if (!icon || !canJoinIconSequence(icons, icon, ctx.registry)) {
        walk.rejectedCandidates.push({
          cellId: next.to,
          reason: icon ? `incompatible occupant "${icon}"` : "occupant cannot participate",
        });
        continue;
      }
      visited.add(next.to);
      path.push(next.to);
      commitStep(walk, next.to, icon, next.direction);
      icons.push(icon);
      dfs(start, path, visited, walk, icons);
      icons.pop();
      path.pop();
      visited.delete(next.to);
      walk.cellIds.pop();
      walk.edgesTraversed.pop();
      walk.occupantCompatibility.pop();
      walk.visited.delete(next.to);
    }
  };

  for (const start of ctx.board.topology.cellIds) {
    const startIcon = matchableIcon(ctx.board, start, ctx.allowedCellStates, ctx.allowedOccupantStates);
    if (!startIcon) {
      continue;
    }
    const walk = beginWalk(start, startIcon);
    dfs(start, [start], new Set([start]), walk, [startIcon]);
    if (ctx.budget.truncated) {
      return hits;
    }
  }
  return hits;
}

function detectPath(ctx: PatternSearchContext): PatternHit[] {
  const hits: PatternHit[] = [];
  const seen = new Set<string>();
  const minLen = ctx.minSize;
  const maxLen = Math.min(ctx.maxSize ?? ctx.bounds.maxPathLength, ctx.bounds.maxPathLength);
  const starts = (ctx.startCellIds ?? ctx.board.topology.cellIds).filter((id) =>
    matchableIcon(ctx.board, id, ctx.allowedCellStates, ctx.allowedOccupantStates),
  );

  const dfs = (walk: PatternWalk, icons: IconId[], allowRepeat: boolean): void => {
    if (!bump(ctx)) {
      return;
    }
    const current = walk.cellIds[walk.cellIds.length - 1]!;
    let extended = false;
    if (walk.cellIds.length < maxLen) {
      for (const next of matchNeighbors(ctx.board, current, ctx.allowedDirections)) {
        if (!allowRepeat && walk.visited.has(next.to)) {
          continue;
        }
        const icon = matchableIcon(ctx.board, next.to, ctx.allowedCellStates, ctx.allowedOccupantStates);
        if (!icon || !canJoinIconSequence(icons, icon, ctx.registry)) {
          walk.rejectedCandidates.push({
            cellId: next.to,
            reason: icon ? `incompatible occupant "${icon}"` : "occupant cannot participate",
          });
          continue;
        }
        extended = true;
        commitStep(walk, next.to, icon, next.direction);
        icons.push(icon);
        dfs(walk, icons, allowRepeat);
        icons.pop();
        walk.cellIds.pop();
        walk.edgesTraversed.pop();
        walk.occupantCompatibility.pop();
        walk.visited.delete(next.to);
      }
    }
    const atEnd = !ctx.endCellIds || ctx.endCellIds.includes(current);
    const longEnough = walk.cellIds.length >= minLen;
    const terminal = !extended || walk.cellIds.length >= maxLen;
    if (longEnough && atEnd && terminal) {
      const colorIconId = groupColor(icons, ctx.registry);
      if (!colorIconId) {
        return;
      }
      const key = walk.cellIds.join(">");
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      hits.push(hitFromWalk(walk, colorIconId, "path", "path", "path", ctx, true));
    }
  };

  for (const start of starts) {
    const startIcon = matchableIcon(ctx.board, start, ctx.allowedCellStates, ctx.allowedOccupantStates);
    if (!startIcon) {
      continue;
    }
    const walk = beginWalk(start, startIcon);
    dfs(walk, [startIcon], ctx.allowRepeatedCells === true);
    if (ctx.budget.truncated) {
      return hits;
    }
  }
  return hits;
}

function detectSequence(ctx: PatternSearchContext, steps: Array<{ direction: string }>, patternId: string): PatternHit[] {
  const hits: PatternHit[] = [];
  if (steps.length === 0) {
    return detectStraight(ctx);
  }
  for (const start of ctx.board.topology.cellIds) {
    const startIcon = matchableIcon(ctx.board, start, ctx.allowedCellStates, ctx.allowedOccupantStates);
    if (!startIcon) {
      continue;
    }
    if (!bump(ctx)) {
      return hits;
    }
    const walk = beginWalk(start, startIcon);
    const icons = [startIcon];
    let failed: string | null = null;
    let current = start;
    for (const step of steps) {
      const next = (ctx.board.topology.directed[current] ?? []).find(
        (edge) => edge.direction === step.direction && edge.allowsMatch && !walk.visited.has(edge.to),
      );
      if (!next) {
        failed = `no authored edge with direction "${step.direction}" from ${current}`;
        break;
      }
      const icon = matchableIcon(ctx.board, next.to, ctx.allowedCellStates, ctx.allowedOccupantStates);
      if (!icon || !canJoinIconSequence(icons, icon, ctx.registry)) {
        failed = icon ? `incompatible occupant "${icon}"` : "occupant cannot participate";
        walk.rejectedCandidates.push({ cellId: next.to, reason: failed });
        break;
      }
      commitStep(walk, next.to, icon, step.direction);
      icons.push(icon);
      current = next.to;
    }
    if (failed || walk.cellIds.length < ctx.minSize) {
      recordFailure(
        ctx,
        explainFromWalk(walk, ctx.ruleId, patternId, "failed", `Authored sequence from ${start} failed: ${failed ?? "too short"}.`),
      );
      continue;
    }
    const colorIconId = groupColor(icons, ctx.registry);
    if (!colorIconId) {
      continue;
    }
    hits.push(hitFromWalk(walk, colorIconId, patternId, "aligned", "line", ctx, true, start));
  }
  return hits;
}

export function createPatternRegistry(): PatternRegistry {
  const registry = new PatternRegistry();
  registry.register({
    definition: define("cluster", "cluster", { symmetry: "graph-defined", allowedTransformations: ["none"] }),
    detect: detectCluster,
  });
  registry.register({
    definition: define("straight", "authored-walk", { symmetry: "none", relativeRelationships: "same-authored-direction" }),
    detect: detectStraight,
  });
  registry.register({
    definition: define("L", "rays", { symmetry: "graph-defined", relativeRelationships: "two-authored-rays" }),
    detect: (ctx) => detectJunction(ctx, "L"),
  });
  registry.register({
    definition: define("T", "rays", { symmetry: "graph-defined", relativeRelationships: "three-authored-rays" }),
    detect: (ctx) => detectJunction(ctx, "T"),
  });
  registry.register({
    definition: define("cross", "rays", { symmetry: "graph-defined", relativeRelationships: "four-or-more-authored-rays" }),
    detect: (ctx) => detectJunction(ctx, "cross"),
  });
  registry.register({
    definition: define("ring", "cycle", { symmetry: "graph-defined", maxCells: 12 }),
    detect: detectCycle,
  });
  registry.register({
    definition: define("path", "path", { symmetry: "none", maxCells: 12 }),
    detect: detectPath,
  });
  registry.register({
    definition: define("directional-sequence", "authored-walk", {
      symmetry: "none",
      relativeRelationships: "explicit-direction-sequence",
    }),
    detect: (ctx) => detectSequence(ctx, [], "directional-sequence"),
  });
  registry.register({
    definition: define("authored", "authored-walk", { symmetry: "none", relativeRelationships: "registered-steps" }),
    detect: (ctx) => detectSequence(ctx, [], "authored"),
  });
  if (registry.list().length !== PATTERN_IDS.length) {
    throw new Error("Pattern catalog drifted from PATTERN_IDS.");
  }
  return registry;
}

export function detectWithPattern(
  handler: PatternHandler,
  ctx: PatternSearchContext,
  steps?: Array<{ direction: string }>,
): PatternHit[] {
  if ((handler.definition.id === "directional-sequence" || handler.definition.id === "authored") && steps?.length) {
    return detectSequence(ctx, steps, handler.definition.id);
  }
  return handler.detect(ctx);
}
