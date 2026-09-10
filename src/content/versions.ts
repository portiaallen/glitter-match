/** Schema/content versions for independently versionable packs. */

export const SCHEMA_VERSION = "7.0.0" as const;
export const CONTENT_VERSION = "0.4.0-match-rules" as const;

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
    fromSchemaVersion: "6.0.0",
    toSchemaVersion: SCHEMA_VERSION,
    note: "Match Rule & Pattern Engine is additive. No production content exists to migrate.",
  },
];
