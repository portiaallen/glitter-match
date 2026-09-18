import { LAND_IDS, type LandId } from "../ids.js";
import { issue, type ValidationIssue } from "../validation.js";

export interface LandDefinition {
  id: LandId;
  displayName: string;
  /** Slots for future content. Empty on purpose in this foundation phase. */
  visualIdentity?: string;
  boardLanguage?: string;
  movementLanguage?: string;
  audioIdentity?: string;
  narrativeIdentity?: string;
}

export const LAND_CATALOG: readonly LandDefinition[] = [
  { id: "lumina", displayName: "Lumina" },
  { id: "glimmer", displayName: "Glimmer" },
  { id: "bloomara", displayName: "Bloomara" },
  { id: "transcendia", displayName: "Transcendia" },
  { id: "quintara", displayName: "Quintara" },
  { id: "iridescia", displayName: "Iridescia" },
  { id: "aurelia", displayName: "Aurelia" },
  { id: "infinity-isles", displayName: "Infinity Isles" },
] as const;

export class LandRegistry {
  private readonly lands = new Map<LandId, LandDefinition>();

  constructor(definitions: readonly LandDefinition[] = LAND_CATALOG) {
    for (const land of definitions) {
      this.lands.set(land.id, { ...land });
    }
  }

  get(id: LandId): LandDefinition {
    const land = this.lands.get(id);
    if (!land) {
      throw new Error(`Unknown land "${id}". The eight Lands are fixed.`);
    }
    return land;
  }

  has(id: string): id is LandId {
    return this.lands.has(id as LandId);
  }

  list(): LandDefinition[] {
    return LAND_IDS.map((id) => this.get(id));
  }

  validateIntegrity(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const id of LAND_IDS) {
      if (!this.lands.has(id)) {
        issues.push(issue("land.missing", `lands.${id}`, `Required land "${id}" is not registered.`));
      }
    }
    if (this.lands.size !== LAND_IDS.length) {
      issues.push(
        issue(
          "land.count",
          "lands",
          `Expected exactly ${LAND_IDS.length} Lands. Do not invent additional Lands.`,
        ),
      );
    }
    return issues;
  }
}

export function createLandRegistry(): LandRegistry {
  return new LandRegistry();
}

export function isLandId(value: string): value is LandId {
  return (LAND_IDS as readonly string[]).includes(value);
}
