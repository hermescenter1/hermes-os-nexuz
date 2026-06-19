/**
 * Industrial Connector abstraction — Phase 35.
 *
 * FOUNDATION ONLY — interfaces defined here, no real protocol drivers.
 * Real OPC UA / MQTT / Modbus / Siemens S7 / SCADA drivers are out-of-scope
 * for this phase. Phase 36+ will provide concrete implementations.
 *
 * SAFETY INVARIANT: These interfaces are READ/OBSERVE only.
 * There are NO write-back or command methods in this interface.
 * Any control-command capability requires a separate safety design review.
 */

export interface ConnectorConfig {
  id:            string;
  connectorType: string;
  name:          string;
  enabled:       boolean;
  config:        Record<string, unknown>;
}

export interface ConnectorHealth {
  connected:    boolean;
  lastCheckAt:  string; // ISO-8601
  errorMessage: string | null;
  metadata:     Record<string, unknown>;
}

export interface TelemetryPayload {
  tag:          string;
  value:        unknown;
  numericValue?: number;
  quality:      "GOOD" | "BAD" | "UNCERTAIN" | "STALE";
  unit?:        string;
  source:       string;
  timestamp:    string; // ISO-8601 — gateway-reported, untrusted
  sequenceId?:  string; // optional monotonic id for offline buffering
}

/**
 * IndustrialConnector — the interface every future protocol driver must satisfy.
 * All methods are read/observe only. No write-back, no control commands.
 */
export interface IndustrialConnector {
  readonly type: string;

  configure(config: ConnectorConfig): Promise<void>;
  health(): Promise<ConnectorHealth>;
  // subscribe() and poll() methods will be added in Phase 36 with real drivers
}
