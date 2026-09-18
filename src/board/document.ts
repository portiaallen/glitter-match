import { z } from "zod";
import { DEFAULT_MATCH_MODES } from "../matching/types.js";
import { OBJECTIVE_TYPES, type ObjectiveDefinition } from "../objectives/model.js";
import { throwIfErrors } from "../validation.js";
import {
  cellSchema,
  chamberSchema,
  edgeSchema,
  flowSchema,
  matchRulesSchema,
  movementSchema,
  portalSchema,
  sectionSchema,
  topologySchema,
} from "./schema.js";
import { validateBoardDefinition } from "./validate.js";
import type { BoardDefinition, EdgeDefinition, PortalDefinition } from "./types.js";
import type { MatchRules } from "../matching/types.js";

const objectivePreviewSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.enum(OBJECTIVE_TYPES),
      iconId: z.string().optional(),
      count: z.number().int().positive().optional(),
      score: z.number().int().nonnegative().optional(),
      combo: z.number().int().positive().optional(),
      moves: z.number().int().nonnegative().optional(),
      cascades: z.number().int().positive().optional(),
      startCellId: z.string().optional(),
      endCellId: z.string().optional(),
      cellIds: z.array(z.string()).optional(),
      iconByCell: z.record(z.string()).optional(),
      stages: z.array(objectivePreviewSchema).optional(),
      children: z.array(objectivePreviewSchema).optional(),
      mode: z.enum(["all", "any"]).optional(),
      composition: z.enum(["and", "or", "sequence", "not"]).optional(),
      version: z.string().optional(),
      role: z.enum(["required", "optional", "mastery"]).optional(),
      dependsOn: z.array(z.string().min(1)).optional(),
      accessibilityLabel: z.string().optional(),
      countUnit: z.string().optional(),
      targetKind: z.enum(["icon", "cell", "artifact", "state", "event"]).optional(),
      countPlayerMatches: z.boolean().optional(),
      countCascades: z.boolean().optional(),
      countSpecialMatches: z.boolean().optional(),
      countObstacles: z.boolean().optional(),
      maxCount: z.number().int().positive().optional(),
      pathMode: z.enum(["cleared-endpoints", "graph"]).optional(),
      minPathLength: z.number().int().positive().optional(),
      patternId: z.string().optional(),
      comboEvents: z.array(z.string().min(1)).optional(),
      forbiddenEvents: z.array(z.string().min(1)).optional(),
      surviveMoves: z.number().int().positive().optional(),
    })
    .strict(),
);

/**
 * Designer-facing board document. This is not a level: no Land, no campaign
 * number, no rewards, no story. `shape` is an optional human label the engine
 * never reads — new shapes do not require engine changes.
 */
export const boardDocumentSchema = z
  .object({
    id: z.string().min(1),
    status: z.literal("development"),
    purpose: z.literal("engine-fixture"),
    title: z.string().min(1),
    shape: z.string().optional(),
    notes: z.string().optional(),
    topology: topologySchema,
    cells: z.array(cellSchema).min(1),
    connections: z.array(edgeSchema).optional(),
    adjacency: z.array(edgeSchema).optional(),
    flow: z.array(flowSchema).optional(),
    portals: z.array(portalSchema).optional(),
    sections: z.array(sectionSchema).optional(),
    chambers: z.array(chamberSchema).optional(),
    movement: movementSchema.optional(),
    portalsConductMatches: z.boolean().optional(),
    portalsAllowSwap: z.boolean().optional(),
    iconPool: z.array(z.string().min(1)).optional(),
    matchRules: matchRulesSchema.optional(),
    placement: z
      .object({
        mode: z.enum(["authored", "seeded-random"]),
        seedSalt: z.string().optional(),
        avoidInitialMatches: z.boolean().optional(),
      })
      .strict()
      .optional(),
    demoObjective: objectivePreviewSchema.optional(),
    winState: z
      .object({
        completionPolicy: z.enum(["ALL_REQUIRED_OBJECTIVES", "ANY_REQUIRED_OBJECTIVE", "SEQUENCE_COMPLETE", "CUSTOM_REGISTERED_POLICY"]).optional(),
        failurePolicy: z.enum(["NONE", "ANY_FAILURE", "ALL_FAILURES", "MOVE_LIMIT", "REGISTERED_FAILURE_CONDITION"]).optional(),
        conflictPolicy: z.enum(["completion-first", "failure-first"]).optional(),
      })
      .strict()
      .optional(),
    fairness: z
      .object({
        onDeadBoard: z.enum(["shuffle", "fail"]),
        maxShuffleAttempts: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((document, ctx) => {
    if (!document.connections && !document.adjacency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide connections (preferred) or adjacency. The graph cannot be implied from coordinates.",
        path: ["connections"],
      });
    }
  });

export type BoardDocument = z.infer<typeof boardDocumentSchema>;

export function parseBoardDocument(input: unknown): BoardDocument {
  return boardDocumentSchema.parse(input);
}

export function defaultLabMatchRules(): MatchRules {
  return { minGroupSize: 3, modes: [...DEFAULT_MATCH_MODES] };
}

export function compileBoardDocument(document: BoardDocument): BoardDefinition {
  const authored = document.connections ?? document.adjacency ?? [];
  const portals = document.portals ?? [];
  const adjacency = mergePortalEdges(authored, portals, document.portalsConductMatches, document.portalsAllowSwap);

  const sections =
    document.sections ??
    (document.chambers ?? []).map((chamber) => ({
      id: chamber.id,
      cellIds: chamber.cellIds,
      chamber: chamber.id,
    }));

  const definition: BoardDefinition = {
    topology: {
      ...document.topology,
      chambers: document.topology.chambers ?? document.chambers?.map((chamber) => chamber.id),
    },
    cells: document.cells,
    adjacency,
    flow: document.flow,
    portals,
    sections,
    movement: document.movement,
    portalsConductMatches: document.portalsConductMatches,
    portalsAllowSwap: document.portalsAllowSwap,
  };

  const issues = validateBoardDefinition(definition);
  throwIfErrors(issues, "BoardValidationError");
  return definition;
}

function mergePortalEdges(
  edges: EdgeDefinition[],
  portals: PortalDefinition[],
  defaultConduct?: boolean,
  defaultSwap?: boolean,
): EdgeDefinition[] {
  const existing = new Set(
    edges.map((edge) => `${edge.from}->${edge.to}:${edge.kind ?? "adjacent"}`),
  );
  const merged = [...edges];
  for (const portal of portals) {
    const kind = "portal" as const;
    if (!existing.has(`${portal.from}->${portal.to}:${kind}`)) {
      merged.push({
        from: portal.from,
        to: portal.to,
        kind,
        bidirectional: portal.bidirectional ?? true,
      });
    }
    void defaultConduct;
    void defaultSwap;
  }
  return merged;
}

export function loadAndCompileBoardDocument(input: unknown): { document: BoardDocument; definition: BoardDefinition } {
  const document = parseBoardDocument(input);
  return { document, definition: compileBoardDocument(document) };
}
