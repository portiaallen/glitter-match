import type { IconRegistry } from "../icons/index.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import {
  ALLOWED_CELL_STATES,
  ALLOWED_OCCUPANT_STATES,
  DEFAULT_ALLOWED_CELL_STATES,
  DEFAULT_ALLOWED_OCCUPANT_STATES,
} from "./occupancy.js";
import type { PatternRegistry } from "./patterns.js";
import {
  DEFAULT_SEARCH_BOUNDS,
  DIRECTION_ROTATION_VOCABULARY,
  MATCH_MODES,
  STANDARD_DIRECTION_LABELS,
  type MatchAccessibility,
  type MatchMode,
  type MatchSearchBounds,
  type PatternId,
  type PatternSymmetry,
} from "./types.js";
import { UNIVERSAL_GLITTER_WILDCARD_ID } from "./wildcard.js";

export const MATCH_ENGINE_RULE_IDS = [
  "standard-cluster",
  "directional-aligned",
  "pattern-L",
  "pattern-T",
  "pattern-cross",
  "cluster",
  "cycle-ring",
  "graph-path",
  "directional-sequence",
  "authored-pattern",
] as const;

export type MatchEngineRuleId = (typeof MATCH_ENGINE_RULE_IDS)[number];

export type RequiredConnectivity = "graph-adjacent" | "authored-direction" | "pattern" | "cycle" | "path";

export interface MatchEngineRule {
  id: string;
  version: string;
  description: string;
  minMatchSize: number;
  maxMatchSize?: number;
  requiredConnectivity: RequiredConnectivity;
  traversal: {
    followAllowsMatch: boolean;
    followPortals: "board-policy" | "never" | "always";
    allowedDirections?: string[];
    preventInvalidCycles: boolean;
  };
  directionRequirements?: {
    labels: string[];
    vocabulary: typeof DIRECTION_ROTATION_VOCABULARY;
    inferFromCoordinates: false;
  };
  allowedCellStates: string[];
  allowedOccupantStates: string[];
  patternId: PatternId;
  wildcardBehavior: typeof UNIVERSAL_GLITTER_WILDCARD_ID;
  glitterInteraction: "join-ordinary-or-dev";
  specialMatchOutput?: { candidateType: string; minSize: number; priority: number };
  accessibility: MatchAccessibility;
  deterministic: true;
  debug: { explainSuccess: true; explainFailure: true };
  searchBounds: MatchSearchBounds;
  engineMode: MatchMode;
  symmetry: PatternSymmetry;
}

export const REGISTERED_DIRECTION_LABELS = [
  ...STANDARD_DIRECTION_LABELS,
  "ne",
  "nw",
  "se",
  "sw",
  "up",
  "down",
  "cw",
  "ccw",
  "in",
  "out",
  "forward",
  "back",
  "horizontal",
  "vertical",
  "diagonal",
] as const;

function a11y(matchType: string, description: string): MatchAccessibility {
  return {
    matchType,
    matchedCells: [],
    patternExplanation: description,
    stateChanges: "Matched occupants are eligible to clear after cascade consumes this result.",
    nonColorIndicator: matchType,
    audioCue: `match.${matchType}`,
    hapticCue: `match.${matchType}`,
  };
}

function baseRule(partial: Omit<MatchEngineRule, "version" | "wildcardBehavior" | "glitterInteraction" | "deterministic" | "debug" | "searchBounds" | "allowedCellStates" | "allowedOccupantStates" | "traversal"> & Partial<Pick<MatchEngineRule, "searchBounds" | "allowedCellStates" | "allowedOccupantStates" | "traversal">>): MatchEngineRule {
  return {
    version: "7.0.0",
    wildcardBehavior: UNIVERSAL_GLITTER_WILDCARD_ID,
    glitterInteraction: "join-ordinary-or-dev",
    deterministic: true,
    debug: { explainSuccess: true, explainFailure: true },
    searchBounds: { ...DEFAULT_SEARCH_BOUNDS, ...partial.searchBounds },
    allowedCellStates: [...(partial.allowedCellStates ?? DEFAULT_ALLOWED_CELL_STATES)],
    allowedOccupantStates: [...(partial.allowedOccupantStates ?? DEFAULT_ALLOWED_OCCUPANT_STATES)],
    traversal: partial.traversal ?? {
      followAllowsMatch: true,
      followPortals: "board-policy",
      preventInvalidCycles: true,
    },
    ...partial,
  };
}

