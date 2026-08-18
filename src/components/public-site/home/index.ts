/**
 * PHASE 104-E — the public homepage reference surface (round 3).
 *
 * Homepage-only compositions. Deliberately NOT added to the `public-site`
 * barrel: that barrel is the shared vocabulary for every public page, and
 * putting a homepage composition into it is the first step back toward the
 * repeated-section problem this surface exists to remove.
 */
export {
  ObservatorySignature,
  type ObservatoryNodes,
} from "./ObservatorySignature";
export { ObservatoryHero } from "./ObservatoryHero";
export {
  CaseChapter,
  PlanesChapter,
  BackboneChapter,
  CoreChapter,
  GateChapter,
  EditorialChapter,
  ClosingChapter,
} from "./HomeChapters";
