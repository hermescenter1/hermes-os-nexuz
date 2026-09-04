/**
 * PHASE 109-C2.0 — the offline adapter descriptor.
 *
 * The one adapter this round ships. It reads nothing from a disk, a network, a
 * database or a Siemens installation: it exists to declare, in a shape the
 * negotiation code can check, what an offline manifest reviewer is allowed to do.
 *
 * WHY THE FORBIDDEN CAPABILITIES ARE WRITTEN OUT RATHER THAN OMITTED
 * A capability object that simply lacks `canDownloadToController` gives a caller
 * reading `capabilities.canDownloadToController` the answer `undefined`, which is
 * falsy and therefore "works" — until somebody writes `!== false` and it silently
 * flips. Stating every one as an explicit literal `false` means the answer is the
 * same whichever way it is asked, and the type makes the alternative unwritable.
 *
 * A LATER ADAPTER OVER TIA OPENNESS
 * The interface is named for the boundary it will eventually sit behind, and the
 * documentation names it too. That is description, not capability:
 * `canInvokeOpenness` is typed `false`, no Openness assembly is referenced, and
 * a static gate refuses any process-launching import in this directory.
 */

import {
  type TiaAdapter,
  type TiaAdapterCapabilities,
} from "./contract";
import { SUPPORTED_MANIFEST_SCHEMA_VERSIONS } from "./package-manifest";

/** Capabilities of the offline manifest reviewer. */
export const OFFLINE_ADAPTER_CAPABILITIES: TiaAdapterCapabilities = Object.freeze({
  // Permanently unavailable — the literal type, checked by the compiler.
  canConnectToController: false,
  canDownloadToController: false,
  canUploadFromController: false,
  canWriteTags: false,
  canExecuteCompile: false,
  canInvokeOpenness: false,
  canLaunchExternalProcess: false,

  // Offline work this adapter genuinely performs, each exercised by a test.
  canValidateManifestOffline: true,
  canNormalizeOfflineFixture: true,
  canHashSnapshot: true,
  canDeclareSemanticContracts: true,
  canIngestDeclaredCompileResult: true,
});

/**
 * The adapter itself.
 *
 * `admittedPackageKinds` names only the normalized manifest. An archive kind is
 * absent from the list rather than present-and-refused, so an implementation
 * cannot admit one by editing a single boolean.
 */
export const OFFLINE_FIXTURE_ADAPTER: TiaAdapter = Object.freeze({
  id: "hermes-offline-manifest-adapter",
  descriptionKey: "adapter.offlineManifestDescription",
  capabilities: OFFLINE_ADAPTER_CAPABILITIES,
  supportedSchemaVersions: Object.freeze([...SUPPORTED_MANIFEST_SCHEMA_VERSIONS]),
  admittedPackageKinds: Object.freeze(["normalized-manifest" as const]),
});

/** Every adapter this round ships. Exactly one, and it is offline. */
export const ALL_TIA_ADAPTERS: readonly TiaAdapter[] = Object.freeze([
  OFFLINE_FIXTURE_ADAPTER,
]);
