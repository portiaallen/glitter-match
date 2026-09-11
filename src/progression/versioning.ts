import { versionsCompatible, parseSemver } from "../content/versions.js";
import type { VersionCompatibility } from "./types.js";

export function classifyContentVersion(recordVersion: string | undefined, currentVersion: string): VersionCompatibility {
  if (!recordVersion) {
    return "UNKNOWN";
  }
  if (!parseSemver(recordVersion) || !parseSemver(currentVersion)) {
    return "UNKNOWN";
  }
  const recorded = parseSemver(recordVersion)!;
  const current = parseSemver(currentVersion)!;
  if (recorded[0] !== current[0]) {
    return "INVALIDATED";
  }
  if (versionsCompatible(recordVersion, currentVersion)) {
    return "VALID";
  }
  if (recorded[1] < current[1] || (recorded[1] === current[1] && recorded[2] < current[2])) {
    return "STALE";
  }
  return "VALID";
}
