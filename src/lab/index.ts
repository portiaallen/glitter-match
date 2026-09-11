export { BoardPlayground, startPlayground, type PlaygroundOptions, type SwapResult } from "./playground.js";
export { LAB_FIXTURE_IDS, LAB_FIXTURE_FILES, type LabFixtureId } from "./catalog.js";
export { GraphAuthoringSession, snapPosition, type AuthoringActionResult, type AuthoringEdgeSemantics } from "./authoring.js";
export {
  inspectSpecialMatches,
  labActivateSpecial,
  type SpecialMatchInspection,
} from "../special-matches/inspect.js";
export { inspectProgression } from "../progression/inspect.js";
export {
  inspectPrimitiveOnBoard,
  LAB_PRIMITIVE_RECIPES,
  type LabPrimitiveRecipe,
  type PrimitiveInspection,
} from "../primitives/inspect.js";
