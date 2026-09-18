import { LAND_IDS, type LandId } from "../ids.js";
import { issue, type ValidationIssue } from "../validation.js";
import type { AccessibilitySettings } from "../ui/accessibility.js";
import { DEFAULT_ACCESSIBILITY } from "../ui/accessibility.js";

export interface LandDefinition {
  id: LandId;
  displayName: string;
  philosophicalQuestion: string;
  iconFamilyId: string;
  boardLanguage: string;
  mechanicHandlerId: string;
  progression: {
    order: number;
    packPrefix: string;
  };
  accessibilityDefaults: AccessibilitySettings;
  visualIdentity?: string;
  movementLanguage?: string;
  audioIdentity?: string;
  narrativeIdentity?: string;
}

export const LAND_CATALOG: readonly LandDefinition[] = [
  {
    id: "lumina",
    displayName: "Lumina",
    philosophicalQuestion: "Who are you?",
    iconFamilyId: "lumina.ordinary",
    boardLanguage: "identity-silhouette",
    mechanicHandlerId: "land.lumina",
    progression: { order: 1, packPrefix: "lumina" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "self-recognition",
  },
  {
    id: "glimmer",
    displayName: "Glimmer",
    philosophicalQuestion: "How do you express yourself?",
    iconFamilyId: "glimmer.ordinary",
    boardLanguage: "performance-stage",
    mechanicHandlerId: "land.glimmer",
    progression: { order: 2, packPrefix: "glimmer" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "expression",
  },
  {
    id: "bloomara",
    displayName: "Bloomara",
    philosophicalQuestion: "What connects you?",
    iconFamilyId: "bloomara.ordinary",
    boardLanguage: "paired-chambers",
    mechanicHandlerId: "land.bloomara",
    progression: { order: 3, packPrefix: "bloomara" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "connection",
  },
  {
    id: "transcendia",
    displayName: "Transcendia",
    philosophicalQuestion: "What are you becoming?",
    iconFamilyId: "transcendia.ordinary",
    boardLanguage: "ascent-path",
    mechanicHandlerId: "land.transcendia",
    progression: { order: 4, packPrefix: "transcendia" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "becoming",
  },
  {
    id: "quintara",
    displayName: "Quintara",
    philosophicalQuestion: "What do you believe?",
    iconFamilyId: "quintara.ordinary",
    boardLanguage: "belief-labyrinth",
    mechanicHandlerId: "land.quintara",
    progression: { order: 5, packPrefix: "quintara" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "belief",
  },
  {
    id: "iridescia",
    displayName: "Iridescia",
    philosophicalQuestion: "Can you flow?",
    iconFamilyId: "iridescia.ordinary",
    boardLanguage: "flow-current",
    mechanicHandlerId: "land.iridescia",
    progression: { order: 6, packPrefix: "iridescia" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "flow",
  },
  {
    id: "aurelia",
    displayName: "Aurelia",
    philosophicalQuestion: "What will you protect?",
    iconFamilyId: "aurelia.ordinary",
    boardLanguage: "ward-and-throne",
    mechanicHandlerId: "land.aurelia",
    progression: { order: 7, packPrefix: "aurelia" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "protection",
  },
  {
    id: "infinity-isles",
    displayName: "Infinity Isles",
    philosophicalQuestion: "What is possible?",
    iconFamilyId: "infinity-isles.ordinary",
    boardLanguage: "possibility-archipelago",
    mechanicHandlerId: "land.infinity-isles",
    progression: { order: 8, packPrefix: "infinity-isles" },
    accessibilityDefaults: { ...DEFAULT_ACCESSIBILITY },
    narrativeIdentity: "possibility",
  },
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
    for (const land of this.lands.values()) {
      if (!land.philosophicalQuestion) {
        issues.push(issue("land.question_missing", `lands.${land.id}`, `Land "${land.id}" must declare its question.`));
      }
      if (!land.iconFamilyId) {
        issues.push(issue("land.family_missing", `lands.${land.id}`, `Land "${land.id}" must reference an icon family.`));
      }
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
