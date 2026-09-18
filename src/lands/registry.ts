import { LAND_IDS, type LandId } from "../ids.js";
import { issue, type ValidationIssue } from "../validation.js";
import { LAND_CATALOG } from "./catalog.js";
import type { LandDefinition } from "./dna.js";

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
    for (const land of this.lands.values()) {
      if (!land.philosophicalQuestion) {
        issues.push(issue("land.question_missing", `lands.${land.id}`, `Land "${land.id}" must declare its question.`));
      }
      if (!land.iconFamilyId) {
        issues.push(issue("land.family_missing", `lands.${land.id}`, `Land "${land.id}" must reference an icon family.`));
      }
      if (land.slug && land.slug !== land.id) {
        issues.push(issue("land.slug_mismatch", `lands.${land.id}.slug`, `Land slug must equal id.`));
      }
    }
    return issues;
  }
}

export function createLandRegistry(definitions: readonly LandDefinition[] = LAND_CATALOG): LandRegistry {
  return new LandRegistry(definitions);
}

export function isLandId(value: string): value is LandId {
  return (LAND_IDS as readonly string[]).includes(value);
}

export { LAND_CATALOG } from "./catalog.js";
export type { LandDefinition } from "./dna.js";
