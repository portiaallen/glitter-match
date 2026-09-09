import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import { getCell, neighbors } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { groupColor, iconsCompatible, isGlitter } from "./compatibility.js";
import type { MatchGroup, MatchRules } from "./types.js";

function iconAt(board: Board, id: CellId): string | null {
  const cell = getCell(board, id);
  if (!cell.flags.active || cell.flags.hidden) {
    return null;
  }
  if (cell.occupant.type !== "icon") {
    return null;
  }
  return cell.occupant.iconId;
}

function canParticipate(board: Board, id: CellId): boolean {
  const cell = getCell(board, id);
  return cell.obstacles.every((obstacle) => obstacle.type !== "void");
}

export function detectMatches(board: Board, rules: MatchRules, registry: IconRegistry): MatchGroup[] {
  const groups: MatchGroup[] = [];
  if (rules.modes.includes("cluster")) {
    groups.push(...detectClusters(board, rules, registry));
  }
  if (rules.modes.includes("aligned")) {
    groups.push(...detectAligned(board, rules, registry));
  }
  if (rules.modes.includes("corner") || rules.modes.includes("tee") || rules.modes.includes("cross")) {
    groups.push(...detectJunctionPatterns(board, rules, registry));
  }
  return dedupeGroups(groups);
}

/**
 * Per ordinary/dev color, treat glitter as wild and find connected components.
 * Pure-glitter components are ignored — extra Glitter behavior is out of scope.
 */
function detectClusters(board: Board, rules: MatchRules, registry: IconRegistry): MatchGroup[] {
  const colors = new Set<string>();
  for (const id of board.topology.cellIds) {
    const icon = iconAt(board, id);
    if (!icon || isGlitter(icon)) {
      continue;
    }
    const kind = registry.get(icon).kind;
    if (kind === "ordinary" || kind === "dev") {
      colors.add(icon);
    }
  }

  const groups: MatchGroup[] = [];
  for (const color of [...colors].sort()) {
    const eligible = new Set<CellId>();
    for (const id of board.topology.cellIds) {
      const icon = iconAt(board, id);
      if (!icon || !canParticipate(board, id)) {
        continue;
      }
      if (icon === color || isGlitter(icon)) {
        eligible.add(id);
      }
    }

    const seen = new Set<CellId>();
    for (const start of [...eligible].sort()) {
      if (seen.has(start)) {
        continue;
      }
      const stack = [start];
      const component: CellId[] = [];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (seen.has(current) || !eligible.has(current)) {
          continue;
        }
        seen.add(current);
        component.push(current);
        for (const next of neighbors(board, current)) {
          if (!seen.has(next) && eligible.has(next)) {
            stack.push(next);
          }
        }
      }
      const colorIconId = groupColor(
        component.map((id) => iconAt(board, id)!),
        registry,
      );
      if (component.length >= rules.minGroupSize && colorIconId === color) {
        groups.push({
          cellIds: component.sort(),
          colorIconId: color,
          mode: "cluster",
        });
      }
    }
  }
  return groups;
}

function detectAligned(board: Board, rules: MatchRules, registry: IconRegistry): MatchGroup[] {
  const groups: MatchGroup[] = [];
  const seen = new Set<string>();

  for (const from of board.topology.cellIds) {
    const startIcon = iconAt(board, from);
    if (!startIcon) {
      continue;
    }
    const outgoing = board.topology.directed[from] ?? [];
    for (const edge of outgoing) {
      if (!edge.direction || !edge.allowsMatch || (edge.kind === "portal" && !board.topology.portalsConductMatches)) {
        continue;
      }
      const walk = walkDirection(board, from, edge.direction, registry);
      if (walk.cellIds.length < rules.minGroupSize || !walk.colorIconId) {
        continue;
      }
      const key = `${walk.colorIconId}:${walk.cellIds.slice().sort().join(",")}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      groups.push({
        cellIds: walk.cellIds,
        colorIconId: walk.colorIconId,
        mode: "aligned",
        pattern: "line",
      });
    }
  }
  return groups;
}

function walkDirection(
  board: Board,
  start: CellId,
  direction: string,
  registry: IconRegistry,
): { cellIds: CellId[]; colorIconId: string | null } {
  const cellIds = [start];
  const visited = new Set<CellId>([start]);
  let current = start;
  const icons = [iconAt(board, start)!];

  while (true) {
    const next = (board.topology.directed[current] ?? []).find(
      (edge) => edge.direction === direction && edge.allowsMatch,
    );
    if (!next || visited.has(next.to)) {
      break;
    }
    const nextIcon = iconAt(board, next.to);
    if (!nextIcon) {
      break;
    }
    const prototype = groupColor(icons, registry) ?? nextIcon;
    if (!iconsCompatible(prototype, nextIcon, registry) && !isGlitter(nextIcon) && !isGlitter(prototype)) {
      break;
    }
    if (!isGlitter(nextIcon) && !isGlitter(prototype) && prototype !== nextIcon) {
      break;
    }
    if (!isGlitter(nextIcon) && groupColor(icons, registry) && nextIcon !== groupColor(icons, registry)) {
      break;
    }
    cellIds.push(next.to);
    icons.push(nextIcon);
    visited.add(next.to);
    current = next.to;
  }

  return { cellIds, colorIconId: groupColor(icons, registry) };
}

function detectJunctionPatterns(board: Board, rules: MatchRules, registry: IconRegistry): MatchGroup[] {
  const groups: MatchGroup[] = [];
  for (const pivot of board.topology.cellIds) {
    const startIcon = iconAt(board, pivot);
    if (!startIcon) {
      continue;
    }
    const rays: CellId[][] = [];
    const directions = new Set(
      (board.topology.directed[pivot] ?? [])
        .filter((edge) => edge.allowsMatch)
        .map((edge) => edge.direction)
        .filter((direction): direction is string => Boolean(direction)),
    );
    for (const direction of directions) {
      const walk = walkDirection(board, pivot, direction, registry);
      if (walk.cellIds.length >= 2 && walk.colorIconId) {
        rays.push(walk.cellIds);
      }
    }
    if (rays.length < 2) {
      continue;
    }
    const cellIds = [...new Set(rays.flat())].sort();
    if (cellIds.length < rules.minGroupSize) {
      continue;
    }
    const colorIconId = groupColor(
      cellIds.map((id) => iconAt(board, id)!),
      registry,
    );
    if (!colorIconId) {
      continue;
    }
    const rayCount = rays.length;
    const pattern = rayCount >= 4 ? "cross" : rayCount === 3 ? "tee" : "corner";
    const mode = pattern === "cross" ? "cross" : pattern === "tee" ? "tee" : "corner";
    if (!rules.modes.includes(mode)) {
      continue;
    }
    groups.push({ cellIds, colorIconId, mode, pattern });
  }
  return groups;
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

export function matchedCellIds(groups: MatchGroup[]): CellId[] {
  return [...new Set(groups.flatMap((group) => group.cellIds))].sort();
}
