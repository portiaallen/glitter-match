import { GLITTER_ICON_ID, LAND_IDS, type IconId, type LandId } from "../ids.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";

export type IconKind = "ordinary" | "glitter" | "special" | "dev";

export interface IconPresentation {
  /** Human-readable name. Required so information is not color-only. */
  displayName: string;
  /** Non-color pattern/shape token for accessibility and debug. */
  patternId: string;
  audioCueId?: string;
}

interface IconBase {
  id: IconId;
  presentation: IconPresentation;
}

export interface OrdinaryIcon extends IconBase {
  kind: "ordinary";
  landId: LandId;
}

export interface GlitterIcon extends IconBase {
  kind: "glitter";
  landId: null;
}

export interface SpecialIconRecord extends IconBase {
  kind: "special";
  universal: true;
  implemented: boolean;
}

export interface DevIcon extends IconBase {
  kind: "dev";
  note: string;
}

export type IconRecord = OrdinaryIcon | GlitterIcon | SpecialIconRecord | DevIcon;

export class IconRegistry {
  private readonly icons = new Map<IconId, IconRecord>();
  private readonly ordinaryByLand = new Map<LandId, Set<IconId>>();

  constructor() {
    for (const land of LAND_IDS) {
      this.ordinaryByLand.set(land, new Set());
    }
  }

  register(icon: IconRecord): void {
    const existing = this.icons.get(icon.id);
    if (existing) {
      throwIfErrors(
        [
          issue(
            "icon.duplicate_id",
            `icons.${icon.id}`,
            `Icon "${icon.id}" is already registered as ${existing.kind}` +
              `${existing.kind === "ordinary" ? ` (${existing.landId})` : ""}. ONE LAND. ONE ICON FAMILY. ZERO DUPLICATES.`,
          ),
        ],
        "Icon registry rejected duplicate identity",
      );
    }

    if (icon.kind === "ordinary") {
      const family = this.ordinaryByLand.get(icon.landId);
      if (!family) {
        throwIfErrors(
          [issue("icon.unknown_land", `icons.${icon.id}`, `Ordinary icon references unknown land "${icon.landId}".`)],
          "Icon registry rejected unknown land",
        );
        return;
      }
      family.add(icon.id);
    }

    if (icon.kind === "glitter" && icon.id !== GLITTER_ICON_ID) {
      throwIfErrors(
        [
          issue(
            "icon.glitter_id",
            `icons.${icon.id}`,
            `The Glitter Icon must use the canonical id "${GLITTER_ICON_ID}".`,
          ),
        ],
        "Icon registry rejected Glitter Icon id",
      );
    }

    this.icons.set(icon.id, icon);
  }

  get(id: IconId): IconRecord {
    const icon = this.icons.get(id);
    if (!icon) {
      throwIfErrors(
        [issue("icon.unknown", `icons.${id}`, `Unknown icon "${id}".`)],
        "Unknown icon",
      );
      throw new Error("unreachable");
    }
    return icon;
  }

  has(id: IconId): boolean {
    return this.icons.has(id);
  }

  list(): IconRecord[] {
    return [...this.icons.values()];
  }

  ordinaryIconsFor(landId: LandId): OrdinaryIcon[] {
    const ids = this.ordinaryByLand.get(landId) ?? new Set();
    return [...ids].map((id) => this.get(id) as OrdinaryIcon);
  }

  validateIntegrity(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const glitter = [...this.icons.values()].filter((icon) => icon.kind === "glitter");
    if (glitter.length === 0) {
      issues.push(
        issue("icon.missing_glitter", "icons.glitter", "The Glitter Icon must be registered as a universal identity."),
      );
    }
    if (glitter.length > 1) {
      issues.push(issue("icon.multiple_glitter", "icons.glitter", "There can be only one Glitter Icon identity."));
    }

    const seenNames = new Map<string, IconRecord>();
    for (const icon of this.icons.values()) {
      if (icon.kind === "ordinary") {
        const key = icon.presentation.displayName.toLowerCase();
        const prior = seenNames.get(key);
        if (prior && prior.kind === "ordinary" && prior.landId !== icon.landId) {
          issues.push(
            issue(
              "icon.duplicate_family_name",
              `icons.${icon.id}`,
              `Display name "${icon.presentation.displayName}" is used by ${prior.landId}/${prior.id} and ${icon.landId}/${icon.id}. Ordinary families cannot be duplicated across Lands.`,
            ),
          );
        }
        seenNames.set(key, icon);
      }
      if (icon.kind === "glitter" && icon.landId !== null) {
        issues.push(issue("icon.glitter_has_land", "icons.glitter", "The Glitter Icon belongs to no Land."));
      }
    }
    return issues;
  }
}

export function createGlitterIcon(): GlitterIcon {
  return {
    id: GLITTER_ICON_ID,
    kind: "glitter",
    landId: null,
    presentation: {
      displayName: "Glitter Icon",
      patternId: "universal-spark",
      audioCueId: "glitter-chime",
    },
  };
}

export function createEmptyIconRegistry(): IconRegistry {
  const registry = new IconRegistry();
  registry.register(createGlitterIcon());
  return registry;
}
