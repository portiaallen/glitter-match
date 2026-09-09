import { issue, throwIfErrors } from "../validation.js";
import { OBJECTIVE_TYPES, type ObjectiveType } from "./model.js";

export interface ObjectiveTypeSpec {
  type: ObjectiveType;
  implemented: boolean;
  description: string;
  accessibilityHint: string;
  supportsFailure: boolean;
  supportsDependencies: boolean;
}

export const OBJECTIVE_CATALOG: readonly ObjectiveTypeSpec[] = [
  { type: "collection", implemented: true, description: "Collect N of an icon.", accessibilityHint: "Collection progress is numeric.", supportsFailure: false, supportsDependencies: true },
  { type: "clearing", implemented: true, description: "Clear authored cells.", accessibilityHint: "Clearing progress is cell count.", supportsFailure: false, supportsDependencies: true },
  { type: "path", implemented: true, description: "Connect start to end.", accessibilityHint: "Path progress names cells.", supportsFailure: false, supportsDependencies: true },
  { type: "score", implemented: true, description: "Reach a score.", accessibilityHint: "Score is numeric.", supportsFailure: false, supportsDependencies: true },
  { type: "combo", implemented: true, description: "Reach a combo.", accessibilityHint: "Combo is numeric.", supportsFailure: false, supportsDependencies: true },
  { type: "precision", implemented: true, description: "Finish within a move budget.", accessibilityHint: "Moves remaining are spoken.", supportsFailure: true, supportsDependencies: true },
  { type: "survival", implemented: true, description: "Survive N cascades.", accessibilityHint: "Cascade count is numeric.", supportsFailure: true, supportsDependencies: true },
  { type: "pattern", implemented: true, description: "Form an authored occupancy pattern.", accessibilityHint: "Pattern names cells and icons.", supportsFailure: false, supportsDependencies: true },
  { type: "discovery", implemented: true, description: "Reveal authored hidden cells.", accessibilityHint: "Discovery names revealed cells.", supportsFailure: false, supportsDependencies: true },
  { type: "multi-stage", implemented: true, description: "Complete stages in order.", accessibilityHint: "Stage index is announced.", supportsFailure: true, supportsDependencies: true },
  { type: "hybrid", implemented: true, description: "Combine child objectives.", accessibilityHint: "Hybrid reports each child.", supportsFailure: true, supportsDependencies: true },
];

export class ObjectiveRegistry {
  private readonly types = new Map<ObjectiveType, ObjectiveTypeSpec>();

  constructor(specs: readonly ObjectiveTypeSpec[] = OBJECTIVE_CATALOG) {
    for (const spec of specs) {
      this.register(spec);
    }
  }

  register(spec: ObjectiveTypeSpec): void {
    if (this.types.has(spec.type)) {
      throwIfErrors(
        [issue("objective.duplicate_type", `objectives.${spec.type}`, `Objective type "${spec.type}" is already registered.`)],
        "Duplicate objective type",
      );
    }
    if (!(OBJECTIVE_TYPES as readonly string[]).includes(spec.type)) {
      throwIfErrors(
        [issue("objective.unknown_register", `objectives.${spec.type}`, `Cannot register unknown objective type "${spec.type}".`)],
        "Unknown objective type",
      );
    }
    this.types.set(spec.type, spec);
  }

  get(type: ObjectiveType): ObjectiveTypeSpec {
    const spec = this.types.get(type);
    if (!spec) {
      throwIfErrors(
        [issue("objective.unregistered", `objectives.${type}`, `Objective type "${type}" is not registered.`)],
        "Unregistered objective type",
      );
      throw new Error("unreachable");
    }
    return spec;
  }

  has(type: string): type is ObjectiveType {
    return this.types.has(type as ObjectiveType);
  }

  list(): ObjectiveTypeSpec[] {
    return [...this.types.values()];
  }
}

export function createObjectiveRegistry(): ObjectiveRegistry {
  return new ObjectiveRegistry();
}