export const BUILT_IN_MATCH_ENGINE_RULES: readonly MatchEngineRule[] = [
  baseRule({
    id: "standard-cluster",
    description: "Generic 3+ connected compatible occupants on the authored graph. No row/column assumption.",
    minMatchSize: 3,
    requiredConnectivity: "graph-adjacent",
    patternId: "cluster",
    engineMode: "cluster",
    symmetry: "graph-defined",
    specialMatchOutput: { candidateType: "cluster-special", minSize: 4, priority: 10 },
    accessibility: a11y("cluster", "Connected graph cluster of compatible icons."),
  }),
  baseRule({
    id: "cluster",
    description: "Connected-component matcher with optional size bounds.",
    minMatchSize: 3,
    requiredConnectivity: "graph-adjacent",
    patternId: "cluster",
    engineMode: "cluster",
    symmetry: "graph-defined",
    accessibility: a11y("cluster", "Connected graph cluster of compatible icons."),
  }),
  baseRule({
    id: "directional-aligned",
    description: "Walk a single authored direction label. Direction is edge metadata, never screen axes.",
    minMatchSize: 3,
    requiredConnectivity: "authored-direction",
    patternId: "straight",
    engineMode: "aligned",
    symmetry: "none",
    directionRequirements: {
      labels: [...STANDARD_DIRECTION_LABELS],
      vocabulary: DIRECTION_ROTATION_VOCABULARY,
      inferFromCoordinates: false,
    },
    specialMatchOutput: { candidateType: "line", minSize: 4, priority: 20 },
    accessibility: a11y("aligned", "Straight walk along one authored direction label."),
  }),
  baseRule({
    id: "pattern-L",
    description: "Two authored direction rays from a pivot (graph L, not a bitmap).",
    minMatchSize: 3,
    requiredConnectivity: "pattern",
    patternId: "L",
    engineMode: "corner",
    symmetry: "graph-defined",
    specialMatchOutput: { candidateType: "L", minSize: 3, priority: 30 },
    accessibility: a11y("L", "Two-ray authored junction."),
  }),
  baseRule({
    id: "pattern-T",
    description: "Three authored direction rays from a pivot.",
    minMatchSize: 3,
    requiredConnectivity: "pattern",
    patternId: "T",
    engineMode: "tee",
    symmetry: "graph-defined",
    specialMatchOutput: { candidateType: "T", minSize: 4, priority: 40 },
    accessibility: a11y("T", "Three-ray authored junction."),
  }),
  baseRule({
    id: "pattern-cross",
    description: "Four authored direction rays from a pivot.",
    minMatchSize: 3,
    requiredConnectivity: "pattern",
    patternId: "cross",
    engineMode: "cross",
    symmetry: "graph-defined",
    specialMatchOutput: { candidateType: "cross", minSize: 5, priority: 50 },
    accessibility: a11y("cross", "Four-ray authored junction."),
  }),
  baseRule({
    id: "cycle-ring",
    description: "Simple graph cycle of compatible occupants. Visual circularity is not required.",
    minMatchSize: 3,
    maxMatchSize: DEFAULT_SEARCH_BOUNDS.maxCycleLength,
    requiredConnectivity: "cycle",
    patternId: "ring",
    engineMode: "cycle",
    symmetry: "graph-defined",
    accessibility: a11y("cycle", "Simple cycle on the authored graph."),
  }),
  baseRule({
    id: "graph-path",
    description: "Simple path of compatible occupants using authored match edges.",
    minMatchSize: 3,
    maxMatchSize: DEFAULT_SEARCH_BOUNDS.maxPathLength,
    requiredConnectivity: "path",
    patternId: "path",
    engineMode: "path",
    symmetry: "none",
    accessibility: a11y("path", "Simple path of compatible occupants."),
  }),
  baseRule({
    id: "directional-sequence",
    description: "Follow an explicit sequence of authored direction labels from a start cell.",
    minMatchSize: 3,
    requiredConnectivity: "authored-direction",
    patternId: "directional-sequence",
    engineMode: "aligned",
    symmetry: "none",
    accessibility: a11y("directional-sequence", "Authored direction sequence walk."),
  }),
  baseRule({
    id: "authored-pattern",
    description: "Registered authored pattern of relative graph steps. Future content registers the shape.",
    minMatchSize: 3,
    requiredConnectivity: "pattern",
    patternId: "authored",
    engineMode: "aligned",
    symmetry: "none",
    accessibility: a11y("authored", "Registered authored graph pattern."),
  }),
];

