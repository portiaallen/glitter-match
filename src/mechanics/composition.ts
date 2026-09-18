import { issue, type ValidationIssue } from "../validation.js";
import { MECHANIC_LIFECYCLE, type MechanicHandler, type TopologyMutationKind } from "./contract.js";

export interface MechanicLookup {
  has(id: string): boolean;
  get(id: string): MechanicHandler;
}

export interface MechanicBinding {
  id: string;
  priority?: number;
}

export function normalizeMechanicBindings(input: Array<string | MechanicBinding> | undefined): MechanicBinding[] {
  return (input ?? []).map((item) => (typeof item === "string" ? { id: item } : { id: item.id, priority: item.priority }));
}

export function composeMechanics(bindings: MechanicBinding[], registry: MechanicLookup): MechanicHandler[] {
  return [...bindings]
    .map((binding) => {
      const mechanic = registry.get(binding.id);
      return { mechanic, priority: binding.priority ?? mechanic.priority };
    })
    .sort((left, right) => left.priority - right.priority || left.mechanic.id.localeCompare(right.mechanic.id))
    .map((item) => item.mechanic);
}

export function validateMechanicComposition(
  bindings: MechanicBinding[],
  registry: MechanicLookup,
  landId?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const [index, binding] of bindings.entries()) {
    if (seen.has(binding.id)) {
      issues.push(issue("mechanic.duplicate_binding", `mechanics[${index}]`, `Duplicate mechanic id "${binding.id}".`));
      continue;
    }
    seen.add(binding.id);
    if (!registry.has(binding.id)) {
      issues.push(issue("mechanic.unknown", `mechanics[${index}]`, `Unknown mechanic "${binding.id}".`));
    }
  }

  const known = bindings.filter((binding) => registry.has(binding.id)).map((binding) => registry.get(binding.id));
  const ids = new Set(known.map((mechanic) => mechanic.id));

  for (const mechanic of known) {
    if (mechanic.landId && landId && mechanic.landId !== landId && !mechanic.crossLand) {
      issues.push(
        issue(
          "mechanic.land_isolation",
          `mechanics.${mechanic.id}`,
          `Mechanic "${mechanic.id}" belongs to ${mechanic.landId} and cannot silently alter ${landId}. Cross-Land use must be explicit.`,
        ),
      );
    }
    if (mechanic.authority !== "graph") {
      issues.push(
        issue(
          "mechanic.xy_authority",
          `mechanics.${mechanic.id}`,
          `Mechanic "${mechanic.id}" must operate on cell ids and graph edges. Screen x/y is presentation only.`,
        ),
      );
    }
    if (mechanic.specialIconPolicy !== "universal-unchanged") {
      issues.push(
        issue(
          "mechanic.special_icon_redefine",
          `mechanics.${mechanic.id}`,
          `Mechanic "${mechanic.id}" must not redefine Universal Special Icons.`,
        ),
      );
    }
    if (mechanic.glitterPolicy !== "landless-unchanged") {
      issues.push(
        issue(
          "mechanic.glitter_reassign",
          `mechanics.${mechanic.id}`,
          `Mechanic "${mechanic.id}" must not assign the Glitter Icon to a Land.`,
        ),
      );
    }
    if (!mechanic.accessibility.nonColorIndicator || mechanic.accessibility.nonColorIndicator.length === 0) {
      issues.push(
        issue(
          "mechanic.a11y_color_only",
          `mechanics.${mechanic.id}.accessibility`,
          `Mechanic "${mechanic.id}" must declare a non-color indicator. Gameplay state cannot be color-only.`,
        ),
      );
    }
    for (const phase of mechanic.lifecycle) {
      if (!(MECHANIC_LIFECYCLE as readonly string[]).includes(phase)) {
        issues.push(
          issue("mechanic.unknown_lifecycle", `mechanics.${mechanic.id}`, `Unknown lifecycle phase "${phase}".`),
        );
      }
    }
    for (const dependency of mechanic.dependencies) {
      if (!ids.has(dependency) && !registry.has(dependency)) {
        issues.push(
          issue(
            "mechanic.missing_dependency",
            `mechanics.${mechanic.id}`,
            `Mechanic "${mechanic.id}" depends on unknown "${dependency}".`,
          ),
        );
      } else if (!ids.has(dependency)) {
        issues.push(
          issue(
            "mechanic.unbound_dependency",
            `mechanics.${mechanic.id}`,
            `Mechanic "${mechanic.id}" depends on "${dependency}", which is not in this composition.`,
          ),
        );
      }
    }
    for (const conflict of mechanic.conflicts) {
      if (ids.has(conflict)) {
        issues.push(
          issue(
            "mechanic.declared_conflict",
            `mechanics.${mechanic.id}`,
            `Mechanic "${mechanic.id}" conflicts with "${conflict}".`,
          ),
        );
      }
    }
  }

  issues.push(...validateCircularDependencies(known));
  issues.push(...validateTopologyConflicts(known));
  issues.push(...validateLifecycleOrdering(known, bindings, registry));
  issues.push(...validateStateOwnership(known));
  return issues;
}

