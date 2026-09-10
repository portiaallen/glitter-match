import type { Board } from "../board/index.js";
import type { MatchGroup, SpecialMatchCandidate } from "../matching/types.js";
import { selectAnchor } from "./anchors.js";
import type { SpecialMatchRegistry } from "./registry.js";
import { nextInstanceId, type SpecialMatchRuntime } from "./runtime.js";
import {
  defaultSpecialAccessibility,
  type CandidateCreationPolicy,
  type SpecialMatchEvent,
  type SpecialMatchInstance,
} from "./types.js";

export interface CreationDecision {
  created: SpecialMatchInstance[];
  deferred: SpecialMatchCandidate[];
  events: SpecialMatchEvent[];
  preserveCellIds: string[];
  clearCellIds: string[];
}

function candidateRank(candidate: SpecialMatchCandidate): string {
  return [
    String(1000 - candidate.priority).padStart(4, "0"),
    candidate.ruleId,
    candidate.anchorCellId,
    [...candidate.affectedCellIds].sort().join(","),
  ].join("|");
}

/**
 * Candidates remain inspectable. Creation policy chooses which become instances.
 * Default: Prompt #7 priority (cross > T > L > line-5/4 > cluster-4+), unique anchors.
 */
export function resolveCandidateCreation(
  board: Board,
  candidates: SpecialMatchCandidate[],
  registry: SpecialMatchRegistry,
  runtime: SpecialMatchRuntime,
  combo: number,
  policy: CandidateCreationPolicy = "priority-unique-anchors",
  groups: MatchGroup[] = [],
): CreationDecision {
  const events: SpecialMatchEvent[] = [];
  const created: SpecialMatchInstance[] = [];
  const deferred: SpecialMatchCandidate[] = [];
  const claimedAnchors = new Set<string>();
  const preserve = new Set<string>();
  const clear = new Set<string>();

  const ranked = [...candidates].sort((a, b) => candidateRank(a).localeCompare(candidateRank(b)));
  for (const candidate of ranked) {
    events.push({
      kind: "SPECIAL_CANDIDATE_IDENTIFIED",
      candidateType: candidate.candidateType,
      cellIds: candidate.affectedCellIds,
      message: `Candidate ${candidate.candidateType} remains inspectable.`,
      explain: {
        candidatesConsidered: [candidate],
        accessibility: defaultSpecialAccessibility(candidate.candidateType, candidate.anchorCellId),
      },
      data: { candidate },
    });

    const type = registry.typeForCandidate(candidate.candidateType);
    if (!type) {
      deferred.push(candidate);
      events.push({
        kind: "SPECIAL_CANDIDATE_DEFERRED",
        candidateType: candidate.candidateType,
        cellIds: candidate.affectedCellIds,
        message: `No registered Special Match type accepts candidate "${candidate.candidateType}".`,
        explain: {
          policyWinner: "none",
          whyCreated: `Deferred: unknown eligibility "${candidate.candidateType}".`,
          accessibility: defaultSpecialAccessibility(candidate.candidateType, candidate.anchorCellId),
        },
      });
      continue;
    }

    const anchor = selectAnchor(candidate, type.anchorPolicy, board.topology.cellIds);
    if (claimedAnchors.has(anchor.cellId) && policy !== "all-non-overlapping") {
      deferred.push(candidate);
      events.push({
        kind: "SPECIAL_CANDIDATE_DEFERRED",
        candidateType: candidate.candidateType,
        cellIds: candidate.affectedCellIds,
        message: `Deferred: anchor ${anchor.cellId} already claimed. Candidate kept for inspection.`,
        explain: {
          whyAnchor: anchor.why,
          policyWinner: policy,
          accessibility: defaultSpecialAccessibility(type.id, anchor.cellId),
        },
      });
      continue;
    }
    if (policy === "all-non-overlapping" && candidate.affectedCellIds.some((id) => claimedAnchors.has(id) && id === anchor.cellId)) {
      deferred.push(candidate);
      continue;
    }

    const groupId = `mg:${candidate.ruleId}:${candidate.candidateType}:${[...candidate.affectedCellIds].sort().join(",")}`;
    const instance: SpecialMatchInstance = {
      instanceId: nextInstanceId(runtime, type.id, anchor.cellId, groupId),
      typeId: type.id,
      typeVersion: type.version,
      anchorCellId: anchor.cellId,
      sourceMatchGroupId: groupId,
      createdAtMove: runtime.moveIndex,
      createdAtCombo: combo,
      state: "created",
      activationState: "created",
      metadata: {
        candidateType: candidate.candidateType,
        affectedCellIds: [...candidate.affectedCellIds].sort(),
        directionsUsed: ((groups.find((group) => group.specialMatchCandidate === candidate)?.patternMetadata?.directionsUsed as string[]) ?? []).slice().sort(),
        ruleId: candidate.ruleId,
        category: type.category,
      },
    };
    instance.state = "armed";
    instance.activationState = "armed";
    runtime.instances[instance.instanceId] = instance;
    created.push(instance);
    claimedAnchors.add(anchor.cellId);

    if (type.matchedCellPolicy === "preserve-anchor") {
      preserve.add(anchor.cellId);
      for (const cellId of candidate.affectedCellIds) {
        if (cellId !== anchor.cellId) {
          clear.add(cellId);
        }
      }
    } else if (type.matchedCellPolicy === "clear-all") {
      for (const cellId of candidate.affectedCellIds) {
        clear.add(cellId);
      }
    } else {
      for (const cellId of candidate.affectedCellIds) {
        preserve.add(cellId);
      }
    }

    events.push({
      kind: "SPECIAL_MATCH_CREATED",
      instanceId: instance.instanceId,
      candidateType: candidate.candidateType,
      cellIds: [anchor.cellId],
      message: `Created ${type.id} at ${anchor.cellId} from ${candidate.candidateType}. Not an inventory Special Icon.`,
      explain: {
        whyCreated: `Creation policy ${policy} selected ${candidate.candidateType} → ${type.id}.`,
        whyAnchor: anchor.why,
        sourceGroupId: groupId,
        candidatesConsidered: ranked,
        policyWinner: `${policy}:${type.id}`,
        accessibility: {
          ...type.accessibility,
          label: `${type.id} Special Match at cell ${anchor.cellId}`,
          nonColorIndicator: `SM:${type.id}:${anchor.cellId}`,
        },
      },
      data: { instance },
    });
  }

  return {
    created,
    deferred,
    events,
    preserveCellIds: [...preserve].sort(),
    clearCellIds: [...clear].filter((id) => !preserve.has(id)).sort(),
  };
}
