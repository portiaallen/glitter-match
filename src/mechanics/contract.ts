import type { DifficultyDimension } from "../difficulty/model.js";
import type { CellId, LandId } from "../ids.js";
import type { Board } from "../board/index.js";
import type { RandomSource } from "../random/index.js";
import type { MechanicState } from "./state.js";

export const MECHANIC_LIFECYCLE = [
  "beforeMove",
  "move",
  "afterMove",
  "beforeMatch",
  "match",
  "afterMatch",
  "cascade",
  "settle",
  "objectiveEvaluation",
] as const;

export type MechanicLifecyclePhase = (typeof MECHANIC_LIFECYCLE)[number];

export const MECHANIC_EFFECT_KINDS = [
  "cell-state-changed",
  "occupant-changed",
  "edge-state-changed",
  "board-topology-changed",
  "obstacle-changed",
  "objective-progress-changed",
  "movement-permission-changed",
  "visual-state-changed",
  "audio-cue-requested",
  "haptic-cue-requested",
  "discovery-triggered",
] as const;

export type MechanicEffectKind = (typeof MECHANIC_EFFECT_KINDS)[number];

export const TOPOLOGY_MUTATION_KINDS = [
  "enable-edge",
  "disable-edge",
  "redirect-traversal",
  "rotate-occupants",
  "open-route",
  "close-route",
  "temporary-connectivity",
  "alter-flow",
  "synchronize-paired-regions",
  "move-chamber",
  "reveal-hidden-route",
] as const;

export type TopologyMutationKind = (typeof TOPOLOGY_MUTATION_KINDS)[number];

export const MECHANIC_INVARIANTS = [
  "valid-graph-references",
  "no-orphan-cells",
  "no-invalid-edges",
  "no-impossible-occupants",
  "deterministic",
  "serialization-integrity",
  "graph-authority",
  "special-icons-universal",
  "glitter-landless",
] as const;

export type MechanicInvariantId = (typeof MECHANIC_INVARIANTS)[number];

export const MECHANIC_STATUSES = ["reserved", "experimental", "implemented"] as const;
export type MechanicStatus = (typeof MECHANIC_STATUSES)[number];

export interface MechanicActivation {
  type: "always" | "on-match" | "on-swap" | "on-cascade" | "on-threshold" | "manual";
  config?: Record<string, unknown>;
}

export interface MechanicEffect {
  kind: MechanicEffectKind;
  mechanicId: string;
  description: string;
  nonColorIndicator: string;
  cellIds?: CellId[];
  edgeKeys?: string[];
  topologyMutation?: TopologyMutationKind;
  payload?: Record<string, unknown>;
}

export interface MechanicResult {
  state: MechanicState;
  effects: MechanicEffect[];
}

export interface MechanicContext {
  board: Board;
  mechanicState: MechanicState;
  rng: RandomSource;
  phase: MechanicLifecyclePhase;
  move?: { from: CellId; to: CellId };
}

export interface MechanicInspection {
  mechanicId: string;
  implemented: boolean;
  status: MechanicStatus;
  state: MechanicState;
  affectedCells: CellId[];
  affectedEdges: string[];
  lastTrigger?: MechanicLifecyclePhase;
  lastEffects: MechanicEffect[];
  explanation: string;
}

export interface MechanicAccessibility {
  label: string;
  description: string;
  nonColorIndicator: string;
  reducedMotion: string;
  textState: string;
  audioCues: boolean;
  hapticCues: boolean;
  timingAccommodations: string;
  stateChangeIndication: string;
}

export interface MechanicHandler {
  id: string;
  landId?: LandId;
  version: string;
  status: MechanicStatus;
  implemented: boolean;
  description: string;
  debugDescription: string;
  activation: MechanicActivation;
  affected: {
    boardState: boolean;
    cells: boolean;
    occupants: boolean;
    edges: boolean;
  };
  interactions: {
    matches: boolean;
    cascades: boolean;
    movement: boolean;
    objectives: boolean;
    obstacles: boolean;
  };
  lifecycle: MechanicLifecyclePhase[];
  hooks?: Partial<Record<MechanicLifecyclePhase, (ctx: MechanicContext) => MechanicResult>>;
  serialize: (state: MechanicState) => Record<string, unknown>;
  deserialize: (raw: Record<string, unknown>) => MechanicState;
  initialize: () => MechanicState;
  explain: (state: MechanicState, effects?: MechanicEffect[]) => MechanicInspection;
  deterministic: {
    required: true;
    usesRng: boolean;
    hiddenRandomness: false;
  };
  accessibility: MechanicAccessibility;
  difficultyInfluence: DifficultyDimension[];
  dependencies: string[];
  conflicts: string[];
  priority: number;
  compatibility: string[];
  topologyPermissions: TopologyMutationKind[];
  exclusiveTopologyMutations: TopologyMutationKind[];
  invariants: MechanicInvariantId[];
  authority: "graph";
  specialIconPolicy: "universal-unchanged";
  glitterPolicy: "landless-unchanged";
  crossLand: boolean;
  /**
   * @deprecated Prefer lifecycle hooks. Kept so earlier callers can still attach a transform.
   */
  apply?(state: MechanicState, event: Record<string, unknown>): MechanicState;
}

export interface MechanicDefinition extends MechanicHandler {}

export function edgeKey(from: CellId, to: CellId): string {
  return `${from}->${to}`;
}
