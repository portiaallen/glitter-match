export const TOPOLOGY_KINDS = [
  "linear",
  "branching",
  "circular",
  "radial",
  "hub-and-spoke",
  "maze",
  "twin-path",
  "multi-chamber",
  "bottleneck",
  "bridge",
  "portal-connected",
  "layered",
  "rotating",
  "custom",
] as const;

export type TopologyKind = (typeof TOPOLOGY_KINDS)[number];

/**
 * Topology is authoring language, not a second engine.
 * Matching, swapping, and cascading always use the explicit graph.
 */
export interface TopologyDescriptor {
  kind: TopologyKind;
  /** Free-form notes for authors and debug inspection. */
  notes?: string;
  chambers?: string[];
  layers?: string[];
}