function validateCircularDependencies(mechanics: MechanicHandler[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(mechanics.map((mechanic) => [mechanic.id, mechanic]));

  const visit = (id: string, stack: string[]): void => {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      issues.push(
        issue(
          "mechanic.circular_dependency",
          `mechanics.${id}`,
          `Circular mechanic dependency: ${[...stack, id].join(" → ")}.`,
        ),
      );
      return;
    }
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      if (byId.has(dependency)) {
        visit(dependency, [...stack, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const mechanic of mechanics) {
    visit(mechanic.id, []);
  }
  return issues;
}

const EXCLUSIVE_PAIRS: ReadonlyArray<readonly [TopologyMutationKind, TopologyMutationKind]> = [
  ["enable-edge", "disable-edge"],
  ["open-route", "close-route"],
];

function validateTopologyConflicts(mechanics: MechanicHandler[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < mechanics.length; i += 1) {
    for (let j = i + 1; j < mechanics.length; j += 1) {
      const left = mechanics[i]!;
      const right = mechanics[j]!;
      const leftExclusive = new Set(left.exclusiveTopologyMutations);
      const rightExclusive = new Set(right.exclusiveTopologyMutations);
      for (const [a, b] of EXCLUSIVE_PAIRS) {
        const clashes =
          (leftExclusive.has(a) && rightExclusive.has(b)) || (leftExclusive.has(b) && rightExclusive.has(a));
        if (clashes) {
          issues.push(
            issue(
              "mechanic.topology_conflict",
              `mechanics.${left.id}`,
              `Mechanics "${left.id}" and "${right.id}" request incompatible topology mutations (${a} vs ${b}).`,
            ),
          );
        }
      }
      const overlap = left.exclusiveTopologyMutations.filter((kind) => rightExclusive.has(kind));
      if (overlap.length > 0) {
        issues.push(
          issue(
            "mechanic.topology_conflict",
            `mechanics.${left.id}`,
            `Mechanics "${left.id}" and "${right.id}" both claim exclusive topology mutation "${overlap[0]}".`,
          ),
        );
      }
    }
  }
  return issues;
}

function validateLifecycleOrdering(
  mechanics: MechanicHandler[],
  bindings: MechanicBinding[],
  registry: MechanicLookup,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const order = new Map<string, number>();
  composeMechanics(bindings, registry).forEach((mechanic, index) => {
    order.set(mechanic.id, index);
  });
  for (const mechanic of mechanics) {
    const index = order.get(mechanic.id) ?? 0;
    for (const dependency of mechanic.dependencies) {
      const dependencyIndex = order.get(dependency);
      if (dependencyIndex !== undefined && dependencyIndex > index) {
        issues.push(
          issue(
            "mechanic.lifecycle_order",
            `mechanics.${mechanic.id}`,
            `Mechanic "${mechanic.id}" depends on "${dependency}" but is ordered first. The validator does not reorder automatically.`,
          ),
        );
      }
    }
  }
  return issues;
}

function validateStateOwnership(mechanics: MechanicHandler[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const owners = new Map<string, string>();
  for (const mechanic of mechanics) {
    const key = mechanic.id;
    const prior = owners.get(key);
    if (prior) {
      issues.push(
        issue(
          "mechanic.state_ownership",
          `mechanics.${mechanic.id}`,
          `Mechanics "${prior}" and "${mechanic.id}" cannot share the same state key.`,
        ),
      );
    }
    owners.set(key, mechanic.id);
  }
  return issues;
}
