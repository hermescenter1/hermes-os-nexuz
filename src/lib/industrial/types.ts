// Industrial Edge Gateway types — Phase 35

export type IndustrialSiteStatus    = "ACTIVE" | "INACTIVE" | "MAINTENANCE";
export type IndustrialGatewayStatus = "ONLINE" | "OFFLINE" | "DEGRADED" | "REVOKED";
export type IndustrialAssetType     = "PLC" | "SCADA" | "HMI" | "MOTOR" | "PUMP" | "COMPRESSOR" | "CONVEYOR" | "SENSOR" | "DRIVE" | "PANEL" | "VFD" | "VALVE" | "OTHER";
export type IndustrialProtocol      = "OPC_UA" | "MQTT" | "MODBUS_TCP" | "SIEMENS_S7" | "SCADA" | "HISTORIAN" | "MANUAL" | "OTHER";
export type TelemetryQuality        = "GOOD" | "BAD" | "UNCERTAIN" | "STALE";
export type ConnectorType           = "OPC_UA" | "MQTT" | "MODBUS_TCP" | "SIEMENS_S7" | "SCADA" | "HISTORIAN";

export const ALL_SITE_STATUSES:    IndustrialSiteStatus[]    = ["ACTIVE", "INACTIVE", "MAINTENANCE"];
export const ALL_GATEWAY_STATUSES: IndustrialGatewayStatus[] = ["ONLINE", "OFFLINE", "DEGRADED", "REVOKED"];
export const ALL_ASSET_TYPES:      IndustrialAssetType[]     = ["PLC", "SCADA", "HMI", "MOTOR", "PUMP", "COMPRESSOR", "CONVEYOR", "SENSOR", "DRIVE", "PANEL", "VFD", "VALVE", "OTHER"];
export const ALL_PROTOCOLS:        IndustrialProtocol[]      = ["OPC_UA", "MQTT", "MODBUS_TCP", "SIEMENS_S7", "SCADA", "HISTORIAN", "MANUAL", "OTHER"];
export const ALL_QUALITIES:        TelemetryQuality[]        = ["GOOD", "BAD", "UNCERTAIN", "STALE"];
export const ALL_CONNECTOR_TYPES:  ConnectorType[]           = ["OPC_UA", "MQTT", "MODBUS_TCP", "SIEMENS_S7", "SCADA", "HISTORIAN"];

export const MAX_TELEMETRY_BATCH = 500;

// Tag name: must start with a letter, alphanumeric + . _ - allowed, max 128 chars
export const TAG_PATTERN = /^[a-zA-Z][a-zA-Z0-9._\-]{0,127}$/;
export const MAX_VALUE_JSON_BYTES = 4096;

export interface SiteRecord {
  id:             string;
  organizationId: string;
  name:           string;
  slug:           string;
  location:       string | null;
  description:    string | null;
  status:         IndustrialSiteStatus;
  createdAt:      string;
  updatedAt:      string;
}

export interface GatewayRecord {
  id:             string;
  organizationId: string;
  siteId:         string;
  name:           string;
  gatewayId:      string;
  status:         IndustrialGatewayStatus;
  version:        string | null;
  apiKeyId:       string | null;
  lastSeenAt:     string | null;
  metadata:       Record<string, unknown>;
  revokedAt:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface AssetRecord {
  id:             string;
  organizationId: string;
  siteId:         string;
  gatewayId:      string | null;
  name:           string;
  assetType:      IndustrialAssetType;
  manufacturer:   string | null;
  model:          string | null;
  protocol:       IndustrialProtocol;
  tagPrefix:      string | null;
  status:         string;
  metadata:       Record<string, unknown>;
  createdAt:      string;
  updatedAt:      string;
}

export interface TelemetryRecord {
  id:             string;
  organizationId: string;
  siteId:         string;
  gatewayId:      string;
  assetId:        string | null;
  tag:            string;
  value:          unknown;
  numericValue:   number | null;
  quality:        TelemetryQuality;
  unit:           string | null;
  source:         string;
  timestamp:      string;  // gateway-reported, untrusted
  receivedAt:     string;  // server-set
  sequenceId:     string | null;
}

export interface ConnectorRecord {
  id:             string;
  organizationId: string;
  siteId:         string;
  gatewayId:      string;
  connectorType:  ConnectorType;
  name:           string;
  enabled:        boolean;
  config:         Record<string, unknown>;
  createdAt:      string;
  updatedAt:      string;
}

export interface TelemetryReading {
  tag:          string;
  value:        unknown;
  numericValue?: number;
  quality:      TelemetryQuality;
  unit?:        string;
  source:       string;
  timestamp:    string;
  sequenceId?:  string;
  assetId?:     string;
}

export interface TelemetryIngestPayload {
  gatewayId: string; // IndustrialGateway.id (primary key)
  readings:  TelemetryReading[];
}

export interface TelemetryValidationError {
  index: number;
  tag:   string;
  error: string;
}
