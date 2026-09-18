/** Canonical identifiers. Stringly-typed so level JSON stays author-friendly. */

export const LAND_IDS = [
  "lumina",
  "glimmer",
  "bloomara",
  "transcendia",
  "quintara",
  "iridescia",
  "aurelia",
  "infinity-isles",
] as const;

export type LandId = (typeof LAND_IDS)[number];

export type CellId = string;
export type IconId = string;
export type LevelId = string;
export type ObstacleTypeId = string;
export type MechanicId = string;
export type SpecialIconId = string;
export type ObjectiveId = string;
export type SectionId = string;
export type DirectionLabel = string;

export const GLITTER_ICON_ID = "glitter" as const;
export type GlitterIconId = typeof GLITTER_ICON_ID;