export class MatchEngineRuleRegistry {
  private readonly rules = new Map<string, MatchEngineRule>();

  constructor(
    private readonly patterns: PatternRegistry,
    definitions: readonly MatchEngineRule[] = BUILT_IN_MATCH_ENGINE_RULES,
    private readonly knownIcons: ReadonlySet<string> = new Set(),
  ) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(rule: MatchEngineRule): void {
    const issues = validateMatchEngineRule(rule, this.patterns, this.knownIcons);
    if (this.rules.has(rule.id)) {
      issues.push(issue("match.duplicate_rule", `matchRules.${rule.id}`, `Match rule "${rule.id}" is already registered.`));
    }
    throwIfErrors(issues, "Invalid match rule");
    this.rules.set(rule.id, rule);
  }

  get(id: string): MatchEngineRule {
    const rule = this.rules.get(id);
    if (!rule) {
      throwIfErrors(
        [issue("match.unknown_rule", `matchRules.${id}`, `Unknown match rule "${id}". Register it before referencing it.`)],
        "Unknown match rule",
      );
      throw new Error("unreachable");
    }
    return rule;
  }

  has(id: string): boolean {
    return this.rules.has(id);
  }

  list(): MatchEngineRule[] {
    return [...this.rules.values()];
  }

  rulesForModes(modes: readonly MatchMode[]): MatchEngineRule[] {
    const selected: MatchEngineRule[] = [];
    const seen = new Set<string>();
    for (const mode of modes) {
      for (const rule of this.rules.values()) {
        if (rule.engineMode === mode && !seen.has(rule.id)) {
          // Prefer the canonical rule for each mode; skip helper aliases when both exist.
          if (mode === "cluster" && rule.id === "cluster" && this.rules.has("standard-cluster")) {
            continue;
          }
          if (mode === "aligned" && (rule.id === "directional-sequence" || rule.id === "authored-pattern")) {
            continue;
          }
          seen.add(rule.id);
          selected.push(rule);
        }
      }
    }
    return selected;
  }
}

