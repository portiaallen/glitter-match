/**
 * Laboratory fixture catalog. Shape names are labels for humans.
 * The engine never branches on these ids.
 */
export const LAB_FIXTURE_IDS = [
  "lab.diamond",
  "lab.heart",
  "lab.ring",
  "lab.spiral",
  "lab.twin-chambers",
  "lab.irregular-islands",
  "lab.cascade-chain",
  "lab.dead-board",
  "lab.seeded-fill",
] as const;

export type LabFixtureId = (typeof LAB_FIXTURE_IDS)[number];

export const LAB_FIXTURE_FILES: Record<LabFixtureId, string> = {
  "lab.diamond": "data/lab/diamond.json",
  "lab.heart": "data/lab/heart.json",
  "lab.ring": "data/lab/ring.json",
  "lab.spiral": "data/lab/spiral.json",
  "lab.twin-chambers": "data/lab/twin-chambers.json",
  "lab.irregular-islands": "data/lab/irregular-islands.json",
  "lab.cascade-chain": "data/lab/cascade-chain.json",
  "lab.dead-board": "data/lab/dead-board.json",
  "lab.seeded-fill": "data/lab/seeded-fill.json",
};
