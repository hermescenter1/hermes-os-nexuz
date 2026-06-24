/**
 * Phase 57 — Global Operations Command Center shared types.
 * All values are deterministic; no AI inference.
 */

export type OperationalStatus = "online" | "warning" | "critical" | "simulated";
export type AlertSeverity    = "critical" | "warning" | "info";
export type AlertStatus      = "active"   | "acknowledged" | "resolved";

// ── Vendor Zone (one per industrial vendor domain) ────────────────────────────

export interface VendorZone {
  id:             string;
  vendor:         string;
  name:           string;
  status:         OperationalStatus;
  assetCount:     number;
  alarmCount:     number;
  criticalAlarms: number;
  warningAlarms:  number;
  healthScore:    number;
  riskScore:      number;
  protocols:      string[];
  caseCount:      number;
}

// ── Operations Overview (aggregated platform state) ───────────────────────────

export interface OperationsOverview {
  vendors:          number;
  assets:           number;
  protocols:        number;
  alarms:           number;
  criticalAlarms:   number;
  warningAlarms:    number;
  infoAlarms:       number;
  cases:            number;
  knowledgeLinks:   number;
  graphNodes:       number;
  graphEdges:       number;
  systemHealth:     number;  // 0-100, derived from alarm severity mix
  onlineZones:      number;
  warningZones:     number;
  criticalZones:    number;
  simulatedComponents: number;
  builtAt:          string;
}

// ── Alert record (derived from graph ALARM nodes) ─────────────────────────────

export interface OperationsAlert {
  id:        string;
  label:     string;
  category:  string;
  severity:  AlertSeverity;
  vendor:    string;
  vendorName:string;
  deviceId:  string;
  deviceLabel:string;
  caseId:    string;
  status:    AlertStatus;
}

// ── Intelligence stats (cross-system aggregate) ───────────────────────────────

export interface IntelligenceStats {
  graphNodes:      number;
  graphEdges:      number;
  graphDensity:    number;
  vendors:         number;
  protocols:       number;
  assets:          number;
  cases:           number;
  knowledgeLinks:  number;
  vendorBreakdown: VendorBreakdown[];
  alarmsByCategory:CategoryCount[];
  nodesByType:     Record<string, number>;
  edgesByType:     Record<string, number>;
  platformFacts: {
    knowledgeLibraries: number;
    engineeringCases:   number;
    supportedVendors:   number;
  };
  componentStates: ComponentStateEntry[];
}

export interface VendorBreakdown {
  vendor:     string;
  name:       string;
  cases:      number;
  assets:     number;
  protocols:  number;
  alarms:     number;
}

export interface CategoryCount {
  category: string;
  count:    number;
  severity: AlertSeverity;
}

export interface ComponentStateEntry {
  key:   string;
  state: string;
}

// ── War Room incident (critical-severity cases) ───────────────────────────────

export interface WarRoomIncident {
  id:          string;
  caseId:      string;
  title:       string;
  severity:    AlertSeverity;
  vendor:      string;
  vendorName:  string;
  category:    string;
  symptoms:    string;
  rootCause:   string;
  resolution:  string;
  alarmId:     string;
  alarmLabel:  string;
  impactScore: number;
}

export interface WarRoomData {
  incidents:   WarRoomIncident[];
  systemState: {
    online:     number;
    warning:    number;
    critical:   number;
    simulated:  number;
  };
  criticalVendors: string[];
  builtAt:     string;
}
