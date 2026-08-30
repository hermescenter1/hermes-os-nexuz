/**
 * PHASE 109-B0 — single import surface for the dashboard's local demo source.
 *
 * Nothing under `src/app/api/**` may import this barrel. The demo scenario is a
 * presentation concern of one authenticated screen; it is deliberately not a
 * route, not a service and not an anonymous endpoint.
 */
export {
  TELEMETRY_RECORD_CLASSIFICATIONS,
  TELEMETRY_CONNECTION_MODES,
  IMPLEMENTED_CONNECTION_MODES,
  TELEMETRY_QUALITIES,
  TELEMETRY_SOURCE_KINDS,
  TELEMETRY_SCOPE_KINDS,
  SIMULATED_SOURCE_KINDS,
  PRODUCED_BY_VALUES,
  PROVENANCE_NETWORKS,
  SUPPORTED_FRAME_VERSION,
  MIN_SERIES_HISTORY,
  isTelemetryRecordClassification,
  isTelemetryConnectionMode,
  isTelemetryQuality,
  isTelemetrySourceKind,
  isTelemetryScopeKind,
  isValidSourceDescriptor,
  findSnapshotStructureFault,
  validateDashboardFrame,
  type TelemetryRecordClassification,
  type TelemetryConnectionMode,
  type TelemetryQuality,
  type TelemetryProvenance,
  type TelemetrySourceKind,
  type TelemetrySourceIdentity,
  type TelemetryScope,
  type TelemetryScopeKind,
  type ProducedBy,
  type ProvenanceNetwork,
  type ClassifiedDashboardFrame,
  type DashboardSourceDescriptor,
  type FrameRejectionReason,
  type FrameValidation,
} from "./contract";

export {
  LOCAL_DEMO_SOURCE,
  LOCAL_DEMO_PROVENANCE,
  LOCAL_DEMO_SCOPE,
  LOCAL_DEMO_DESCRIPTOR,
  resolveDashboardSource,
  createLocalDemoFrame,
} from "./local-demo-adapter";