export function validateMatchEngineRule(
  rule: MatchEngineRule,
  patterns: PatternRegistry,
  knownIcons: ReadonlySet<string> = new Set(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `matchRules.${rule.id}`;
  if (!rule.id || !/^[a-z0-9][a-z0-9.-]*$/i.test(rule.id)) {
    issues.push(issue("match.invalid_rule_id", `${path}.id`, `Invalid match rule id "${rule.id}".`));
  }
  if (!(MATCH_MODES as readonly string[]).includes(rule.engineMode)) {
    issues.push(issue("match.unknown_engine_mode", `${path}.engineMode`, `Unknown engine match mode "${rule.engineMode}".`));
  }
  if (!patterns.has(rule.patternId)) {
    issues.push(issue("match.invalid_pattern", `${path}.patternId`, `Unknown pattern "${rule.patternId}".`));
  }
  if (rule.minMatchSize < 2) {
    issues.push(issue("match.impossible_size", `${path}.minMatchSize`, "Minimum match size must be at least 2."));
  }
  if (rule.maxMatchSize !== undefined && rule.maxMatchSize < rule.minMatchSize) {
    issues.push(issue("match.impossible_size", `${path}.maxMatchSize`, "Maximum match size is smaller than minimum match size."));
  }
  if (rule.minMatchSize > rule.searchBounds.maxWalks && rule.requiredConnectivity !== "graph-adjacent") {
    issues.push(
      issue(
        "match.contradictory",
        `${path}.searchBounds`,
        "Minimum match size exceeds maxWalks; this search cannot succeed.",
      ),
    );
  }
  for (const state of rule.allowedCellStates) {
    if (!(ALLOWED_CELL_STATES as readonly string[]).includes(state)) {
      issues.push(issue("match.invalid_cell_state", `${path}.allowedCellStates`, `Unknown cell state "${state}".`));
    }
  }
  for (const state of rule.allowedOccupantStates) {
    if (!(ALLOWED_OCCUPANT_STATES as readonly string[]).includes(state)) {
      issues.push(issue("match.invalid_occupant_state", `${path}.allowedOccupantStates`, `Unknown occupant state "${state}".`));
    }
  }
  const labels = rule.directionRequirements?.labels ?? rule.traversal.allowedDirections ?? [];
  for (const label of labels) {
    if (!(REGISTERED_DIRECTION_LABELS as readonly string[]).includes(label)) {
      issues.push(issue("match.invalid_direction", `${path}.direction`, `Unknown direction label "${label}".`));
    }
  }
  if (rule.directionRequirements && rule.directionRequirements.inferFromCoordinates !== false) {
    issues.push(
      issue("match.coordinate_inference", `${path}.directionRequirements`, "Match rules must not infer direction from coordinates."),
    );
  }
  if (rule.wildcardBehavior !== UNIVERSAL_GLITTER_WILDCARD_ID) {
    issues.push(
      issue(
        "match.unknown_wildcard",
        `${path}.wildcardBehavior`,
        `Unknown wildcard behavior "${rule.wildcardBehavior}". Levels cannot invent wildcards.`,
      ),
    );
  }
  if (rule.glitterInteraction !== "join-ordinary-or-dev") {
    issues.push(
      issue("match.glitter_contract", `${path}.glitterInteraction`, "Glitter interaction must remain join-ordinary-or-dev."),
    );
  }
  if (!rule.deterministic) {
    issues.push(issue("match.nondeterministic", `${path}.deterministic`, "Match detection must be deterministic."));
  }
  if (!rule.accessibility.nonColorIndicator) {
    issues.push(issue("match.a11y", `${path}.accessibility`, "Match rules must declare a non-color indicator."));
  }
  if (knownIcons.size > 0 && !knownIcons.has("glitter")) {
    issues.push(issue("match.unknown_icon", `${path}.wildcardBehavior`, "Icon registry is missing the Glitter Icon."));
  }
  if (rule.specialMatchOutput && rule.specialMatchOutput.minSize < rule.minMatchSize) {
    issues.push(
      issue(
        "match.contradictory",
        `${path}.specialMatchOutput`,
        "Special-match candidate minSize is smaller than the rule minMatchSize.",
      ),
    );
  }
  return issues;
}

export function createMatchEngineRuleRegistry(
  patterns: PatternRegistry,
  iconRegistry?: IconRegistry,
): MatchEngineRuleRegistry {
  const known = new Set<string>();
  if (iconRegistry) {
    for (const record of iconRegistry.list()) {
      known.add(record.id);
    }
  }
  return new MatchEngineRuleRegistry(patterns, BUILT_IN_MATCH_ENGINE_RULES, known);
}
