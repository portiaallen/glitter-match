import { createBoard, getCell, type Board, type BoardDefinition } from "../board/index.js";
import { occupantsFromSerialized, serializeBoardState } from "../board/serialize.js";
import { encodeOccupant } from "../board/occupants.js";
import { runCascade, type CascadeReport } from "../cascade/index.js";
import { canAttemptSwap, swapOccupants } from "../fairness/index.js";
import type { MatchRules } from "../matching/index.js";
import { detectMatches } from "../matching/index.js";
import { createEmptyStats, type GameStats } from "../objectives/index.js";
import type { EngineRegistries } from "../state/session.js";
import { createRandomSource, type RandomSnapshot, type RandomSource } from "../random/index.js";
import { rotateSection } from "../board/rotation.js";
import { createSpecialMatchRuntime } from "../special-matches/runtime.js";

export type ReplayEvent =
  | { kind: "player-move"; a: string; b: string }
  | { kind: "match-detection"; combo: number; groupCount: number; cellIds: string[] }
  | { kind: "cascade"; combo: number; clearedCellIds: string[] }
  | { kind: "board-movement"; moves: Array<{ from: string; to: string; iconId: string }> }
  | { kind: "rng-decision"; purpose: string; snapshot: RandomSnapshot }
  | { kind: "rotation"; sectionId: string; steps: number; visualAngle: number }
  | { kind: "objective"; complete: boolean; label?: string }
  | { kind: "special-match"; instanceIds: string[]; created: string[]; termination: string };

export interface ReplayTape {
  version: 1;
  seed: string;
  definition: BoardDefinition;
  initialOccupants: Record<string, string | null>;
  events: ReplayEvent[];
}

export interface ReplayResult {
  board: Board;
  stats: GameStats;
  cascade: CascadeReport | null;
  tape: ReplayTape;
}

export function createEmptyTape(
  seed: string,
  definition: BoardDefinition,
  board: Board,
): ReplayTape {
  const occupants = serializeBoardState(definition, board).occupants;
  return {
    version: 1,
    seed,
    definition,
    initialOccupants: occupants,
    events: [],
  };
}

export function serializeReplayTape(tape: ReplayTape): string {
  return `${JSON.stringify(tape, null, 2)}\n`;
}

export function deserializeReplayTape(input: string | unknown): ReplayTape {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (!raw || raw.version !== 1 || typeof raw.seed !== "string" || !raw.definition || !raw.events) {
    throw new Error("Replay tape is malformed.");
  }
  return raw as ReplayTape;
}

export function appendReplayEvent(tape: ReplayTape, event: ReplayEvent): ReplayTape {
  return { ...tape, events: [...tape.events, event] };
}

export function playerMovesFromTape(tape: ReplayTape): Array<{ a: string; b: string }> {
  return tape.events.filter((event): event is Extract<ReplayEvent, { kind: "player-move" }> => event.kind === "player-move");
}

/**
 * Re-run seed + initial occupants + player moves through the engine.
 * Recorded cascade/RNG events are debug annotations; logic is recomputed.
 */
export function replayTape(
  tape: ReplayTape,
  options: {
    registries: EngineRegistries;
    matchRules: MatchRules;
    iconPool: string[];
    random?: RandomSource;
  },
): ReplayResult {
  const random = options.random ?? createRandomSource(tape.seed);
  const board = createBoard(tape.definition, occupantsFromSerialized({
    definition: tape.definition,
    occupants: tape.initialOccupants,
  }));
  const stats = createEmptyStats();
  const specialRuntime = createSpecialMatchRuntime();
  let lastCascade: CascadeReport | null = null;
  const events: ReplayEvent[] = [];

  for (const event of tape.events) {
    if (event.kind === "player-move") {
      if (!canAttemptSwap(board, event.a, event.b, options.registries.obstacles)) {
        throw new Error(`Replay move "${event.a}" ↔ "${event.b}" is illegal on the reconstructed board.`);
      }
      events.push(event);
      events.push({ kind: "rng-decision", purpose: "pre-swap", snapshot: random.snapshot() });
      swapOccupants(board, event.a, event.b);
      specialRuntime.moveIndex += 1;
      const matches = detectMatches(board, options.matchRules, options.registries.icons);
      events.push({
        kind: "match-detection",
        combo: (lastCascade?.combo ?? 0) + 1,
        groupCount: matches.length,
        cellIds: [...new Set(matches.flatMap((group) => group.cellIds))].sort(),
      });
      lastCascade = runCascade({
        board,
        matchRules: options.matchRules,
        iconRegistry: options.registries.icons,
        obstacleRegistry: options.registries.obstacles,
        iconPool: options.iconPool,
        random,
        stats,
        scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
        specialRuntime,
      });
      events.push({
        kind: "cascade",
        combo: lastCascade.combo,
        clearedCellIds: lastCascade.steps.flatMap((step) => step.clearedCellIds),
      });
      events.push({
        kind: "special-match",
        instanceIds: lastCascade.specialMatchesCreated,
        created: lastCascade.specialMatchesCreated,
        termination: lastCascade.termination,
      });
      const moved = lastCascade.steps.flatMap((step) => step.moved);
      if (moved.length > 0) {
        events.push({ kind: "board-movement", moves: moved });
      }
    } else if (event.kind === "rotation") {
      const result = rotateSection(board, event.sectionId, event.steps);
      events.push({
        kind: "rotation",
        sectionId: result.sectionId,
        steps: event.steps,
        visualAngle: result.visualAngle,
      });
    }
  }

  return {
    board,
    stats,
    cascade: lastCascade,
    tape: { ...tape, events },
  };
}

export function occupantSnapshot(board: Board): Record<string, string | null> {
  const occupants: Record<string, string | null> = {};
  for (const id of board.topology.cellIds) {
    const occupant = getCell(board, id).occupant;
    occupants[id] = encodeOccupant(occupant);
  }
  return occupants;
}
