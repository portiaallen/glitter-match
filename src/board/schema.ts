import { z } from "zod";
import { TOPOLOGY_KINDS } from "./topology.js";
import { MATCH_MODES } from "../matching/types.js";

export const positionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional(),
  })
  .strict();

export const obstaclePlacementSchema = z
  .object({
    type: z.string().min(1),
    durability: z.number().int().positive().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .strict();

export const cellSchema = z
  .object({
    id: z.string().min(1),
    position: positionSchema,
    active: z.boolean().optional(),
    terrain: z.string().optional(),
    hidden: z.boolean().optional(),
    protected: z.boolean().optional(),
    frozen: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    sectionId: z.string().optional(),
    initialIcon: z.string().optional(),
    initialObstacles: z.array(obstaclePlacementSchema).optional(),
  })
  .strict();

export const edgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    direction: z.string().min(1).optional(),
    orientation: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    bidirectional: z.boolean().optional(),
    traversal: z.enum(["both", "forward"]).optional(),
    kind: z.enum(["adjacent", "portal", "bridge"]).optional(),
    allowsMatch: z.boolean().optional(),
    allowsSwap: z.boolean().optional(),
  })
  .strict();

export const flowSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(["gravity", "portal", "branch", "teleport"]).optional(),
    label: z.string().min(1).optional(),
  })
  .strict();

export const portalSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    bidirectional: z.boolean().optional(),
    conductsMatches: z.boolean().optional(),
    allowsSwap: z.boolean().optional(),
  })
  .strict();

export const rotationSchema = z
  .object({
    incrementDegrees: z.number(),
    rotatable: z.boolean(),
    occupantCycles: z.array(z.array(z.string().min(1)).min(2)).optional(),
    cyclePresentationPositions: z.boolean().optional(),
    remapDirections: z.boolean().optional(),
    directionMap: z.record(z.string().min(1)).optional(),
  })
  .strict();

export const sectionSchema = z
  .object({
    id: z.string().min(1),
    cellIds: z.array(z.string().min(1)).min(1),
    rotation: rotationSchema.optional(),
    chamber: z.string().optional(),
    layer: z.string().optional(),
  })
  .strict();

export const topologySchema = z
  .object({
    kind: z.enum(TOPOLOGY_KINDS),
    notes: z.string().optional(),
    chambers: z.array(z.string()).optional(),
    layers: z.array(z.string()).optional(),
    connectivity: z.enum(["required", "optional"]).optional(),
  })
  .strict();

export const movementSchema = z
  .object({
    mode: z.enum(["none", "along-flow"]),
    refill: z
      .object({
        mode: z.enum(["none", "spawn-at-sources"]),
        sourceCellIds: z.array(z.string()).optional(),
        avoidImmediateMatches: z.boolean().optional(),
        maxAvoidAttempts: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

export const matchRulesSchema = z
  .object({
    minGroupSize: z.number().int().min(2),
    modes: z.array(z.enum(MATCH_MODES)).min(1),
  })
  .strict();

export const chamberSchema = z
  .object({
    id: z.string().min(1),
    cellIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const boardDefinitionSchema = z
  .object({
    topology: topologySchema,
    cells: z.array(cellSchema).min(1),
    adjacency: z.array(edgeSchema),
    flow: z.array(flowSchema).optional(),
    portals: z.array(portalSchema).optional(),
    sections: z.array(sectionSchema).optional(),
    movement: movementSchema.optional(),
    portalsConductMatches: z.boolean().optional(),
    portalsAllowSwap: z.boolean().optional(),
  })
  .strict();
