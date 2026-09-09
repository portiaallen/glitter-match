import type { CellId, DirectionLabel, SectionId } from "../ids.js";
import type { TopologyDescriptor } from "./topology.js";

export type EdgeKind = "adjacent" | "portal" | "bridge";

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

export interface EdgeDefinition {
  from: CellId;
  to: CellId;
  direction?: DirectionLabel;
  bidirectional?: boolean;
  kind?: EdgeKind;
}

export interface FlowEdgeDefinition {
  from: CellId;
  to: CellId;
}

export interface PortalDefinition {
  id: string;
  from: CellId;
  to: CellId;
  bidirectional?: boolean;
  conductsMatches?: boolean;
  allowsSwap?: boolean;
}

export interface BoardSectionDefinition {
  id: SectionId;
  cellIds: CellId[];
  rotation?: {
    incrementDegrees: number;
    rotatable: boolean;
  };
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

export interface BoardTopology {
  cellIds: CellId[];
  cells: Record<CellId, CellDefinition>;
  adjacency: Record<CellId, CellId[]>;
  /** from -> direction -> to */
  directed: Record<CellId, Array<{ to: CellId; direction?: DirectionLabel; kind: EdgeKind }>>;
  flowDown: Record<CellId, CellId[]>;
  flowUp: Record<CellId, CellId[]>;
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
  | { type: "icon"; iconId: string };

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

export interface Board {
  topology: BoardTopology;
  cells: Record<CellId, RuntimeCell>;
}
