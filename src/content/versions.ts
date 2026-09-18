/** Schema/content versions for independently versionable packs. */

export const SCHEMA_VERSION = "10.0.0" as const;
export const CONTENT_VERSION = "0.8.0-runtime" as const;

export interface VersionRecord {
  schemaVersion: string;
  contentVersion: string;
}

export function parseSemver(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?$/.exec(version);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compatible when major matches and incoming minor/patch is >= required. */
export function versionsCompatible(incoming: string, required: string): boolean {
  const left = parseSemver(incoming);
  const right = parseSemver(required);
  if (!left || !right) {
    return false;
  }
  if (left[0] !== right[0]) {
    return false;
  }
  if (left[1] !== right[1]) {
    return left[1] > right[1];
  }
  return left[2] >= right[2];
}

export interface MigrationHook {
  fromSchemaVersion: string;
  toSchemaVersion: string;
  /**
   * Future authors register migrations here. This phase only records the hook
   * contract — it does not rewrite production content.
   */
  note: string;
}

export const MIGRATION_HOOKS: readonly MigrationHook[] = [
  {
    fromSchemaVersion: "9.0.0",
    toSchemaVersion: SCHEMA_VERSION,
    note: "Progression & Level-State Engine is additive. No production campaign exists to migrate.",
  },
  {
    fromSchemaVersion: "10.0.0",
    toSchemaVersion: SCHEMA_VERSION,
    note: "Level Runtime is additive orchestration. Schema unchanged; no production campaign exists to migrate.",
  },
];
