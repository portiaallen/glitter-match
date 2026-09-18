import { LAND_IDS, type LandId } from "../ids.js";
import { MECHANIC_INVARIANTS, type MechanicHandler } from "./contract.js";
import { createMechanicState, deserializeMechanicState, serializeMechanicState } from "./state.js";

export function reservedLandMechanicId(landId: LandId): string {
  return `land.${landId}`;
}

export function reservedLandMechanic(landId: LandId): MechanicHandler {
  const id = reservedLandMechanicId(landId);
  const version = "0.0.0-reserved";
  return {
    id,
    landId,
    version,
    status: "reserved",
    implemented: false,
    description: `Reserved ${landId} handler. Vocabulary only; no puzzle mechanic.`,
    debugDescription: `${id} is unimplemented. The engine asks the registry and receives no effects.`,
    activation: { type: "manual" },
    affected: { boardState: false, cells: false, occupants: false, edges: false },
    interactions: { matches: false, cascades: false, movement: false, objectives: false, obstacles: false },
    lifecycle: [],
    serialize: serializeMechanicState,
    deserialize: deserializeMechanicState,
    initialize: () => createMechanicState(id, version),
    explain: (state, effects = []) => ({
      mechanicId: id,
      implemented: false,
      status: "reserved",
      state,
      affectedCells: [],
      affectedEdges: [],
      lastEffects: effects,
      explanation: `${id} is reserved. Land DNA describes language only; no production mechanic is attached.`,
    }),
    deterministic: { required: true, usesRng: false, hiddenRandomness: false },
    accessibility: {
      label: `Reserved ${landId} mechanic`,
      description: "No gameplay behavior yet. State is empty and inspectable.",
      nonColorIndicator: id,
      reducedMotion: "No motion is produced.",
      textState: "Reserved. No state changes.",
      audioCues: false,
      hapticCues: false,
      timingAccommodations: "Not applicable.",
      stateChangeIndication: "None. Placeholder produces no effects.",
    },
    difficultyInfluence: ["mechanicComplexity"],
    dependencies: [],
    conflicts: [],
    priority: 100,
    compatibility: [],
    topologyPermissions: [],
    exclusiveTopologyMutations: [],
    invariants: [...MECHANIC_INVARIANTS],
    authority: "graph",
    specialIconPolicy: "universal-unchanged",
    glitterPolicy: "landless-unchanged",
    crossLand: false,
  };
}

export function reservedLandMechanics(): MechanicHandler[] {
  return LAND_IDS.map((landId) => reservedLandMechanic(landId));
}
