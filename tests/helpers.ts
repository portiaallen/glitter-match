import { createBoard, type BoardDefinition, type Occupant } from "../src/board/index.js";
import { createDevelopmentPack } from "../src/content/index.js";
import { defaultMatchRules, type MatchRules } from "../src/matching/index.js";

export function pack() {
  return createDevelopmentPack();
}

export function occupants(map: Record<string, string | null>): Record<string, Occupant> {
  const result: Record<string, Occupant> = {};
  for (const [id, iconId] of Object.entries(map)) {
    result[id] = iconId ? { type: "icon", iconId } : { type: "empty" };
  }
  return result;
}

export function lineBoard(icons: Array<string | null>): ReturnType<typeof createBoard> {
  const cells = icons.map((_, index) => ({
    id: `c${index}`,
    position: { x: index, y: 0 },
  }));
  const adjacency = cells.slice(0, -1).map((cell, index) => ({
    from: cell.id,
    to: `c${index + 1}`,
    direction: "e" as const,
  }));
  const definition: BoardDefinition = {
    topology: { kind: "linear", notes: "test line" },
    cells,
    adjacency,
  };
  const occ: Record<string, Occupant> = {};
  icons.forEach((icon, index) => {
    occ[`c${index}`] = icon ? { type: "icon", iconId: icon } : { type: "empty" };
  });
  return createBoard(definition, occ);
}

export const matchRules: MatchRules = defaultMatchRules();
