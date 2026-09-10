import type { CellId, IconId } from "../ids.js";
import type { Board } from "../board/index.js";
import { getCell, neighbors } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { groupColor, iconsCompatible, isGlitter } from "./compatibility.js";

export const ALLOWED_CELL_STATES = [
  "active",
  "inactive",
  "hidden",
  "visible",
  "void-blocked",
  "not-void",
  "frozen",
  "unfrozen",
  "protected",
  "unprotected",
] as const;
export type AllowedCellState = (typeof ALLOWED_CELL_STATES)[number];

export const ALLOWED_OCCUPANT_STATES = ["icon", "empty", "special-match"] as const;
export type AllowedOccupantState = (typeof ALLOWED_OCCUPANT_STATES)[number];

export const DEFAULT_ALLOWED_CELL_STATES: readonly AllowedCellState[] = ["active", "visible", "not-void"];
export const DEFAULT_ALLOWED_OCCUPANT_STATES: readonly AllowedOccupantState[] = ["icon"];

export function iconAt(board: Board, id: CellId): IconId | null {
  const cell = getCell(board, id);
  if (!cell.flags.active || cell.flags.hidden) {
    return null;
  }
  if (cell.occupant.type !== "icon") {
    return null;
  }
  return cell.occupant.iconId;
}

export function occupantIconIgnoringVisibility(board: Board, id: CellId): IconId | null {
  const cell = getCell(board, id);
  return cell.occupant.type === "icon" ? cell.occupant.iconId : null;
}

export function matchableIcon(
  board: Board,
  id: CellId,
  allowedCellStates: readonly string[] = DEFAULT_ALLOWED_CELL_STATES,
  allowedOccupantStates: readonly string[] = DEFAULT_ALLOWED_OCCUPANT_STATES,
): IconId | null {
  if (!canParticipate(board, id, allowedCellStates, allowedOccupantStates)) {
    return null;
  }
  if (allowedCellStates.includes("hidden") && getCell(board, id).flags.hidden) {
    return occupantIconIgnoringVisibility(board, id);
  }
  return iconAt(board, id);
}

export function canParticipate(
  board: Board,
  id: CellId,
  allowedCellStates: readonly string[] = DEFAULT_ALLOWED_CELL_STATES,
  allowedOccupantStates: readonly string[] = DEFAULT_ALLOWED_OCCUPANT_STATES,
): boolean {
  const cell = getCell(board, id);
  const cellOk =
    stateAllows(allowedCellStates, "active", "inactive", cell.flags.active) &&
    stateAllows(allowedCellStates, "visible", "hidden", !cell.flags.hidden) &&
    stateAllows(allowedCellStates, "unfrozen", "frozen", !cell.flags.frozen) &&
    stateAllows(allowedCellStates, "unprotected", "protected", !cell.flags.protected) &&
    voidAllows(cell.obstacles.some((obstacle) => obstacle.type === "void"), allowedCellStates);
  if (!cellOk) {
    return false;
  }
  if (allowedOccupantStates.includes("icon") && cell.occupant.type === "icon") {
    return true;
  }
  if (allowedOccupantStates.includes("empty") && cell.occupant.type === "empty") {
    return true;
  }
  if (allowedOccupantStates.includes("special-match") && cell.occupant.type === "special-match") {
    return true;
  }
  return false;
}

function stateAllows(
  allowed: readonly string[],
  positive: string,
  negative: string,
  isPositive: boolean,
): boolean {
  const mentionsPositive = allowed.includes(positive);
  const mentionsNegative = allowed.includes(negative);
  if (!mentionsPositive && !mentionsNegative) {
    return true;
  }
  return isPositive ? mentionsPositive : mentionsNegative;
}

function voidAllows(isVoid: boolean, allowed: readonly string[]): boolean {
  const mentionsVoid = allowed.includes("void-blocked");
  const mentionsNotVoid = allowed.includes("not-void");
  if (!mentionsVoid && !mentionsNotVoid) {
    return true;
  }
  return isVoid ? mentionsVoid : mentionsNotVoid;
}

/**
 * Whether `nextIcon` may join an in-progress compatible sequence.
 * Uses the existing icon/match contract. Never uses coordinates.
 */
export function canJoinIconSequence(icons: IconId[], nextIcon: IconId, registry: IconRegistry): boolean {
  const color = groupColor(icons, registry);
  if (!color) {
    return isGlitter(nextIcon) || iconsCompatible(nextIcon, nextIcon, registry);
  }
  return iconsCompatible(color, nextIcon, registry);
}

export function matchNeighbors(
  board: Board,
  id: CellId,
  allowedDirections?: readonly string[],
): Array<{ to: CellId; direction?: string }> {
  const directed = board.topology.directed[id] ?? [];
  const result: Array<{ to: CellId; direction?: string }> = [];
  for (const edge of directed) {
    if (!edge.allowsMatch) {
      continue;
    }
    if (edge.kind === "portal" && !board.topology.portalsConductMatches) {
      continue;
    }
    if (allowedDirections && edge.direction && !allowedDirections.includes(edge.direction)) {
      continue;
    }
    if (allowedDirections && !edge.direction) {
      continue;
    }
    result.push({ to: edge.to, direction: edge.direction });
  }
  return result.sort((a, b) => a.to.localeCompare(b.to) || (a.direction ?? "").localeCompare(b.direction ?? ""));
}

export function connectivityNeighbors(board: Board, id: CellId): CellId[] {
  return [...neighbors(board, id)].sort();
}
