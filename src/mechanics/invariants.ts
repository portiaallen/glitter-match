import { GLITTER_ICON_ID } from "../ids.js";
import type { Board } from "../board/index.js";
import { SPECIAL_ICON_IDS } from "../special-icons/index.js";
import { issue, type ValidationIssue } from "../validation.js";
import type { MechanicEffect, MechanicHandler } from "./contract.js";
import { compareMechanicState, deserializeMechanicState, serializeMechanicState, type MechanicState } from "./state.js";

const COORDINATE_KEYS = new Set(["x", "y", "position", "screenX", "screenY"]);

export function checkMechanicInvariants(
  mechanic: MechanicHandler,
  before: MechanicState,
  after: MechanicState,
  effects: MechanicEffect[],
  board: Board,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cellIds = new Set(board.topology.cellIds);

  if (mechanic.invariants.includes("serialization-integrity")) {
    const roundTrip = mechanic.deserialize(mechanic.serialize(after));
    if (!compareMechanicState(after, roundTrip)) {
      issues.push(
        issue(
          "mechanic.serialization_integrity",
          `mechanics.${mechanic.id}`,
          `Mechanic "${mechanic.id}" failed serialize/deserialize integrity.`,
        ),
      );
    }
  }

  if (mechanic.invariants.includes("deterministic") && mechanic.deterministic.hiddenRandomness !== false) {
    issues.push(
      issue(
        "mechanic.hidden_rng",
        `mechanics.${mechanic.id}`,
        `Mechanic "${mechanic.id}" must not use hidden uncontrolled randomness.`,
      ),
    );
  }

  if (mechanic.invariants.includes("graph-authority")) {
    issues.push(...rejectCoordinateAuthority(after.payload, `mechanics.${mechanic.id}.state`));
    for (const [index, effect] of effects.entries()) {
      issues.push(...rejectCoordinateAuthority(effect.payload ?? {}, `mechanics.${mechanic.id}.effects[${index}]`));
    }
  }

  if (mechanic.invariants.includes("valid-graph-references")) {
    for (const effect of effects) {
      for (const cellId of effect.cellIds ?? []) {
        if (!cellIds.has(cellId)) {
          issues.push(
            issue(
              "mechanic.unknown_cell",
              `mechanics.${mechanic.id}`,
              `Mechanic "${mechanic.id}" referenced unknown cell "${cellId}".`,
            ),
          );
        }
      }
    }
  }

  if (mechanic.invariants.includes("no-orphan-cells") && board.topology.cellIds.length === 0) {
    issues.push(issue("mechanic.orphan_board", `mechanics.${mechanic.id}`, "Mechanic left the board with no cells."));
  }

  if (mechanic.invariants.includes("special-icons-universal")) {
    for (const id of SPECIAL_ICON_IDS) {
      if (after.payload[id] && typeof after.payload[id] === "object") {
        const claimed = after.payload[id] as Record<string, unknown>;
        if (claimed.landId) {
          issues.push(
            issue(
              "mechanic.special_icon_owned",
              `mechanics.${mechanic.id}`,
              `Mechanic "${mechanic.id}" must not assign Special Icon "${id}" to a Land.`,
            ),
          );
        }
      }
    }
  }

  if (mechanic.invariants.includes("glitter-landless")) {
    const glitter = after.payload[GLITTER_ICON_ID];
    if (glitter && typeof glitter === "object" && (glitter as { landId?: unknown }).landId) {
      issues.push(
        issue(
          "mechanic.glitter_owned",
          `mechanics.${mechanic.id}`,
          `Mechanic "${mechanic.id}" must not assign the Glitter Icon to a Land.`,
        ),
      );
    }
  }

  if (before.mechanicId !== after.mechanicId || before.id !== after.id) {
    issues.push(
      issue(
        "mechanic.state_identity",
        `mechanics.${mechanic.id}`,
        `Mechanic "${mechanic.id}" changed instance identity during a hook.`,
      ),
    );
  }

  void deserializeMechanicState;
  void serializeMechanicState;
  return issues;
}

export function rejectCoordinateAuthority(value: unknown, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  walk(value, path, issues);
  return issues;
}

function walk(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, issues));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (COORDINATE_KEYS.has(key)) {
      issues.push(
        issue(
          "mechanic.xy_authority",
          `${path}.${key}`,
          `Land mechanics must not use screen coordinates as gameplay authority (found "${key}").`,
        ),
      );
    }
    walk(child, `${path}.${key}`, issues);
  }
}
