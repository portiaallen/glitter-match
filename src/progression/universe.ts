import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import { assertValidUniverse } from "./validate.js";
import type { ProgressionNode, UniverseContent } from "./types.js";

export class UniverseRegistry {
  private readonly universes = new Map<string, { content: UniverseContent; catalog: ProgressionNode[] }>();

  register(content: UniverseContent, catalog: ProgressionNode[]): void {
    const issues: ValidationIssue[] = [];
    if (this.universes.has(content.id)) {
      issues.push(issue("progression.duplicate_universe", `universe.${content.id}`, `Universe "${content.id}" is already registered.`));
    }
    throwIfErrors(issues, "Invalid universe registration");
    assertValidUniverse(content, catalog);
    this.universes.set(content.id, { content, catalog });
  }

  get(id: string): { content: UniverseContent; catalog: ProgressionNode[] } {
    const found = this.universes.get(id);
    if (!found) {
      throwIfErrors([issue("progression.unknown_universe", `universe.${id}`, `Unknown universe "${id}".`)], "Unknown universe");
    }
    return found!;
  }

  has(id: string): boolean {
    return this.universes.has(id);
  }

  list(): UniverseContent[] {
    return [...this.universes.values()].map((item) => item.content);
  }
}

export function createUniverseRegistry(): UniverseRegistry {
  return new UniverseRegistry();
}
