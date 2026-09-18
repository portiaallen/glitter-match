import { compileBoardDocument, type BoardDocument } from "../board/document.js";
import type { LandId } from "../ids.js";
import type { LevelDefinition } from "../levels/schema.js";
import type { ObjectiveDefinition } from "../objectives/index.js";

/**
 * Wrap a Board Laboratory document as a development LevelDefinition so the
 * Level Runtime can be exercised in the lab. This does not convert fixtures
 * into production levels or campaign content.
 *
 * `land` is a Land Registry handle required by the existing level schema.
 * It is not a Land assignment and does not author Lumina (or any) campaign content.
 */
export function developmentLevelFromBoardDocument(
  document: BoardDocument,
  land: LandId = "lumina",
): LevelDefinition {
  const definition = compileBoardDocument(document);
  const objective = (document.demoObjective ?? {
    id: `${document.id}.watch`,
    type: "score",
    score: 1_000_000,
    accessibilityLabel: "Lab watch objective — not campaign content.",
  }) as ObjectiveDefinition;
  return {
    id: document.id,
    status: "development",
    purpose: "engine-fixture",
    land,
    title: document.title,
    board: {
      topology: definition.topology,
      cells: definition.cells,
      adjacency: definition.adjacency,
      flow: definition.flow,
      portals: definition.portals,
      sections: definition.sections,
      movement: definition.movement,
      portalsConductMatches: definition.portalsConductMatches,
      portalsAllowSwap: definition.portalsAllowSwap,
    },
    iconPool: document.iconPool ?? ["dev.spark-a", "dev.spark-b", "dev.spark-c"],
    matchRules: document.matchRules ?? { minGroupSize: 3, modes: ["cluster"] },
    objective,
    winState: document.winState,
    moveLimit: null,
    timerMs: null,
    placement: document.placement ?? { mode: "authored" },
    swap: { requireMatch: true },
    fairness: document.fairness,
    specialIconsAllowed: false,
  };
}
