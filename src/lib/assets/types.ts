// Phase 72 — Enterprise Asset Registry types

export type AssetStatus         = "PLANNED"|"COMMISSIONED"|"IN_SERVICE"|"DEGRADED"|"UNDER_MAINTENANCE"|"STANDBY"|"RETIRED"|"REPLACED"|"DECOMMISSIONED";
export type AssetCriticality    = "NON_CRITICAL"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
export type AssetRiskState      = "HEALTHY"|"MONITOR"|"AT_RISK"|"CRITICAL"|"UNKNOWN";
export type AssetLifecycleState = "DESIGN"|"PROCUREMENT"|"INSTALLATION"|"COMMISSIONING"|"IN_SERVICE"|"DEGRADED"|"DECOMMISSIONING"|"RETIRED";
export type IndustrialAssetType = "PRODUCTION_LINE"|"MACHINE"|"PLC"|"HMI"|"SCADA_NODE"|"ELECTRICAL_PANEL"|"MCC_PANEL"|"VFD"|"MOTOR"|"PUMP"|"VALVE"|"SENSOR"|"INSTRUMENT"|"ROBOT"|"CONVEYOR"|"COMPRESSOR"|"UTILITY_SYSTEM"|"SAFETY_SYSTEM"|"NETWORK_DEVICE"|"INDUSTRIAL_PC";

export interface IndustrialAsset {
  id:               string;
  organizationId:   string | null;
  siteId:           string | null;
  assetNumber:      string;
  name:             string;
  nameEn:           string | null;
  nameFa:           string | null;
  description:      string | null;
  assetType:        IndustrialAssetType;
  status:           AssetStatus;
  criticality:      AssetCriticality;
  riskState:        AssetRiskState;
  lifecycleState:   AssetLifecycleState;
  healthScore:      number;
  parentAssetId:    string | null;
  locationId:       string | null;
  manufacturer:     string | null;
  model:            string | null;
  serialNumber:     string | null;
  firmwareVersion:  string | null;
  installationDate: string | null;
  commissionDate:   string | null;
  warrantyExpiry:   string | null;
  expectedLifeYears:number | null;
  lastInspectionAt: string | null;
  nextInspectionAt: string | null;
  technicalSpecs:   Record<string, unknown>;
  tags:             string[];
  isActive:         boolean;
  createdBy:        string | null;
  updatedBy:        string | null;
  createdAt:        string;
  updatedAt:        string;
  location?:        AssetLocation | null;
  children?:        IndustrialAsset[];
  _count?: {
    children:        number;
    maintenanceLinks:number;
    documentLinks:   number;
    telemetryLinks:  number;
    healthSnapshots: number;
  };
}

export interface AssetLocation {
  id:            string;
  organizationId:string | null;
  siteId:        string | null;
  code:          string;
  name:          string;
  nameEn:        string | null;
  nameFa:        string | null;
  description:   string | null;
  locationType:  string;
  parentId:      string | null;
  building:      string | null;
  floor:         string | null;
  room:          string | null;
  isActive:      boolean;
  createdAt:     string;
  updatedAt:     string;
}

export interface AssetCriticalityAssessment {
  id:                   string;
  assetId:              string;
  assessedBy:           string | null;
  safetyImpact:         number;
  productionImpact:     number;
  maintenanceImpact:    number;
  downtimeRisk:         number;
  replacementDifficulty:number;
  spareAvailability:    number;
  overallScore:         number;
  criticality:          AssetCriticality;
  notes:                string | null;
  isActive:             boolean;
  assessedAt:           string;
  createdAt:            string;
  updatedAt:            string;
}

export interface AssetHealthSnapshot {
  id:           string;
  assetId:      string;
  healthScore:  number;
  riskState:    AssetRiskState;
  vibrationRms: number | null;
  temperature:  number | null;
  pressure:     number | null;
  currentDraw:  number | null;
  notes:        string | null;
  takenBy:      string | null;
  takenAt:      string;
  createdAt:    string;
}

export interface AssetLifecycleEvent {
  id:          string;
  assetId:     string;
  eventType:   string;
  fromState:   AssetLifecycleState | null;
  toState:     AssetLifecycleState;
  performedBy: string | null;
  notes:       string | null;
  documents:   string[];
  metadata:    Record<string, unknown>;
  occurredAt:  string;
  createdAt:   string;
}

export interface AssetMaintenanceLink {
  id:          string;
  assetId:     string;
  workOrderId: string | null;
  planId:      string | null;
  linkType:    string;
  notes:       string | null;
  linkedAt:    string;
  createdAt:   string;
}

export interface AssetDocumentLink {
  id:          string;
  assetId:     string;
  documentId:  string | null;
  docType:     string;
  title:       string;
  description: string | null;
  fileRef:     string | null;
  linkedAt:    string;
  createdAt:   string;
}

export interface AssetTelemetryLink {
  id:          string;
  assetId:     string;
  tagPath:     string;
  protocol:    string;
  description: string | null;
  unit:        string | null;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
}

export interface AssetTag {
  id:        string;
  assetId:   string;
  key:       string;
  value:     string;
  createdAt: string;
}

export interface AssetDashboard {
  totalAssets:           number;
  criticalAssets:        number;
  degradedAssets:        number;
  atRiskAssets:          number;
  assetsWithOpenWO:      number;
  assetsMissingDocs:     number;
  assetsByType:          Record<string, number>;
  assetsByStatus:        Record<string, number>;
  assetsByCriticality:   Record<string, number>;
  lifecycleDistribution: Record<string, number>;
  recentLifecycleEvents: AssetLifecycleEvent[];
  topCriticalAssets:     IndustrialAsset[];
  healthDistribution:    { healthy: number; monitor: number; atRisk: number; critical: number; unknown: number };
}
