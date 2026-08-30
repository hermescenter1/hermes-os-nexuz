/** PHASE 104-I.D — Industrial Command Center primitives. */
export { StateBoundary, type StateTone } from "./StateBoundary";
export { SeverityLedger } from "./SeverityLedger";
export { ProvenanceFooter } from "./ProvenanceFooter";
export {
  SEVERITY_TEXT, SEVERITY_FILL, SEVERITY_BADGE, SEVERITY_ROW,
} from "./severity-tokens";
export {
  interpretResponse, isAlertsPayload, isValidAlert, isValidCategory, isCount,
  selectQueue, buildLedger,
  dominantSeverity, distinctVendors, assessFreshness,
  msUntilStale, scheduleFreshnessCheck,
  SEVERITY_ORDER, STALE_AFTER_SECONDS,
  type AlertsPayload, type AlarmState, type AlarmFailure,
  type SeverityFilter, type QueueView, type LedgerSegment, type Freshness,
} from "./alarm-state";
