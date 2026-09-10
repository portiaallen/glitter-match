import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import type { PrimitiveEffect } from "../primitives/index.js";
import type { Board } from "../board/index.js";
import {
  ANCHOR_POLICIES,
  CONSUMPTION_POLICIES,
  CREATION_CELL_POLICIES,
  SPECIAL_MATCH_CATEGORIES,
  SPECIAL_MATCH_TRIGGERS,
  type AnchorPolicy,
  type ConsumptionPolicy,
  type CreationCellPolicy,
  type SpecialMatchAccessibility,
  type SpecialMatchCategory,
  type SpecialMatchInstance,
  type SpecialMatchTrigger,
} from "./types.js";

export interface SpecialMatchEffectContext {
  board: Board;
  instance: SpecialMatchInstance;
  trigger: SpecialMatchTrigger;
}

export interface SpecialMatchTypeDefinition {
  id: string;
  version: string;
  displayName: string;
  debugName: string;
  category: SpecialMatchCategory;
  creationEligibility: string[];
  anchorPolicy: AnchorPolicy;
  matchedCellPolicy: CreationCellPolicy;
  activationTriggers: SpecialMatchTrigger[];
  consumption: ConsumptionPolicy;
  priority: number;
  interactionWithOrdinaryMatches: string;
  interactionWithOtherSpecials: string;
  interactionWithCascades: string;
  interactionWithObstacles: string;
  interactionWithTopology: string;
  deterministic: true;
  accessibility: SpecialMatchAccessibility;
  debug: string;
  serialization: { roundTrip: true };
  validationNotes: string;
  testHarness: true;
  emitEffects: (ctx: SpecialMatchEffectContext) => PrimitiveEffect[];
}

export class SpecialMatchRegistry {
  private readonly types = new Map<string, SpecialMatchTypeDefinition>();

  register(definition: SpecialMatchTypeDefinition): void {
    const issues = validateSpecialMatchType(definition);
    if (this.types.has(definition.id)) {
      issues.push(issue("special.duplicate", `specialMatches.${definition.id}`, `Special Match type "${definition.id}" is already registered.`));
    }
    throwIfErrors(issues, "Invalid Special Match type");
    this.types.set(definition.id, definition);
  }

  get(id: string): SpecialMatchTypeDefinition {
    const type = this.types.get(id);
    if (!type) {
      throwIfErrors(
        [issue("special.unknown_type", `specialMatches.${id}`, `Unknown Special Match type "${id}". Register it before use.`)],
        "Unknown Special Match type",
      );
      throw new Error("unreachable");
    }
    return type;
  }

  has(id: string): boolean {
    return this.types.has(id);
  }

  list(): SpecialMatchTypeDefinition[] {
    return [...this.types.values()];
  }

  typeForCandidate(candidateType: string): SpecialMatchTypeDefinition | undefined {
    return [...this.types.values()].find((type) => type.creationEligibility.includes(candidateType));
  }
}

export function validateSpecialMatchType(definition: SpecialMatchTypeDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `specialMatches.${definition.id}`;
  if (!definition.id || !/^[a-z0-9][a-z0-9.-]*$/i.test(definition.id)) {
    issues.push(issue("special.invalid_id", `${path}.id`, `Invalid Special Match id "${definition.id}".`));
  }
  if (!definition.version) {
    issues.push(issue("special.invalid_version", `${path}.version`, "Special Match version is required."));
  }
  if (!(SPECIAL_MATCH_CATEGORIES as readonly string[]).includes(definition.category)) {
    issues.push(issue("special.invalid_category", `${path}.category`, `Unknown category "${definition.category}".`));
  }
  if (!(ANCHOR_POLICIES as readonly string[]).includes(definition.anchorPolicy)) {
    issues.push(issue("special.invalid_anchor_policy", `${path}.anchorPolicy`, `Unknown anchor policy "${definition.anchorPolicy}".`));
  }
  if (!(CREATION_CELL_POLICIES as readonly string[]).includes(definition.matchedCellPolicy)) {
    issues.push(issue("special.invalid_creation_policy", `${path}.matchedCellPolicy`, `Unknown creation policy "${definition.matchedCellPolicy}".`));
  }
  if (!(CONSUMPTION_POLICIES as readonly string[]).includes(definition.consumption)) {
    issues.push(issue("special.invalid_consumption", `${path}.consumption`, `Unknown consumption policy "${definition.consumption}".`));
  }
  if (definition.creationEligibility.length === 0) {
    issues.push(issue("special.no_eligibility", `${path}.creationEligibility`, "A Special Match type must declare candidate eligibility."));
  }
  for (const trigger of definition.activationTriggers) {
    if (!(SPECIAL_MATCH_TRIGGERS as readonly string[]).includes(trigger)) {
      issues.push(issue("special.unknown_trigger", `${path}.activationTriggers`, `Unknown trigger "${trigger}".`));
    }
  }
  if (!definition.deterministic) {
    issues.push(issue("special.nondeterministic", `${path}.deterministic`, "Special Match types must be deterministic."));
  }
  if (!definition.accessibility.nonColorIndicator) {
    issues.push(issue("special.a11y", `${path}.accessibility`, "Special Matches must declare a non-color indicator."));
  }
  if (typeof definition.emitEffects !== "function") {
    issues.push(issue("special.missing_handler", `${path}.emitEffects`, "Special Match types must register an effect handler. Do not branch on type in the cascade engine."));
  }
  return issues;
}
