import type { LandId } from "../ids.js";
import { CONTENT_VERSION } from "./versions.js";
import type { OrdinaryIcon } from "../icons/index.js";

export const ORDINARY_ICONS_PER_LAND = 8;

interface CanonicalIconSpec {
  slug: string;
  displayName: string;
  patternId: string;
  notes?: string;
}

const FAMILIES: Record<LandId, readonly CanonicalIconSpec[]> = {
  lumina: [
    { slug: "lion", displayName: "Lion", patternId: "lion" },
    { slug: "rose", displayName: "Rose", patternId: "rose" },
    { slug: "lipstick", displayName: "Lipstick", patternId: "lipstick" },
    { slug: "heart-lock", displayName: "Heart Lock", patternId: "heart-lock" },
    { slug: "sunburst", displayName: "Sunburst", patternId: "sunburst" },
    { slug: "high-heel", displayName: "High Heel", patternId: "high-heel" },
    { slug: "perfume-bottle", displayName: "Perfume Bottle", patternId: "perfume" },
    { slug: "diamond-ring", displayName: "Diamond Ring", patternId: "ring" },
  ],
  glimmer: [
    { slug: "disco-ball", displayName: "Disco Ball", patternId: "disco" },
    { slug: "microphone", displayName: "Microphone", patternId: "mic" },
    { slug: "headphones", displayName: "Headphones", patternId: "headphones" },
    {
      slug: "champagne-glass",
      displayName: "Champagne Glass",
      patternId: "flute",
      notes: "Decorative / non-alcoholic visual theme. Must never become an alcohol mechanic.",
    },
    { slug: "boombox", displayName: "Boombox", patternId: "boombox" },
    { slug: "stage-light", displayName: "Stage Light", patternId: "spotlight" },
    { slug: "confetti-popper", displayName: "Confetti Popper", patternId: "confetti" },
    { slug: "vinyl-record", displayName: "Vinyl Record", patternId: "vinyl" },
  ],
  bloomara: [
    { slug: "butterfly", displayName: "Butterfly", patternId: "butterfly" },
    { slug: "two-toned-flower", displayName: "Two-Toned Flower", patternId: "flower" },
    { slug: "yin-yang-sun", displayName: "Yin-Yang Sun", patternId: "yin-yang-sun" },
    { slug: "mirror", displayName: "Mirror", patternId: "mirror" },
    { slug: "twin-moons", displayName: "Twin Moons", patternId: "twin-moons" },
    { slug: "double-spiral", displayName: "Double Spiral", patternId: "double-spiral" },
    { slug: "paired-doves", displayName: "Paired Doves", patternId: "doves" },
    { slug: "hourglass", displayName: "Hourglass", patternId: "hourglass" },
  ],
  transcendia: [
    { slug: "phoenix", displayName: "Phoenix", patternId: "phoenix" },
    { slug: "moth", displayName: "Moth", patternId: "moth" },
    { slug: "open-door", displayName: "Open Door", patternId: "door" },
    { slug: "stairway", displayName: "Stairway", patternId: "stairs" },
    { slug: "cocoon", displayName: "Cocoon", patternId: "cocoon" },
    { slug: "wings", displayName: "Wings", patternId: "wings" },
    { slug: "rising-star", displayName: "Rising Star", patternId: "rising-star" },
    { slug: "keyhole", displayName: "Keyhole", patternId: "keyhole" },
  ],
  quintara: [
    { slug: "crystal-ball", displayName: "Crystal Ball", patternId: "crystal-ball" },
    { slug: "joker-card", displayName: "Joker Card", patternId: "joker" },
    { slug: "magic-hat", displayName: "Magic Hat", patternId: "hat" },
    { slug: "third-eye", displayName: "Third Eye", patternId: "third-eye" },
    { slug: "labyrinth", displayName: "Labyrinth", patternId: "labyrinth" },
    { slug: "question-mark", displayName: "Question Mark", patternId: "question" },
    { slug: "cheshire-cat", displayName: "Cheshire Cat", patternId: "cheshire" },
    { slug: "portal", displayName: "Portal", patternId: "portal" },
  ],
  iridescia: [
    { slug: "peacock", displayName: "Peacock", patternId: "peacock" },
    { slug: "jellyfish", displayName: "Jellyfish", patternId: "jellyfish" },
    { slug: "seashell", displayName: "Seashell", patternId: "seashell" },
    { slug: "unicorn", displayName: "Unicorn", patternId: "unicorn" },
    { slug: "opal", displayName: "Opal", patternId: "opal" },
    { slug: "hummingbird", displayName: "Hummingbird", patternId: "hummingbird" },
    { slug: "dragonfly", displayName: "Dragonfly", patternId: "dragonfly" },
    { slug: "aurora", displayName: "Aurora", patternId: "aurora" },
  ],
  aurelia: [
    { slug: "throne", displayName: "Throne", patternId: "throne" },
    { slug: "swan", displayName: "Swan", patternId: "swan" },
    { slug: "scepter", displayName: "Scepter", patternId: "scepter" },
    { slug: "shield", displayName: "Shield", patternId: "shield" },
    { slug: "laurel", displayName: "Laurel", patternId: "laurel" },
    { slug: "chess-queen", displayName: "Chess Queen", patternId: "queen" },
    { slug: "golden-apple", displayName: "Golden Apple", patternId: "apple" },
    { slug: "royal-seal", displayName: "Royal Seal", patternId: "seal" },
  ],
  "infinity-isles": [
    { slug: "galaxy", displayName: "Galaxy", patternId: "galaxy" },
    { slug: "telescope", displayName: "Telescope", patternId: "telescope" },
    { slug: "comet", displayName: "Comet", patternId: "comet" },
    { slug: "meteor", displayName: "Meteor", patternId: "meteor" },
    { slug: "satellite", displayName: "Satellite", patternId: "satellite" },
    { slug: "nebula", displayName: "Nebula", patternId: "nebula" },
    { slug: "constellation", displayName: "Constellation", patternId: "constellation" },
    { slug: "astronaut-helmet", displayName: "Astronaut Helmet", patternId: "helmet" },
  ],
};

export function ordinaryIconId(landId: LandId, slug: string): string {
  return `${landId}.${slug}`;
}

export function canonicalOrdinaryIcons(): OrdinaryIcon[] {
  const icons: OrdinaryIcon[] = [];
  for (const [landId, family] of Object.entries(FAMILIES) as Array<[LandId, readonly CanonicalIconSpec[]]>) {
    for (const spec of family) {
      icons.push({
        id: ordinaryIconId(landId, spec.slug),
        kind: "ordinary",
        landId,
        familyId: `${landId}.ordinary`,
        contentVersion: CONTENT_VERSION,
        notes: spec.notes,
        presentation: {
          displayName: spec.displayName,
          patternId: spec.patternId,
        },
      });
    }
  }
  return icons;
}

export function canonicalFamilySlugs(): Record<LandId, string[]> {
  return Object.fromEntries(
    (Object.entries(FAMILIES) as Array<[LandId, readonly CanonicalIconSpec[]]>).map(([landId, family]) => [
      landId,
      family.map((spec) => spec.slug),
    ]),
  ) as Record<LandId, string[]>;
}
