// Hermes Industrial Brain V1 — Type Definitions
// Phase 80: Alarm Intelligence, Signal Matrix & Neural Reasoning Workspace

export interface IndustrialFaultInput {
  problemTitle: string;
  assetType?: string;
  systemArea?: string;
  plcPlatform?: string;
  observedSymptoms: string;
  recentChanges?: string;
  activeAlarms?: string;
  observedSignals?: string;
  hmiCommandState?: string;
  plcOutputState?: string;
  vfdMccState?: string;
  interlockStatus?: string;
  sensorFeedback?: string;
  safetyImpact?: string;
  productionImpact?: string;
  alreadyChecked?: string;
  additionalInfo?: string;
  locale?: string;
}

export type SignalStatus = "NORMAL" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type AlarmSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
export type UncertaintyLevel = "LOW" | "MEDIUM" | "HIGH";
export type IndustrialDomain =
  | "PLC" | "SCADA" | "HMI" | "MOTOR" | "SENSOR"
  | "NETWORK" | "MECHANICAL" | "ELECTRICAL" | "MAINTENANCE" | "VFD" | "UNKNOWN";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ClassificationResult {
  domain: IndustrialDomain;
  domainFa: string;
  secondaryDomains: IndustrialDomain[];
  severity: Severity;
  confidence: number;
}

export interface AlarmItem {
  alarmText: string;
  source: string;
  severity: AlarmSeverity;
  interpretation: string;
  possibleMeaning: string;
  confidence: number;
}

export interface SignalMatrixItem {
  signalName: string;
  signalNameFa: string;
  source: string;
  observedValue: string;
  expectedValue: string;
  status: SignalStatus;
  diagnosticMeaning: string;
  confidence: number;
  nextCheck: string;
}

export interface EvidenceNode {
  id: string;
  label: string;
  labelFa: string;
  type: "PRESENT" | "ABSENT" | "CONFLICTING";
  value: string;
}

export interface CauseNode {
  id: string;
  label: string;
  labelFa: string;
  confidence: number;
  supportedBy: string[];
}

export interface RiskNode {
  id: string;
  label: string;
  labelFa: string;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ActionNode {
  id: string;
  label: string;
  labelFa: string;
  priority: "IMMEDIATE" | "NEXT" | "ESCALATE";
}

export interface ReasoningMap {
  evidenceNodes: EvidenceNode[];
  causeNodes: CauseNode[];
  riskNodes: RiskNode[];
  actionNodes: ActionNode[];
}

export interface UncertaintyResult {
  level: UncertaintyLevel;
  explanation: string;
  explanationFa: string;
  missingCriticalSignals: string[];
  missingCriticalSignalsFa: string[];
  conflictingSignals: string[];
  recommendedEvidenceToReduceUncertainty: string[];
}

export interface RiskResult {
  productionImpact: string;
  productionImpactFa: string;
  safetyImpact: string;
  safetyImpactFa: string;
  downtimeRisk: string;
  downtimeRiskFa: string;
  urgency: string;
  urgencyFa: string;
  urgencyLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface LikelyCause {
  id: string;
  title: string;
  titleFa: string;
  explanation: string;
  explanationFa: string;
  supportingEvidence: string[];
  missingEvidence: string[];
  confidence: number;
  suggestedCheck: string;
  suggestedCheckFa: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  textFa: string;
  category: string;
  categoryFa: string;
  requiresQualifiedPersonnel: boolean;
}

export interface ActionGroup {
  category: string;
  categoryFa: string;
  icon: string;
  items: Array<{ en: string; fa: string }>;
}

export interface EvidenceGap {
  signal: string;
  signalFa: string;
  reason: string;
  impact: string;
}

export interface RelatedKnowledge {
  id: string;
  title: string;
  type: "CASE" | "KNOWLEDGE" | "ARTICLE";
  relevanceScore: number;
  summary?: string;
  domain?: string;
}

export interface IndustrialBrainAnalysis {
  summary: string;
  summaryFa: string;
  classification: ClassificationResult;
  alarms: AlarmItem[];
  signalMatrix: SignalMatrixItem[];
  reasoningMap: ReasoningMap;
  uncertainty: UncertaintyResult;
  risk: RiskResult;
  likelyCauses: LikelyCause[];
  evidenceGaps: EvidenceGap[];
  inspectionChecklist: ChecklistItem[];
  recommendedActions: ActionGroup[];
  relatedKnowledge: RelatedKnowledge[];
  confidence: number;
  engineVersion: string;
  processingMs: number;
}
