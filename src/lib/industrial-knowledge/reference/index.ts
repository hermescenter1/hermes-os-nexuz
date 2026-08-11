// PHASE 101 — the sealed reference-system registry.
//
// Every system is sealed at module load: `defineReferenceSystem` validates its
// structure, stamps provenance onto each node and artefact, and computes the
// content checksum. A structural defect therefore fails the import — in the
// test run and in the build — rather than surfacing when an engineer asks a
// diagnostic question.

import { defineReferenceSystem } from "../provenance";
import type { ReferenceSystem } from "../types";

import { SCADA_01_WATER_DISTRIBUTION } from "./scada-01-water-distribution";
import { SCADA_02_STEEL_ROLLING } from "./scada-02-steel-rolling";
import { SCADA_03_PETROCHEMICAL } from "./scada-03-petrochemical";
import { SCADA_04_POWER_DISTRIBUTION } from "./scada-04-power-distribution";
import { SCADA_05_MINERAL_PROCESSING } from "./scada-05-mineral-processing";
import { TIA_01_STEEL_ROLLING } from "./tia-01-steel-rolling";
import { TIA_02_BOTTLING_PACKAGING } from "./tia-02-bottling-packaging";

export const REFERENCE_SYSTEMS: readonly ReferenceSystem[] = [
  defineReferenceSystem(TIA_01_STEEL_ROLLING),
  defineReferenceSystem(TIA_02_BOTTLING_PACKAGING),
  defineReferenceSystem(SCADA_01_WATER_DISTRIBUTION),
  defineReferenceSystem(SCADA_02_STEEL_ROLLING),
  defineReferenceSystem(SCADA_03_PETROCHEMICAL),
  defineReferenceSystem(SCADA_04_POWER_DISTRIBUTION),
  defineReferenceSystem(SCADA_05_MINERAL_PROCESSING),
];
