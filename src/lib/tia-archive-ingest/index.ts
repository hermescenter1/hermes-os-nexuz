/**
 * PHASE 109-C2.1 — secure archive ingestion, public surface.
 *
 * WHY THIS IS A SEPARATE MODULE FROM `tia-companion`. C2.0's static safety gate
 * asserts that the companion library imports exactly one Node built-in — the
 * hash — and bans `child_process`, `worker_threads`, `node:net`/`http`, `fs`
 * and `process.env` across every file it owns. That gate is correct and is left
 * untouched: the companion is a pure, offline, hash-only library.
 *
 * Ingestion needs a socket, a subprocess and a filesystem, so it cannot live
 * there. Rather than carve an exemption into a shipped security gate, the
 * runtime lives here and imports the companion's primitives — path
 * classification, diagnostics, canonical hashing, manifest and snapshot — so
 * nothing is duplicated.
 *
 * The SIDECAR ENTRIES ARE DELIBERATELY NOT EXPORTED. They are programs, not
 * API, and they are the only files permitted to spawn or to write to `/proc`.
 * Nothing in the web process may import them. The fixture corpus is likewise
 * absent: it is reachable only by an explicit import from `testing/`.
 */

export { ingestAvailability, ingestIsAvailable, PARSER_SOCKET_PATH, type Availability } from "./availability";

export { classifyContainer, leadingHex, type ContainerVerdict } from "./container-classifier";

export {
  ALL_INGEST_DIAGNOSTIC_CODES,
  ALL_REFUSAL_CODES,
  collidingCodes,
  INGEST_DIAGNOSTIC_CODES,
  ingestMessageKeyOf,
  isIngestDiagnosticCode,
  type IngestDiagnosticCode,
} from "./diagnostics";

export {
  classifyEntry,
  fileTypeIsAdmissible,
  pathSerializationProblem,
  GP_FLAG_DATA_DESCRIPTOR,
  GP_FLAG_ENCRYPTED,
  METHOD_DEFLATE,
  METHOD_STORED,
  S_IFMT,
  S_IFREG,
  type CentralEntry,
  type EntryProblem,
  type EntryVerdict,
} from "./entry-policy";

export {
  ALLOWED_EXTRA_FIELD_IDS,
  EXTRA_ID_UNICODE_PATH,
  EXTRA_ID_ZIP64,
  extraFieldProblems,
  filenameShadowProblem,
  formatExtraFieldId,
  zip64IsRequired,
  type ExtraFieldProblem,
  type RawExtraField,
} from "./extra-field-policy";

export {
  headerMismatches,
  type CentralHeaderView,
  type HeaderMismatch,
  type LocalHeaderView,
} from "./header-reconciler";

export {
  ingestArchive,
  readTerminalResponse,
  type IngestOutcome,
  type IngestRequest,
} from "./host-client";

export {
  INGEST_LIMITS,
  INGRESS_LIMITS,
  MIN_NODE_VERSION,
  REQUIRED_CHILD_OOM_SCORE_ADJ,
  REQUIRED_MEMORY_OOM_GROUP,
  WORST_CASE_DONE_JSON_BYTES,
  WORST_CASE_ENTRY_JSON_BYTES,
} from "./limits";

export {
  LineFramer,
  SPENT_FRAMER_RESULT,
  type FramerOverflowReason,
  type FramerResult,
} from "./line-framer";

export {
  ParseLifecycle,
  type CleanupStep,
  type ExpiryReason,
  type LifecycleHooks,
  type LifecycleTimers,
  type ParseOutcome,
} from "./parse-lifecycle";

export { reconcile, type DeclaredEntry, type Reconciliation, type ReconciliationProblem } from "./manifest-reconciler";

export {
  DoneMessageSchema,
  doneMessageIsSelfConsistent,
  IngestedEntrySchema,
  parseReady,
  parseTerminal,
  ReadyMessageSchema,
  RefusedMessageSchema,
  TerminalMessageSchema,
  type DoneMessage,
  type IngestedEntry,
  type ReadyMessage,
  type RefusedMessage,
  type TerminalMessage,
} from "./protocol";

export {
  checkRuntime,
  CRC32_TEST_VECTOR,
  crc32SelfTestPasses,
  parseNodeVersion,
  versionAtLeast,
  type RuntimeVerdict,
} from "./runtime-assert";
