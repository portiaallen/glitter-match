import type { CellId, DirectionLabel, SectionId } from "../ids.js";
import type { TopologyDescriptor } from "./topology.js";

export type EdgeKind = "adjacent" | "portal" | "bridge";
export type EdgeTraversal = "both" | "forward";
export type FlowKind = "gravity" | "portal" | "branch" | "teleport";

export interface CellPosition {
  x: number;
  y: number;
  z?: number;
}

export interface CellFlags {
  active: boolean;
  hidden: boolean;
  protected: boolean;
  frozen: boolean;
}

export interface CellDefinition {
  id: CellId;
  position: CellPosition;
  active?: boolean;
  terrain?: string;
  hidden?: boolean;
  protected?: boolean;
  frozen?: boolean;
  tags?: string[];
  sectionId?: SectionId;
  /** Authored occupant; omitted cells are filled by the placement rules. */
  initialIcon?: string;
  initialObstacles?: Array<{
    type: string;
    durability?: number;
    config?: Record<string, unknown>;
  }>;
}

/**
 * Authored graph edge. Direction/orientation/label are designer vocabulary.
 * They are never inferred from screen coordinates.
 */
export interface EdgeDefinition {
  from: CellId;
  to: CellId;
  /** Traversal/match vocabulary (e.g. "e", "cw", "in"). Not an x/y axis. */
  direction?: DirectionLabel;
  /** Optional grouping of directions (e.g. "horizontal-looking", "radial"). */
  orientation?: string;
  /** Designer-facing label shown in authoring tools. */
  label?: string;
  /**
   * @deprecated Prefer `traversal`. `false` means forward-only.
   */
  bidirectional?: boolean;
  traversal?: EdgeTraversal;
  kind?: EdgeKind;
  allowsMatch?: boolean;
  allowsSwap?: boolean;
}

export interface FlowEdgeDefinition {
  from: CellId;
  to: CellId;
  kind?: FlowKind;
  label?: string;
}

export interface PortalDefinition {
  id: string;
  from: CellId;
  to: CellId;
  bidirectional?: boolean;
  conductsMatches?: boolean;
  allowsSwap?: boolean;
}

/**
 * Rotation is a graph transformation of an authored section.
 * Occupant cycles must be authored — the engine does not invent a bitmap spin.
 */
export interface RotationDefinition {
  incrementDegrees: number;
  rotatable: boolean;
  /**
   * Each cycle lists socket ids whose occupants (and movable flags/obstacles)
   * advance together. Cell identity stays on the socket.
   */
  occupantCycles?: CellId[][];
  /** If true, presentation x/y also cycle. Matching still ignores coordinates. */
  cyclePresentationPositions?: boolean;
  /** If true, remap `direction` labels on intra-section edges using directionMap. */
  remapDirections?: boolean;
  directionMap?: Record<string, string>;
}

export interface BoardSectionDefinition {
  id: SectionId;
  cellIds: CellId[];
  rotation?: RotationDefinition;
  chamber?: string;
  layer?: string;
}

export interface MovementRules {
  mode: "none" | "along-flow";
  refill: {
    mode: "none" | "spawn-at-sources";
    sourceCellIds?: CellId[];
    avoidImmediateMatches?: boolean;
    maxAvoidAttempts?: number;
  };
}

export interface BoardDefinition {
  topology: TopologyDescriptor;
  cells: CellDefinition[];
  adjacency: EdgeDefinition[];
  flow?: FlowEdgeDefinition[];
  portals?: PortalDefinition[];
  sections?: BoardSectionDefinition[];
  movement?: MovementRules;
  portalsConductMatches?: boolean;
  portalsAllowSwap?: boolean;
}

export interface TopologyEdge {
  from: CellId;
  to: CellId;
  direction?: DirectionLabel;
  kind: EdgeKind;
}

export interface DirectedEntry {
  to: CellId;
  direction?: DirectionLabel;
  orientation?: string;
  label?: string;
  kind: EdgeKind;
  allowsMatch: boolean;
  allowsSwap: boolean;
  /** True when this directed link is the authored `from → to` (not the reverse). */
  authoredForward: boolean;
}

export interface BoardTopology {
  cellIds: CellId[];
  cells: Record<CellId, CellDefinition>;
  adjacency: Record<CellId, CellId[]>;
  /** from -> directed neighbors */
  directed: Record<CellId, DirectedEntry[]>;
  flowDown: Record<CellId, CellId[]>;
  flowUp: Record<CellId, CellId[]>;
  flowMeta: Record<string, { kind: FlowKind; label?: string }>;
  portals: PortalDefinition[];
  sections: BoardSectionDefinition[];
  topology: TopologyDescriptor;
  movement: MovementRules;
  portalsConductMatches: boolean;
  portalsAllowSwap: boolean;
  spawnSources: CellId[];
}

export type Occupant =
  | { type: "empty" }
  | { type: "icon"; iconId: string }
  /** Pointer to a board Special Match instance in game state. Not an inventory Special Icon. */
  | { type: "special-match"; typeId: string; instanceId: string };

export interface ObstacleInstance {
  type: string;
  durability: number;
  config: Record<string, unknown>;
}

export interface RuntimeCell {
  id: CellId;
  occupant: Occupant;
  flags: CellFlags;
  obstacles: ObstacleInstance[];
}

/** Logical rotation only. Animation lives in presentation. */
export interface SectionRotationState {
  steps: number;
  visualAngle: number;
}

export interface Board {
  topology: BoardTopology;
  cells: Record<CellId, RuntimeCell>;
  rotation: Record<SectionId, SectionRotationState>;
}
