export type { TopologyKind, TopologyDescriptor } from "./topology.js";
export { TOPOLOGY_KINDS } from "./topology.js";
export type {
  Board,
  BoardDefinition,
  BoardSectionDefinition,
  BoardTopology,
  CellDefinition,
  CellFlags,
  CellPosition,
  EdgeDefinition,
  EdgeKind,
  FlowEdgeDefinition,
  MovementRules,
  Occupant,
  ObstacleInstance,
  PortalDefinition,
  RuntimeCell,
  TopologyEdge,
} from "./types.js";
export {
  activeCellIds,
  areAdjacent,
  buildTopology,
  cloneBoard,
  createBoard,
  createEmptyOccupant,
  createRuntimeCell,
  defaultMovementRules,
  getCell,
  neighbors,
  setOccupant,
} from "./graph.js";
export { settleFlow, type PieceMove, type SettlementResult } from "./movement.js";
