import { issue, throwIfErrors } from "../validation.js";
import { MATCH_MODES, type MatchMode } from "./types.js";

/**
 * Author-facing match-rule vocabulary. Engine modes stay registered here
 * so new combinations can be added without rewriting detect/cascade.
 */
export const MATCH_CONTRACT_IDS = [
  "standard-3+",
  "horizontal",
  "vertical",
  "diagonal",
  "L",
  "T",
  "cross",
  "cluster",
  "pattern",
  "directional",
  "land-registered",
] as const;

export type MatchContractId = (typeof MATCH_CONTRACT_IDS)[number];

export interface MatchContractDefinition {
  id: MatchContractId;
  engineModes: MatchMode[];
  implemented: boolean;
  description: string;
  /** Authored direction labels that count as this vocabulary. Never inferred from x/y. */
  orientationLabels?: string[];
}

export const MATCH_CONTRACT_CATALOG: readonly MatchContractDefinition[] = [
  { id: "standard-3+", engineModes: ["cluster"], implemented: true, description: "Default 3+ connectivity cluster." },
  { id: "cluster", engineModes: ["cluster"], implemented: true, description: "Connected component of compatible icons." },
  { id: "horizontal", engineModes: ["aligned"], implemented: true, description: "Aligned walk along authored horizontal-looking labels.", orientationLabels: ["e", "w", "horizontal"] },
  { id: "vertical", engineModes: ["aligned"], implemented: true, description: "Aligned walk along authored vertical-looking labels.", orientationLabels: ["n", "s", "vertical"] },
  { id: "diagonal", engineModes: ["aligned"], implemented: true, description: "Aligned walk along authored diagonal-looking labels.", orientationLabels: ["ne", "nw", "se", "sw", "diagonal"] },
  { id: "L", engineModes: ["corner"], implemented: true, description: "Authored two-ray junction." },
  { id: "T", engineModes: ["tee"], implemented: true, description: "Authored three-ray junction." },
  { id: "cross", engineModes: ["cross"], implemented: true, description: "Authored four-ray junction." },
  { id: "pattern", engineModes: ["aligned", "corner", "tee", "cross"], implemented: true, description: "Generic authored pattern matching." },
  { id: "directional", engineModes: ["aligned"], implemented: true, description: "Path-based walk of authored direction labels." },
  { id: "land-registered", engineModes: ["cluster"], implemented: false, description: "Reserved. Land-specific match rules register a handler; the engine never branches on land id." },
];

export class MatchRuleRegistry {
  private readonly contracts = new Map<string, MatchContractDefinition>();

  constructor(definitions: readonly MatchContractDefinition[] = MATCH_CONTRACT_CATALOG) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: MatchContractDefinition): void {
    if (this.contracts.has(definition.id)) {
      throwIfErrors(
        [issue("match.duplicate_contract", `matchContracts.${definition.id}`, `Match contract "${definition.id}" is already registered.`)],
        "Duplicate match contract",
      );
    }
    for (const mode of definition.engineModes) {
      if (!(MATCH_MODES as readonly string[]).includes(mode)) {
        throwIfErrors(
          [issue("match.unknown_engine_mode", `matchContracts.${definition.id}`, `Unknown engine match mode "${mode}".`)],
          "Invalid match contract",
        );
      }
    }
    this.contracts.set(definition.id, definition);
  }

  get(id: string): MatchContractDefinition {
    const contract = this.contracts.get(id);
    if (!contract) {
      throwIfErrors(
        [issue("match.unknown_contract", `matchContracts.${id}`, `Unknown match contract "${id}". Register it before referencing it.`)],
        "Unknown match contract",
      );
      throw new Error("unreachable");
    }
    return contract;
  }

  has(id: string): boolean {
    return this.contracts.has(id);
  }

  list(): MatchContractDefinition[] {
    return [...this.contracts.values()];
  }

  engineModesFor(ids: readonly string[]): MatchMode[] {
    const modes = new Set<MatchMode>();
    for (const id of ids) {
      for (const mode of this.get(id).engineModes) {
        modes.add(mode);
      }
    }
    return [...modes];
  }
}

export function createMatchRuleRegistry(): MatchRuleRegistry {
  return new MatchRuleRegistry();
}
