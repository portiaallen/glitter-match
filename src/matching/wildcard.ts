import { GLITTER_ICON_ID, type IconId } from "../ids.js";
import type { IconRegistry } from "../icons/index.js";
import { issue, throwIfErrors } from "../validation.js";
import { iconsCompatible, isGlitter } from "./compatibility.js";

/**
 * Wildcard behavior is a registered contract. Levels cannot invent wildcards.
 * The Universal Glitter Icon is the only shipped wildcard and keeps its
 * existing universal-match contract (join ordinary/dev; no solo glitter group).
 */
export const UNIVERSAL_GLITTER_WILDCARD_ID = "universal-glitter" as const;

export interface WildcardContract {
  id: string;
  version: string;
  description: string;
  iconId: IconId;
  mayJoinKinds: Array<"ordinary" | "dev" | "glitter">;
  mayFormSoloGroup: boolean;
  inventableByLevels: false;
  glitterProtected: boolean;
}

export const UNIVERSAL_GLITTER_WILDCARD: WildcardContract = {
  id: UNIVERSAL_GLITTER_WILDCARD_ID,
  version: "7.0.0",
  description:
    "Universal Glitter Icon may join ordinary/dev colors. Pure-glitter groups are ignored. No extra Glitter powers.",
  iconId: GLITTER_ICON_ID,
  mayJoinKinds: ["ordinary", "dev", "glitter"],
  mayFormSoloGroup: false,
  inventableByLevels: false,
  glitterProtected: true,
};

export class WildcardRegistry {
  private readonly contracts = new Map<string, WildcardContract>();

  constructor(definitions: readonly WildcardContract[] = [UNIVERSAL_GLITTER_WILDCARD]) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: WildcardContract): void {
    if (definition.inventableByLevels !== false) {
      throwIfErrors(
        [issue("wildcard.inventable", `wildcards.${definition.id}`, "Wildcard contracts cannot be invented per level.")],
        "Invalid wildcard contract",
      );
    }
    if (this.contracts.has(definition.id)) {
      throwIfErrors(
        [issue("wildcard.duplicate", `wildcards.${definition.id}`, `Wildcard "${definition.id}" is already registered.`)],
        "Duplicate wildcard contract",
      );
    }
    if (definition.glitterProtected && definition.iconId !== GLITTER_ICON_ID) {
      throwIfErrors(
        [
          issue(
            "wildcard.glitter_protected",
            `wildcards.${definition.id}`,
            "The protected Glitter wildcard must use icon id \"glitter\".",
          ),
        ],
        "Invalid wildcard contract",
      );
    }
    this.contracts.set(definition.id, definition);
  }

  get(id: string): WildcardContract {
    const contract = this.contracts.get(id);
    if (!contract) {
      throwIfErrors(
        [issue("wildcard.unknown", `wildcards.${id}`, `Unknown wildcard contract "${id}". Register it before use.`)],
        "Unknown wildcard contract",
      );
      throw new Error("unreachable");
    }
    return contract;
  }

  byIcon(iconId: IconId): WildcardContract | undefined {
    return [...this.contracts.values()].find((contract) => contract.iconId === iconId);
  }

  list(): WildcardContract[] {
    return [...this.contracts.values()];
  }

  isRegisteredWildcard(iconId: IconId): boolean {
    return Boolean(this.byIcon(iconId));
  }
}

export function createWildcardRegistry(): WildcardRegistry {
  return new WildcardRegistry();
}

export function glitterMayJoin(iconId: IconId, registry: IconRegistry): boolean {
  if (isGlitter(iconId)) {
    return true;
  }
  return iconsCompatible(GLITTER_ICON_ID, iconId, registry);
}
