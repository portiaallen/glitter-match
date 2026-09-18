import { MECHANIC_INVARIANTS, type MechanicHandler, type MechanicResult } from "./contract.js";
import { createMechanicState, deserializeMechanicState, serializeMechanicState } from "./state.js";

/**
 * Development-only mechanic used by the contract harness.
 * Not a Land mechanic and not campaign content.
 */
export const DEV_ECHO_MECHANIC_ID = "dev.echo";

export function createDevEchoMechanic(overrides: Partial<MechanicHandler> = {}): MechanicHandler {
  const id = overrides.id ?? DEV_ECHO_MECHANIC_ID;
  const version = overrides.version ?? "0.1.0-dev";
  const base: MechanicHandler = {
    id,
    version,
    status: "experimental",
    implemented: true,
    description: "Development echo mechanic for contract tests. Not a Land puzzle mechanic.",
    debugDescription: "Increments a counter after a move and emits an inspectable visual-state effect.",
    activation: { type: "on-swap" },
    affected: { boardState: false, cells: true, occupants: false, edges: false },
    interactions: { matches: false, cascades: false, movement: true, objectives: false, obstacles: false },
    lifecycle: ["afterMove", "settle"],
    hooks: {
      afterMove(ctx): MechanicResult {
        const count = Number(ctx.mechanicState.payload.count ?? 0) + 1;
        const roll = ctx.mechanicState.payload.useRng === true ? ctx.rng.nextInt(4) : null;
        const cellIds = ctx.move ? [ctx.move.from, ctx.move.to] : [];
        const state = {
          ...ctx.mechanicState,
          payload: {
            ...ctx.mechanicState.payload,
            count,
            roll,
            lastFrom: ctx.move?.from ?? null,
            lastTo: ctx.move?.to ?? null,
          },
        };
        return {
          state,
          effects: [
            {
              kind: "visual-state-changed",
              mechanicId: id,
              description: `echo count=${count}`,
              nonColorIndicator: `echo-${count}`,
              cellIds,
            },
          ],
        };
      },
    },
    serialize: serializeMechanicState,
    deserialize: deserializeMechanicState,
    initialize: () => createMechanicState(id, version, { count: 0 }),
    explain: (state, effects = []) => ({
      mechanicId: id,
      implemented: true,
      status: "experimental",
      state,
      affectedCells: (effects[0]?.cellIds ?? []).slice(),
      affectedEdges: [],
      lastTrigger: "afterMove",
      lastEffects: effects,
      explanation: `${id} count=${String(state.payload.count ?? 0)}. Triggered by afterMove. Cells: ${(effects[0]?.cellIds ?? []).join(", ") || "none"}.`,
    }),
    deterministic: { required: true, usesRng: true, hiddenRandomness: false },
    accessibility: {
      label: "Development echo",
      description: "Test counter. Announces count as a number, never color alone.",
      nonColorIndicator: "echo-count",
      reducedMotion: "No animation.",
      textState: "Echo count is numeric.",
      audioCues: false,
      hapticCues: false,
      timingAccommodations: "Turn-based.",
      stateChangeIndication: "Count increments after a legal move.",
    },
    difficultyInfluence: ["mechanicComplexity"],
    dependencies: [],
    conflicts: [],
    priority: 50,
    compatibility: [],
    topologyPermissions: [],
    exclusiveTopologyMutations: [],
    invariants: [...MECHANIC_INVARIANTS],
    authority: "graph",
    specialIconPolicy: "universal-unchanged",
    glitterPolicy: "landless-unchanged",
    crossLand: false,
  };
  return { ...base, ...overrides, id, version };
}
