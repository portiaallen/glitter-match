import type { CellId } from "../ids.js";
import type { Occupant } from "../board/types.js";

/**
 * Primitives are reusable building blocks. They are not Land mechanics.
 * Land identity belongs at the mechanic-handler layer.
 */
export const PRIMITIVE_CATEGORIES = [
  "state",
  "cell",
  "occupant",
  "edge",
  "topology",
  "temporary",
  "trigger",
  "condition",
  "effect",
  "batch",
  "transform",
  "pairing",
  "synchronization",
  "region",
  "path",
  "threshold",
  "randomness",
  "accessibility",
] as const;

export type PrimitiveCategory = (typeof PRIMITIVE_CATEGORIES)[number];

export const PRIMITIVE_IDS = [
  "state-transition",
  "cell-state",
  "occupant-state",
  "edge-state",
  "topology-mutation",
  "temporary-state",
  "trigger",
  "condition",
  "effect",
  "batch-resolution",
  "transformation",
  "pairing",
  "synchronization",
  "region",
  "path",
  "threshold",
  "controlled-randomness",
  "accessibility-cue",
] as const;

export type PrimitiveId = (typeof PRIMITIVE_IDS)[number];

export const CELL_PRIMITIVE_STATES = [
  "normal",
  "locked",
  "unlocked",
  "active",
  "inactive",
  "revealed",
  "hidden",
  "protected",
  "vulnerable",
  "frozen",
  "transformed",
] as const;

export type CellPrimitiveState = (typeof CELL_PRIMITIVE_STATES)[number];

export const PRIMITIVE_TRIGGERS = [
  "move",
  "match",
  "cascade",
  "cell-change",
  "occupant-change",
  "objective-progress",
  "threshold-reached",
  "board-state-change",
  "mechanic-state-change",
] as const;

export type PrimitiveTriggerKind = (typeof PRIMITIVE_TRIGGERS)[number];

export interface PrimitiveTrigger {
  kind: PrimitiveTriggerKind;
  cellIds?: CellId[];
  edgeKeys?: string[];
  payload?: Record<string, unknown>;
}

export const PRIMITIVE_EFFECT_KINDS = [
  "change-cell-state",
  "change-occupant",
  "transform-occupant",
  "move-occupant",
  "swap-occupants",
  "rotate-occupants",
  "mark-occupant",
  "change-edge-state",
  "enable-edge",
  "disable-edge",
  "redirect-edge",
  "open-route",
  "close-route",
  "activate-portal",
  "deactivate-portal",
  "create-temporary",
  "remove-temporary",
  "modify-objective",
  "emit-discovery",
  "presentation-cue",
  "advance-threshold",
  "upsert-relationship",
  "remove-relationship",
  "sync-members",
] as const;

export type PrimitiveEffectKind = (typeof PRIMITIVE_EFFECT_KINDS)[number];

export interface AccessibilityCue {
  announcement: string;
  audioId?: string;
  hapticId?: string;
  reducedMotionAlternative: string;
  highContrastIndicator: string;
}

export interface PrimitiveEffect {
  id?: string;
  kind: PrimitiveEffectKind;
  priority?: number;
  reversible?: boolean;
  cellIds?: CellId[];
  edgeKey?: string;
  occupant?: Occupant;
  fromOccupant?: Occupant;
  from?: CellId;
  to?: CellId;
  cycle?: CellId[];
  mark?: string;
  markValue?: string;
  cellState?: CellPrimitiveState;
  edgePatch?: Partial<EdgeOverlay>;
  redirectTo?: CellId;
  temporary?: TemporaryRecord;
  temporaryId?: string;
  objectiveKey?: string;
  objectiveDelta?: number;
  discoveryId?: string;
  cue?: AccessibilityCue;
  thresholdId?: string;
  thresholdDelta?: number;
  relationship?: RelationshipRecord;
  relationshipId?: string;
  syncId?: string;
  payload?: Record<string, unknown>;
}

