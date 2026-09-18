import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import { getCell } from "../board/index.js";
import type { MatchGroup } from "../matching/index.js";
import { issue, throwIfErrors } from "../validation.js";

export interface ObstacleContext {
  board: Board;
  cellId: CellId;
  matches: MatchGroup[];
}

export interface ObstacleHandler {
  type: string;
  implemented: boolean;
  accessibilityDescription: string;
  blocksSwap: (instance: { durability: number; config: Record<string, unknown> }, cellId: CellId) => boolean;
  blocksMatchParticipation?: (instance: { durability: number }, cellId: CellId) => boolean;
  blocksMovement?: (instance: { durability: number }, cellId: CellId) => boolean;
  onMatchesResolved: (instance: { type: string; durability: number; config: Record<string, unknown> }, ctx: ObstacleContext) => void;
  onCascade?: (instance: { type: string; durability: number; config: Record<string, unknown> }, ctx: ObstacleContext) => void;
  serialize?: (instance: { type: string; durability: number; config: Record<string, unknown> }) => Record<string, unknown>;
}

export class ObstacleRegistry {
  private readonly handlers = new Map<string, ObstacleHandler>();

  register(handler: ObstacleHandler): void {
    if (this.handlers.has(handler.type)) {
      throwIfErrors(
        [issue("obstacle.duplicate", `obstacles.${handler.type}`, `Obstacle type "${handler.type}" is already registered.`)],
        "Duplicate obstacle type",
      );
    }
    this.handlers.set(handler.type, handler);
  }

  get(type: string): ObstacleHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throwIfErrors(
        [issue("obstacle.unknown", `obstacles.${type}`, `Unknown obstacle type "${type}".`)],
        "Unknown obstacle type",
      );
      throw new Error("unreachable");
    }
    return handler;
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  list(): ObstacleHandler[] {
    return [...this.handlers.values()];
  }
}

const lockHandler: ObstacleHandler = {
  type: "lock",
  implemented: true,
  accessibilityDescription: "Lock. Adjacent matches reduce durability. Pattern: closed padlock.",
  blocksSwap: () => true,
  onMatchesResolved(instance, ctx) {
    const adjacentMatch = ctx.matches.some((group) =>
      group.cellIds.some((id) => (ctx.board.topology.adjacency[ctx.cellId] ?? []).includes(id)),
    );
    if (adjacentMatch) {
      instance.durability -= 1;
    }
  },
};

const iceHandler: ObstacleHandler = {
  type: "ice",
  implemented: true,
  accessibilityDescription: "Ice. A match on this cell reduces durability. Pattern: cracked sheet.",
  blocksSwap: () => true,
  onMatchesResolved(instance, ctx) {
    const selfMatch = ctx.matches.some((group) => group.cellIds.includes(ctx.cellId));
    if (selfMatch) {
      instance.durability -= 1;
    }
  },
};

function unimplemented(type: string): ObstacleHandler {
  return {
    type,
    implemented: false,
    accessibilityDescription: `Reserved obstacle "${type}". Not implemented.`,
    blocksSwap: () => false,
    onMatchesResolved: () => {
      throw new Error(`Obstacle "${type}" is not implemented.`);
    },
  };
}

export function createObstacleRegistry(): ObstacleRegistry {
  const registry = new ObstacleRegistry();
  registry.register(lockHandler);
  registry.register(iceHandler);
  for (const type of [
    "stone",
    "chains",
    "curtains",
    "mirrors",
    "crystal-barrier",
    "void",
    "portals",
    "protected-cell",
    "moving",
    "growing",
    "rotating",
    "hidden",
  ]) {
    registry.register(unimplemented(type));
  }
  return registry;
}

export function cellBlocksSwap(board: Board, cellId: CellId, registry: ObstacleRegistry): boolean {
  const cell = getCell(board, cellId);
  if (cell.flags.frozen) {
    return true;
  }
  return cell.obstacles.some((obstacle) => {
    const handler = registry.get(obstacle.type);
    return handler.blocksSwap(obstacle, cellId);
  });
}

export function applyObstacleMatchEffects(board: Board, matches: MatchGroup[], registry: ObstacleRegistry): void {
  for (const cellId of board.topology.cellIds) {
    const cell = getCell(board, cellId);
    for (const obstacle of cell.obstacles) {
      registry.get(obstacle.type).onMatchesResolved(obstacle, { board, cellId, matches });
    }
    cell.obstacles = cell.obstacles.filter((obstacle) => obstacle.durability > 0);
  }
}
