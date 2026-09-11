export {
  createEmptyStats,
  OBJECTIVE_TYPES,
  type GameStats,
  type Objective,
  type ObjectiveDefinition,
  type ObjectiveEvaluationContext,
  type ObjectiveProgress,
  type ObjectiveType,
} from "./model.js";
export { createObjective, evaluateDefinition, handlerResultToProgress } from "./create.js";
export {
  createObjectiveRegistry,
  getDefaultObjectiveRegistry,
  OBJECTIVE_CATALOG,
  OBJECTIVE_HANDLERS,
  ObjectiveRegistry,
  type ObjectiveHandler,
  type ObjectiveTypeSpec,
} from "./registry.js";
export {
  applyHandlerToState,
  cloneObjectiveState,
  compareObjectiveState,
  createObjectiveState,
  serializeObjectiveState,
} from "./state.js";
export {
  COMPLETION_POLICIES,
  CONFLICT_POLICIES,
  COUNT_UNITS,
  DEFAULT_WIN_STATE_CONFIG,
  EVALUATION_PHASES,
  FAILURE_POLICIES,
  OBJECTIVE_EVENT_KINDS,
  OBJECTIVE_ROLES,
  OBJECTIVE_STATUSES,
  WIN_STATES,
  defaultObjectiveAccessibility,
  type CompletionPolicy,
  type ConflictPolicy,
  type CountUnit,
  type EvaluationPhase,
  type FailurePolicy,
  type ObjectiveEvent,
  type ObjectiveEventKind,
  type ObjectiveRole,
  type ObjectiveState,
  type ObjectiveStatus,
  type WinState,
  type WinStateConfig,
  type WinStateResult,
} from "./types.js";
export { createObjectiveEvent, eventsFromCascade } from "./events.js";
export {
  createObjectiveRuntime,
  evaluateRuntime,
  ingestCascade,
  serializeRuntime,
  snapshotProgress,
  type ObjectiveRuntime,
} from "./evaluate.js";
export { resolveWinState, winConfigFromDefinitions } from "./win-state.js";
export { collectObjectiveTree, validateObjectiveDependencies } from "./dependencies.js";
export { validateObjectiveDefinition, validateObjectiveForest } from "./validate.js";
export { explainObjective, explainWinState } from "./explain.js";
export { canonicalObjectiveRuntime, objectiveRuntimesEqual } from "./serialize.js";
export { inspectObjectiveRuntime, type ObjectiveInspection } from "./inspect.js";
export { OBJECTIVE_FIXTURE_FILES, OBJECTIVE_FIXTURE_IDS, type ObjectiveFixtureId } from "./fixtures.js";
