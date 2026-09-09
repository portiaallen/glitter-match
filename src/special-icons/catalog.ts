import type { SpecialIconId } from "../ids.js";
import { issue, throwIfErrors } from "../validation.js";

/**
 * Universal Special Icons are inventory items.
 * They are NOT the same as Special Matches created from board patterns.
 */
export const SPECIAL_ICON_IDS = [
  "glitter-bomb",
  "glitter-hammer",
  "prism",
  "wild-card",
  "magic-swap",
  "glitter-lightning",
] as const;

export type CatalogSpecialIconId = (typeof SPECIAL_ICON_IDS)[number];

export interface SpecialIconDefinition {
  id: CatalogSpecialIconId;
  displayName: string;
  patternId: string;
  implemented: boolean;
  description: string;
}

export const SPECIAL_ICON_CATALOG: readonly SpecialIconDefinition[] = [
  { id: "glitter-bomb", displayName: "Glitter Bomb", patternId: "burst", implemented: false, description: "Reserved." },
  { id: "glitter-hammer", displayName: "Glitter Hammer", patternId: "strike", implemented: false, description: "Reserved." },
  { id: "prism", displayName: "Prism", patternId: "split", implemented: false, description: "Reserved." },
  { id: "wild-card", displayName: "Wild Card", patternId: "wild", implemented: false, description: "Reserved." },
  { id: "magic-swap", displayName: "Magic Swap", patternId: "swap", implemented: false, description: "Reserved." },
  { id: "glitter-lightning", displayName: "Glitter Lightning", patternId: "bolt", implemented: false, description: "Reserved." },
];

export type SpecialIconInventory = Record<CatalogSpecialIconId, number>;

export function createEmptySpecialInventory(): SpecialIconInventory {
  return {
    "glitter-bomb": 0,
    "glitter-hammer": 0,
    prism: 0,
    "wild-card": 0,
    "magic-swap": 0,
    "glitter-lightning": 0,
  };
}

export function addSpecialIcon(inventory: SpecialIconInventory, id: CatalogSpecialIconId, count = 1): void {
  inventory[id] += count;
}

export function consumeSpecialIcon(inventory: SpecialIconInventory, id: CatalogSpecialIconId): void {
  if (inventory[id] <= 0) {
    throwIfErrors(
      [issue("special.empty", `specialInventory.${id}`, `No ${id} remaining in inventory.`)],
      "Special Icon inventory empty",
    );
  }
  const definition = SPECIAL_ICON_CATALOG.find((item) => item.id === id)!;
  if (!definition.implemented) {
    throwIfErrors(
      [
        issue(
          "special.unimplemented",
          `specialIcons.${id}`,
          `${definition.displayName} is catalogued but has no gameplay implementation yet. Special Icons must remain optional assistance.`,
        ),
      ],
      "Special Icon not implemented",
    );
  }
  inventory[id] -= 1;
}

export function isSpecialIconId(id: SpecialIconId): id is CatalogSpecialIconId {
  return (SPECIAL_ICON_IDS as readonly string[]).includes(id);
}
