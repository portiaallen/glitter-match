import { getCell, type Board } from "../board/index.js";
import { matchNeighbors } from "../matching/occupancy.js";
import { applyEffectBatch, createPrimitiveRuntime, type PrimitiveEffect } from "../primitives/index.js";
import { applyObstacleSpecialResponses } from "./obstacles.js";
import type { SpecialInteractionRegistry } from "./interactions.js";
import type { SpecialMatchRegistry } from "./registry.js";
import { cellHasSpecial, consumeSpecialOccupantEffect } from "./effects.js";
import { nextActivationId, type SpecialMatchRuntime } from "./runtime.js";
import {
  defaultSpecialAccessibility,
  type SpecialMatchActivation,
  type SpecialMatchEvent,
  type SpecialMatchTrigger,
} from "./types.js";
import type { ObstacleRegistry } from "../obstacles/index.js";

export function compareActivations(a: SpecialMatchActivation, b: SpecialMatchActivation): number {
  return (
    a.sequence - b.sequence ||
    a.createdAtMove - b.createdAtMove ||
    b.priority - a.priority ||
    a.anchorCellId.localeCompare(b.anchorCellId) ||
    a.instanceId.localeCompare(b.instanceId) ||
    a.activationId.localeCompare(b.activationId)
  );
}

export function queueActivation(
  runtime: SpecialMatchRuntime,
  instanceId: string,
  trigger: SpecialMatchTrigger,
  priority: number,
): SpecialMatchActivation | null {
  const instance = runtime.instances[instanceId];
  if (!instance) {
    return null;
  }
  if (instance.state === "resolved" || instance.state === "cancelled" || instance.state === "resolving") {
    return null;
  }
  if (runtime.pending.some((item) => item.instanceId === instanceId)) {
    return null;
  }
  const activation: SpecialMatchActivation = {
    activationId: nextActivationId(runtime, instanceId, trigger),
    instanceId,
    trigger,
    sequence: runtime.activationSeq,
    createdAtMove: instance.createdAtMove,
    priority,
    anchorCellId: instance.anchorCellId,
  };
  instance.state = "triggered";
  instance.activationState = "triggered";
  runtime.pending.push(activation);
  runtime.events.push({
    kind: "SPECIAL_MATCH_TRIGGERED",
    activationId: activation.activationId,
    instanceId,
    message: `Special Match ${instanceId} triggered by ${trigger}.`,
    explain: {
      whyActivated: `Trigger "${trigger}" is registered and the instance was armed.`,
      accessibility: defaultSpecialAccessibility(instance.typeId, instance.anchorCellId),
    },
  });
  return activation;
}

export function collectMatchTriggers(
  board: Board,
  runtime: SpecialMatchRuntime,
  registry: SpecialMatchRegistry,
  clearedCellIds: string[],
  skipInstanceIds: ReadonlySet<string> = new Set(),
): void {
  const cleared = new Set(clearedCellIds);
  for (const instance of Object.values(runtime.instances).sort((a, b) => a.instanceId.localeCompare(b.instanceId))) {
    if (instance.state !== "armed") {
      continue;
    }
    if (skipInstanceIds.has(instance.instanceId)) {
      continue;
    }
    const type = registry.get(instance.typeId);
    const neighbors = matchNeighbors(board, instance.anchorCellId).map((edge) => edge.to);
    const matched = cleared.has(instance.anchorCellId) && type.activationTriggers.includes("matched");
    const adjacent = neighbors.some((id) => cleared.has(id)) && type.activationTriggers.includes("adjacent-match");
    if (matched || adjacent) {
      queueActivation(runtime, instance.instanceId, matched ? "matched" : "adjacent-match", type.priority);
    }
  }
}

