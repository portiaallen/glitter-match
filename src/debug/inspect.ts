import { getCell, type Board } from "../board/index.js";
import { detectMatches, type MatchRules } from "../matching/index.js";
import { isDeadBoard, listValidMoves } from "../fairness/index.js";
import type { LevelDefinition } from "../levels/index.js";
import type { IconRegistry } from "../icons/index.js";
import type { ObstacleRegistry } from "../obstacles/index.js";

export interface BoardInspection {
  topologyKind: string;
  topologyNotes?: string;
  connectivity?: "required" | "optional";
  cellIds: string[];
  positions: Record<string, { x: number; y: number; z?: number }>;
  adjacency: Record<string, string[]>;
  directed: Record<string, Array<{ to: string; direction?: string; kind: string }>>;
  flow: Record<string, string[]>;
  portals: Board["topology"]["portals"];
  sections: Board["topology"]["sections"];
  icons: Record<string, string | null>;
  flags: Record<string, Board["cells"][string]["flags"]>;
  obstacles: Record<string, Board["cells"][string]["obstacles"]>;
  terrain: Record<string, string | undefined>;
  matches: ReturnType<typeof detectMatches>;
  validMoves: ReturnType<typeof listValidMoves>;
  deadBoard: boolean;
}

export function inspectPlayableBoard(
  board: Board,
  matchRules: MatchRules,
  icons: IconRegistry,
  obstacles: ObstacleRegistry,
): BoardInspection {
  const iconsState: BoardInspection["icons"] = {};
  const flags: BoardInspection["flags"] = {};
  const obstacleState: BoardInspection["obstacles"] = {};
  const positions: BoardInspection["positions"] = {};
  const terrain: BoardInspection["terrain"] = {};

  for (const id of board.topology.cellIds) {
    const cell = getCell(board, id);
    iconsState[id] = cell.occupant.type === "icon" ? cell.occupant.iconId : null;
    flags[id] = { ...cell.flags };
    obstacleState[id] = cell.obstacles.map((item) => ({ ...item }));
    positions[id] = { ...board.topology.cells[id]!.position };
    terrain[id] = board.topology.cells[id]?.terrain;
  }

  return {
    topologyKind: board.topology.topology.kind,
    topologyNotes: board.topology.topology.notes,
    connectivity: board.topology.topology.connectivity,
    cellIds: [...board.topology.cellIds],
    positions,
    adjacency: { ...board.topology.adjacency },
    directed: { ...board.topology.directed },
    flow: { ...board.topology.flowDown },
    portals: board.topology.portals,
    sections: board.topology.sections,
    icons: iconsState,
    flags,
    obstacles: obstacleState,
    terrain,
    matches: detectMatches(board, matchRules, icons),
    validMoves: listValidMoves(board, matchRules, icons, obstacles),
    deadBoard: isDeadBoard(board, matchRules, icons, obstacles),
  };
}

/** @deprecated Prefer inspectPlayableBoard — kept so existing level debug calls compile. */
export function inspectBoard(
  board: Board,
  level: LevelDefinition,
  icons: IconRegistry,
  obstacles: ObstacleRegistry,
): BoardInspection {
  return inspectPlayableBoard(board, level.matchRules, icons, obstacles);
}

export function toDot(inspection: BoardInspection): string {
  const lines = ["graph glitter_match {", '  graph [label="Glitter Match board graph"];'];
  for (const id of inspection.cellIds) {
    const icon = inspection.icons[id] ?? "empty";
    const pos = inspection.positions[id]!;
    lines.push(`  "${id}" [label="${id}\\n${icon}\\n(${pos.x},${pos.y})"];`);
  }
  const seen = new Set<string>();
  for (const [from, tos] of Object.entries(inspection.adjacency)) {
    for (const to of tos) {
      const key = [from, to].sort().join("::");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const kind = inspection.directed[from]?.find((edge) => edge.to === to)?.kind ?? "adjacent";
      const attr = kind === "portal" ? " [style=dashed,color=purple]" : kind === "bridge" ? " [color=gold,penwidth=2]" : "";
      lines.push(`  "${from}" -- "${to}"${attr};`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

export function formatInspection(inspection: BoardInspection): string {
  const rows = [
    `topology: ${inspection.topologyKind}${inspection.topologyNotes ? ` (${inspection.topologyNotes})` : ""}`,
    `cells: ${inspection.cellIds.join(", ")}`,
    "adjacency:",
    ...inspection.cellIds.map((id) => `  ${id} -> ${(inspection.adjacency[id] ?? []).join(", ") || "(none)"}`),
    "icons:",
    ...inspection.cellIds.map((id) => `  ${id}: ${inspection.icons[id] ?? "empty"}`),
    `matches: ${inspection.matches.length}`,
    ...inspection.matches.map(
      (group) => `  ${group.mode} ${group.colorIconId} [${group.cellIds.join(", ")}]`,
    ),
    `valid moves: ${inspection.validMoves.length}`,
    ...inspection.validMoves.map((move) => `  ${move.a} <-> ${move.b}`),
    `dead board: ${inspection.deadBoard}`,
  ];
  return rows.join("\n");
}