export interface EdgeOverlay {
  active: boolean;
  traversable: boolean;
  allowsMatch: boolean;
  allowsSwap: boolean;
  redirectedTo?: CellId;
}

export interface CellOverlay {
  named: CellPrimitiveState[];
  custom: string[];
}

export interface OccupantMark {
  identity?: string;
  marks: Record<string, string>;
}

export interface TemporaryRecord {
  id: string;
  kind: "moves" | "until-trigger" | "until-match" | "duration" | "route" | "protection";
  remainingMoves?: number;
  untilTrigger?: PrimitiveTriggerKind;
  cellIds?: CellId[];
  edgeKeys?: string[];
  payload?: Record<string, unknown>;
}

export interface RelationshipRecord {
  id: string;
  kind: "cell-cell" | "occupant-occupant" | "region-region";
  a: string;
  b: string;
  state: "idle" | "active" | "broken";
  lifecycle: "permanent" | "temporary";
}

export interface SyncRecord {
  id: string;
  memberIds: string[];
  mode: "together" | "matching-state" | "linked-transition";
}

export interface RegionRecord {
  id: string;
  cellIds: CellId[];
  state: string;
}

export interface ThresholdRecord {
  id: string;
  kind: "count" | "percent" | "objective" | "state" | "multi-stage";
  target: number;
  current: number;
  crossed: boolean;
  stages?: number[];
}

export interface StateTransition {
  id: string;
  from: string;
  to: string;
  trigger: PrimitiveTriggerKind;
  condition?: Condition;
  effects?: PrimitiveEffect[];
}

export interface TransformationContract {
  id: string;
  source: string;
  destination: string;
  trigger: PrimitiveTriggerKind;
  condition?: Condition;
  effects: PrimitiveEffect[];
  reversible: boolean;
}

export type Condition =
  | { type: "always" }
  | { type: "never" }
  | { type: "and"; of: Condition[] }
  | { type: "or"; of: Condition[] }
  | { type: "not"; of: Condition }
  | { type: "cell-has-state"; cellId: CellId; state: CellPrimitiveState }
  | { type: "cell-contains-icon"; cellId: CellId; iconId: string }
  | { type: "edge-has-state"; edgeKey: string; field: keyof EdgeOverlay; value: boolean }
  | { type: "objective-progress"; key: string; op: CompareOp; value: number }
  | { type: "move-count"; op: CompareOp; value: number }
  | { type: "cascade-count"; op: CompareOp; value: number }
  | { type: "mechanic-state"; path: string; equals: unknown }
  | { type: "connected-region-exists"; cellIds: CellId[] }
  | { type: "pattern-exists"; cellIds: CellId[]; iconId: string };

export type CompareOp = "==" | ">=" | "<=" | ">";

export interface PrimitiveEvent {
  kind: string;
  description: string;
  trigger?: PrimitiveTrigger;
  cellIds?: CellId[];
  edgeKeys?: string[];
}

export interface PrimitiveExplanation {
  what: string;
  why: string;
  trigger?: PrimitiveTrigger;
  changedCells: CellId[];
  changedEdges: string[];
  effects: PrimitiveEffect[];
  events: PrimitiveEvent[];
  failure?: string;
}

export interface PrimitiveDefinition {
  id: PrimitiveId;
  version: string;
  category: PrimitiveCategory;
  description: string;
  inputContract: string;
  stateContract: string;
  effectContract: string;
  lifecycleHooks: string[];
  deterministic: { required: true; usesRng: boolean; hiddenRandomness: false };
  accessibility: {
    label: string;
    description: string;
    nonColorIndicator: string;
    reducedMotion: string;
  };
  serialization: { roundTrip: true };
  debug: string;
}

export function graphEdgeKey(from: CellId, to: CellId): string {
  return `${from}->${to}`;
}

export function parseEdgeKey(key: string): { from: CellId; to: CellId } | null {
  const index = key.indexOf("->");
  if (index <= 0) {
    return null;
  }
  return { from: key.slice(0, index), to: key.slice(index + 2) };
}