export function resolvePendingActivations(
  board: Board,
  runtime: SpecialMatchRuntime,
  registry: SpecialMatchRegistry,
  interactions: SpecialInteractionRegistry,
  obstacles: ObstacleRegistry,
  limits: { maxActivations: number; maxEffects: number },
  counts: { activations: number; effects: number },
): { events: SpecialMatchEvent[]; applied: PrimitiveEffect[]; invalid?: string } {
  const events: SpecialMatchEvent[] = [];
  const applied: PrimitiveEffect[] = [];
  runtime.pending.sort(compareActivations);
  while (runtime.pending.length > 0) {
    if (counts.activations >= limits.maxActivations) {
      return { events, applied, invalid: "activation-limit" };
    }
    const activation = runtime.pending.shift()!;
    const instance = runtime.instances[activation.instanceId];
    if (!instance || instance.state === "resolved" || instance.state === "cancelled") {
      continue;
    }
    const type = registry.get(instance.typeId);
    if (!type.activationTriggers.includes(activation.trigger)) {
      continue;
    }
    instance.state = "resolving";
    instance.activationState = "resolving";
    counts.activations += 1;
    events.push({
      kind: "SPECIAL_MATCH_ACTIVATED",
      activationId: activation.activationId,
      instanceId: instance.instanceId,
      message: `Activated ${instance.typeId} at ${instance.anchorCellId} (${activation.trigger}).`,
      explain: {
        whyActivated: `Ordering: sequence, createdAtMove, priority, anchor, instanceId. Trigger ${activation.trigger}.`,
        accessibility: {
          ...type.accessibility,
          label: `${type.id} Special Match at cell ${instance.anchorCellId}`,
        },
      },
    });

    let effects = type.emitEffects({ board, instance, trigger: activation.trigger });
    const extra: PrimitiveEffect[] = [];
    const remaining: PrimitiveEffect[] = [];
    for (const effect of effects) {
      const target = effect.cellIds?.[0];
      const struck = target ? cellHasSpecial(board, target) : undefined;
      if (struck && struck.instanceId !== instance.instanceId) {
        const interaction = interactions.resolve(instance.typeId, struck.typeId, "strike");
        events.push({
          kind: "SPECIAL_INTERACTION_RESOLVED",
          instanceId: instance.instanceId,
          message: `Interaction ${interaction.id}: ${interaction.description}`,
          explain: {
            whyActivated: interaction.description,
            accessibility: defaultSpecialAccessibility(instance.typeId, instance.anchorCellId),
          },
          data: { interaction, target: struck },
        });
        if (interaction.result === "activate-target") {
          const targetType = registry.get(struck.typeId);
          if (targetType.activationTriggers.includes("struck")) {
            queueActivation(runtime, struck.instanceId, "struck", targetType.priority);
          }
        }
        continue;
      }
      remaining.push(effect);
    }
    effects = applyObstacleSpecialResponses(board, [...remaining, ...extra], obstacles);
    if (type.consumption === "consumed") {
      effects.push(consumeSpecialOccupantEffect(instance));
    }
    counts.effects += effects.length;
    if (counts.effects > limits.maxEffects) {
      return { events, applied, invalid: "effect-limit" };
    }

    const primitive = createPrimitiveRuntime(board);
    const batch = applyEffectBatch(primitive, effects);
    if (!batch.ok) {
      instance.state = "armed";
      instance.activationState = "armed";
      return { events, applied, invalid: batch.explanation.failure ?? "effect-batch-failed" };
    }
    adoptBoard(board, batch.runtime.board);
    applied.push(...batch.applied);
    events.push({
      kind: "SPECIAL_MATCH_EFFECT_EMITTED",
      activationId: activation.activationId,
      instanceId: instance.instanceId,
      cellIds: batch.applied.flatMap((effect) => effect.cellIds ?? []),
      message: `Emitted ${batch.applied.length} primitive effects.`,
      explain: {
        effects: batch.applied,
        affectedCells: batch.explanation.changedCells,
        affectedEdges: batch.explanation.changedEdges,
        accessibility: type.accessibility,
      },
    });

    if (type.consumption === "consumed") {
      instance.state = "resolved";
      instance.activationState = "resolved";
      events.push({
        kind: "SPECIAL_MATCH_CONSUMED",
        instanceId: instance.instanceId,
        message: `Consumed ${instance.instanceId}.`,
        explain: { accessibility: type.accessibility },
      });
    } else if (type.consumption === "remain") {
      instance.state = "armed";
      instance.activationState = "armed";
    } else {
      instance.state = "resolved";
      instance.activationState = "resolved";
    }
    events.push({
      kind: "SPECIAL_MATCH_RESOLVED",
      instanceId: instance.instanceId,
      message: `Resolved ${instance.instanceId}.`,
      explain: { accessibility: type.accessibility },
    });
    runtime.pending.sort(compareActivations);
  }
  return { events, applied };
}

export function adoptBoard(target: Board, source: Board): void {
  for (const id of target.topology.cellIds) {
    if (source.cells[id]) {
      target.cells[id] = source.cells[id]!;
    }
  }
  target.rotation = source.rotation;
}

export function cancelOrphans(board: Board, runtime: SpecialMatchRuntime): SpecialMatchEvent[] {
  const events: SpecialMatchEvent[] = [];
  for (const instance of Object.values(runtime.instances)) {
    if (instance.state === "resolved" || instance.state === "cancelled") {
      continue;
    }
    const occupant = getCell(board, instance.anchorCellId).occupant;
    if (occupant.type !== "special-match" || occupant.instanceId !== instance.instanceId) {
      instance.state = "cancelled";
      instance.activationState = "cancelled";
      events.push({
        kind: "SPECIAL_MATCH_CANCELLED",
        instanceId: instance.instanceId,
        message: `Cancelled ${instance.instanceId}: occupant no longer present after topology/state change.`,
        explain: { accessibility: defaultSpecialAccessibility(instance.typeId, instance.anchorCellId) },
      });
    }
  }
  return events;
}
