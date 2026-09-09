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
  DirectedEntry,
  EdgeDefinition,
  EdgeKind,
  EdgeTraversal,
  FlowEdgeDefinition,
  FlowKind,
  MovementRules,
  Occupant,
  ObstacleInstance,
  PortalDefinition,
  RotationDefinition,
  SectionRotationState,
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
export { validateBoardDefinition, type BoardValidationOptions } from "./validate.js";
export {
  adjacencyMap,
  connectedComponents,
  connectivityRequired,
  type ConnectedComponent,
} from "./components.js";
export {
  boardDefinitionsEquivalent,
  canonicalizeBoardDefinition,
  deserializeBoardDefinition,
  occupantsFromSerialized,
  serializeBoardDefinition,
  serializeBoardState,
  type SerializedBoardState,
} from "./serialize.js";
export {
  compileBoardDocument,
  defaultLabMatchRules,
  loadAndCompileBoardDocument,
  parseBoardDocument,
  type BoardDocument,
} from "./document.js";
export { explainInteraction, type InteractionExplanation } from "./explain.js";
export {
  applyDirectionMap,
  cellsAlongAuthoredDirection,
  DEFAULT_QUARTER_TURN_DIRECTION_MAP,
  detectAuthoredJunction,
  edgeAllowsMatch,
  edgeAllowsSwap,
  remapDirectionLabel,
  resolveTraversal,
  reverseDirection,
  walkAuthoredDirection,
  type AuthoredPattern,
  type AuthoredPatternKind,
} from "./direction.js";
export {
  applyRotationState,
  rotateSection,
  serializeRotationState,
  type OccupantPayload,
  type RotationStepResult,
} from "./rotation.js";
export { findDirectedCycle } from "./cycles.js";
