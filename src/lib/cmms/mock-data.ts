// Phase 70 — CMMS deterministic mock data

import type {
  MaintenancePlan, MaintenanceSchedule, MaintenanceTask,
  MaintenanceFailure, MaintenanceDowntime, MaintenanceSparePart,
  MaintenanceTechnician, MaintenanceTeam, MaintenanceWorkCenter,
  MaintenanceCost, MaintenanceChecklist, MaintenanceCalendarEvent,
  FailureCode, CorrectiveAction, FailureCause,
  MaintenanceHistory, MaintenanceComment, MaintenanceApproval,
  MaintenanceNotification,
} from "./types";

const NOW = new Date("2026-06-26T08:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const from = (d: number) => new Date(NOW.getTime() + d * 86400000).toISOString();

// ── Work Centers ──────────────────────────────────────────────────────────────

export const MOCK_WORK_CENTERS: MaintenanceWorkCenter[] = [
  { id: "wc-01", organizationId: null, code: "WC-PROD-A", name: "Production Line A",       description: "Main production line",       location: "Building 1, Floor 1", costCenter: "CC-1001", isActive: true,  createdAt: ago(180), updatedAt: ago(30) },
  { id: "wc-02", organizationId: null, code: "WC-PROD-B", name: "Production Line B",       description: "Secondary production line",  location: "Building 1, Floor 2", costCenter: "CC-1002", isActive: true,  createdAt: ago(180), updatedAt: ago(15) },
  { id: "wc-03", organizationId: null, code: "WC-UTIL",   name: "Utilities & HVAC",        description: "Utility systems",            location: "Building 2",          costCenter: "CC-2001", isActive: true,  createdAt: ago(180), updatedAt: ago(10) },
  { id: "wc-04", organizationId: null, code: "WC-INST",   name: "Instrumentation Lab",     description: "Calibration & measurement",  location: "Building 3, Lab",     costCenter: "CC-3001", isActive: true,  createdAt: ago(120), updatedAt: ago(5) },
  { id: "wc-05", organizationId: null, code: "WC-ELEC",   name: "Electrical Systems",      description: "HV/LV electrical panels",    location: "Building 1, Basement",costCenter: "CC-1003", isActive: true,  createdAt: ago(180), updatedAt: ago(20) },
];

// ── Teams ─────────────────────────────────────────────────────────────────────

export const MOCK_TEAMS: MaintenanceTeam[] = [
  { id: "mt-01", organizationId: null, name: "Mechanical Maintenance", description: "Rotating equipment and mechanical systems", leadId: "tech-01", specialty: "MECHANICAL", capacity: 6, createdAt: ago(365), updatedAt: ago(30) },
  { id: "mt-02", organizationId: null, name: "Electrical & Instrumentation", description: "E&I systems, PLC, SCADA",             leadId: "tech-04", specialty: "ELECTRICAL", capacity: 5, createdAt: ago(365), updatedAt: ago(15) },
  { id: "mt-03", organizationId: null, name: "Utilities & HVAC",       description: "Utility systems and HVAC maintenance",      leadId: "tech-06", specialty: "MECHANICAL", capacity: 4, createdAt: ago(300), updatedAt: ago(10) },
  { id: "mt-04", organizationId: null, name: "Shutdown & Project",     description: "Major shutdowns and project work",          leadId: "tech-02", specialty: "STRUCTURAL", capacity: 8, createdAt: ago(200), updatedAt: ago(5) },
];

// ── Technicians ───────────────────────────────────────────────────────────────

export const MOCK_TECHNICIANS: MaintenanceTechnician[] = [
  { id: "tech-01", organizationId: null, userId: null, name: "Reza Ahmadi",      employeeId: "EMP-001", specialty: "MECHANICAL",         skills: ["Rotating Equipment","Pumps","Compressors"],       certifications: ["ISO 55001","CMRP"],          teamId: "mt-01", isAvailable: true,  laborRate: 45,  phone: "+98-901-1234567", email: "r.ahmadi@plant.local", createdAt: ago(730), updatedAt: ago(2) },
  { id: "tech-02", organizationId: null, userId: null, name: "Hassan Moradi",    employeeId: "EMP-002", specialty: "MECHANICAL",         skills: ["Welding","Piping","Structural"],                   certifications: ["AWS D1.1","ASME B31.3"],     teamId: "mt-04", isAvailable: false, laborRate: 50,  phone: "+98-912-2345678", email: "h.moradi@plant.local", createdAt: ago(600), updatedAt: ago(1) },
  { id: "tech-03", organizationId: null, userId: null, name: "Ali Karimi",       employeeId: "EMP-003", specialty: "ELECTRICAL",         skills: ["MCC","VFD","Motor Rewinding"],                     certifications: ["NFPA 70E","IEC 60364"],      teamId: "mt-02", isAvailable: true,  laborRate: 48,  phone: "+98-913-3456789", email: "a.karimi@plant.local", createdAt: ago(500), updatedAt: ago(3) },
  { id: "tech-04", organizationId: null, userId: null, name: "Sara Hosseini",    employeeId: "EMP-004", specialty: "INSTRUMENTATION",    skills: ["PLC","SCADA","DCS","Calibration"],                 certifications: ["ISA CCST","IEC 61511"],      teamId: "mt-02", isAvailable: true,  laborRate: 55,  phone: "+98-914-4567890", email: "s.hosseini@plant.local", createdAt: ago(400), updatedAt: ago(1) },
  { id: "tech-05", organizationId: null, userId: null, name: "Mohammad Nazari",  employeeId: "EMP-005", specialty: "MECHANICAL",         skills: ["Hydraulics","Pneumatics","Seals"],                 certifications: ["ISO 17359","MOBIUS"],        teamId: "mt-01", isAvailable: true,  laborRate: 42,  phone: "+98-915-5678901", email: "m.nazari@plant.local", createdAt: ago(300), updatedAt: ago(4) },
  { id: "tech-06", organizationId: null, userId: null, name: "Fatima Rezaei",    employeeId: "EMP-006", specialty: "HVAC",               skills: ["Chillers","Cooling Towers","HVAC Controls"],       certifications: ["ASHRAE","RSES"],            teamId: "mt-03", isAvailable: true,  laborRate: 40,  phone: "+98-916-6789012", email: "f.rezaei@plant.local", createdAt: ago(250), updatedAt: ago(2) },
  { id: "tech-07", organizationId: null, userId: null, name: "Javad Tehrani",    employeeId: "EMP-007", specialty: "MECHANICAL",         skills: ["Vibration Analysis","Alignment","Balancing"],     certifications: ["ISO 18436","ASNT VT-2"],    teamId: "mt-01", isAvailable: true,  laborRate: 52,  phone: "+98-917-7890123", email: "j.tehrani@plant.local", createdAt: ago(200), updatedAt: ago(1) },
  { id: "tech-08", organizationId: null, userId: null, name: "Narges Bagheri",   employeeId: "EMP-008", specialty: "ELECTRICAL",         skills: ["Transformers","Switchgear","Protection Relay"],    certifications: ["IEC 60076","IEEE Std 80"],  teamId: "mt-02", isAvailable: false, laborRate: 58,  phone: "+98-918-8901234", email: "n.bagheri@plant.local", createdAt: ago(180), updatedAt: ago(3) },
];

// ── Failure Codes ─────────────────────────────────────────────────────────────

export const MOCK_FAILURE_CODES: FailureCode[] = [
  { id: "fc-01", code: "MECH-BRG-001", name: "Bearing Failure",          category: "MECHANICAL",       description: "Rolling element bearing damage",       severity: "MAJOR",    isActive: true, createdAt: ago(365) },
  { id: "fc-02", code: "MECH-SEAL-001",name: "Mechanical Seal Leak",     category: "MECHANICAL",       description: "Pump or compressor seal failure",      severity: "MODERATE", isActive: true, createdAt: ago(365) },
  { id: "fc-03", code: "ELEC-MOT-001", name: "Motor Winding Short",      category: "ELECTRICAL",       description: "Insulation breakdown in motor winding",severity: "CRITICAL", isActive: true, createdAt: ago(365) },
  { id: "fc-04", code: "INST-TXM-001", name: "Transmitter Drift",        category: "INSTRUMENTATION",  description: "Process transmitter out of calibration",severity: "MINOR",    isActive: true, createdAt: ago(365) },
  { id: "fc-05", code: "MECH-VIB-001", name: "High Vibration",           category: "MECHANICAL",       description: "Excessive equipment vibration",        severity: "MAJOR",    isActive: true, createdAt: ago(365) },
  { id: "fc-06", code: "ELEC-PLC-001", name: "PLC Fault",                category: "SOFTWARE",         description: "Programmable controller fault",        severity: "CRITICAL", isActive: true, createdAt: ago(300) },
  { id: "fc-07", code: "HYDR-PUMP-001",name: "Hydraulic Pump Cavitation",category: "HYDRAULIC",        description: "Pump cavitation / low suction pressure",severity: "MAJOR",   isActive: true, createdAt: ago(300) },
  { id: "fc-08", code: "PNEU-COMP-001",name: "Air Compressor Overload",  category: "PNEUMATIC",        description: "Compressor thermal overload trip",     severity: "MODERATE", isActive: true, createdAt: ago(300) },
  { id: "fc-09", code: "ELEC-TRF-001", name: "Transformer Oil Leak",     category: "ELECTRICAL",       description: "Transformer oil containment failure",  severity: "MAJOR",    isActive: true, createdAt: ago(200) },
  { id: "fc-10", code: "MECH-COUP-001",name: "Coupling Failure",         category: "MECHANICAL",       description: "Flexible coupling element failure",    severity: "MODERATE", isActive: true, createdAt: ago(200) },
];

// ── Maintenance Plans ─────────────────────────────────────────────────────────

export const MOCK_PLANS: MaintenancePlan[] = [
  { id: "plan-01", organizationId: null, assetId: "asset-pump-101", workCenterId: "wc-01", name: "Centrifugal Pump P-101 PM",         description: "Monthly preventive maintenance for feed pump P-101",           maintenanceType: "PREVENTIVE",  priority: "HIGH",   frequencyDays: 30,  estimatedHours: 4,   leadTimeDays: 7, isActive: true,  lastExecutedAt: ago(25), nextDueAt: from(5),  createdBy: "admin", createdAt: ago(365), updatedAt: ago(2), _count: { tasks: 12, schedules: 2 } },
  { id: "plan-02", organizationId: null, assetId: "asset-comp-201", workCenterId: "wc-01", name: "Air Compressor C-201 PM",           description: "Quarterly service for rotary screw compressor C-201",          maintenanceType: "PREVENTIVE",  priority: "HIGH",   frequencyDays: 90,  estimatedHours: 8,   leadTimeDays: 14,isActive: true,  lastExecutedAt: ago(70), nextDueAt: from(20), createdBy: "admin", createdAt: ago(300), updatedAt: ago(5), _count: { tasks: 4,  schedules: 1 } },
  { id: "plan-03", organizationId: null, assetId: "asset-hvac-301", workCenterId: "wc-03", name: "HVAC Chiller CH-301 Inspection",    description: "Bi-annual chiller inspection and refrigerant check",           maintenanceType: "INSPECTION",  priority: "MEDIUM", frequencyDays: 180, estimatedHours: 6,   leadTimeDays: 10,isActive: true,  lastExecutedAt: ago(160),nextDueAt: from(20), createdBy: "admin", createdAt: ago(365), updatedAt: ago(3), _count: { tasks: 2,  schedules: 1 } },
  { id: "plan-04", organizationId: null, assetId: "asset-trx-401",  workCenterId: "wc-05", name: "HV Transformer TR-401 Annual",      description: "Annual electrical testing and oil analysis for 11kV transformer",maintenanceType: "PREVENTIVE", priority: "CRITICAL",frequencyDays: 365, estimatedHours: 12,  leadTimeDays: 21,isActive: true,  lastExecutedAt: ago(330),nextDueAt: from(35), createdBy: "admin", createdAt: ago(365), updatedAt: ago(7), _count: { tasks: 1,  schedules: 1 } },
  { id: "plan-05", organizationId: null, assetId: "asset-plc-501",  workCenterId: "wc-04", name: "PLC/SCADA System Health Check",     description: "Monthly PLC program backup and IO card inspection",            maintenanceType: "PREVENTIVE",  priority: "HIGH",   frequencyDays: 30,  estimatedHours: 3,   leadTimeDays: 5, isActive: true,  lastExecutedAt: ago(28), nextDueAt: from(2),  createdBy: "admin", createdAt: ago(200), updatedAt: ago(1), _count: { tasks: 6,  schedules: 2 } },
  { id: "plan-06", organizationId: null, assetId: "asset-pump-102", workCenterId: "wc-01", name: "Lube Oil System Inspection",        description: "Weekly lube oil level, quality and pressure check",           maintenanceType: "LUBRICATION", priority: "MEDIUM", frequencyDays: 7,   estimatedHours: 1.5, leadTimeDays: 2, isActive: true,  lastExecutedAt: ago(6),  nextDueAt: from(1),  createdBy: "admin", createdAt: ago(180), updatedAt: ago(1), _count: { tasks: 24, schedules: 4 } },
  { id: "plan-07", organizationId: null, assetId: "asset-inst-601", workCenterId: "wc-04", name: "Flow Meter Calibration",           description: "Quarterly calibration for process flow meters",               maintenanceType: "CALIBRATION", priority: "HIGH",   frequencyDays: 90,  estimatedHours: 5,   leadTimeDays: 10,isActive: true,  lastExecutedAt: ago(80), nextDueAt: from(10), createdBy: "admin", createdAt: ago(365), updatedAt: ago(4), _count: { tasks: 4,  schedules: 1 } },
  { id: "plan-08", organizationId: null, assetId: null,            workCenterId: "wc-02", name: "Annual Plant Shutdown Maintenance", description: "Full plant shutdown maintenance scope",                        maintenanceType: "SHUTDOWN",    priority: "CRITICAL",frequencyDays: 365, estimatedHours: 480, leadTimeDays: 90,isActive: true,  lastExecutedAt: ago(300),nextDueAt: from(65), createdBy: "admin", createdAt: ago(365), updatedAt: ago(10),_count: { tasks: 3,  schedules: 1 } },
];

// ── Maintenance Tasks / Work Orders ───────────────────────────────────────────

export const MOCK_TASKS: MaintenanceTask[] = [
  { id: "task-01", organizationId: null, planId: "plan-01", assetId: "asset-pump-101", workCenterId: "wc-01", failureId: null, workOrderType: "PLANNED",   title: "P-101 Monthly PM — June 2026",          description: "Monthly inspection, lubrication, seal check, and performance test for pump P-101",           maintenanceType: "PREVENTIVE",  priority: "HIGH",     status: "IN_PROGRESS", scheduledDate: ago(1),   dueDate: from(2),   startedAt: ago(1),   completedAt: null,  estimatedHours: 4,   actualHours: 2.5,  technicianId: "tech-01", teamId: "mt-01", workCenterCode: "WC-PROD-A", erpWorkOrderId: "WO-2026-0601", vendorId: null, requiresApproval: false, approvalStatus: null, createdBy: "admin", deletedAt: null, createdAt: ago(10),  updatedAt: ago(1) },
  { id: "task-02", organizationId: null, planId: "plan-02", assetId: "asset-comp-201", workCenterId: "wc-01", failureId: null, workOrderType: "PLANNED",   title: "C-201 Quarterly Service Q2 2026",        description: "Full quarterly service: oil change, belt inspection, filter replacement, intercooler check",  maintenanceType: "PREVENTIVE",  priority: "HIGH",     status: "SCHEDULED",   scheduledDate: from(20), dueDate: from(25),  startedAt: null,     completedAt: null,  estimatedHours: 8,   actualHours: null, technicianId: "tech-01", teamId: "mt-01", workCenterCode: "WC-PROD-A", erpWorkOrderId: "WO-2026-0602", vendorId: null, requiresApproval: true,  approvalStatus: "PENDING",   createdBy: "admin", deletedAt: null, createdAt: ago(5),   updatedAt: ago(2) },
  { id: "task-03", organizationId: null, planId: null,      assetId: "asset-pump-101", workCenterId: "wc-01", failureId: "fail-01", workOrderType: "UNPLANNED", title: "P-101 Mechanical Seal Emergency Repair",description: "Emergency repair of failed mechanical seal causing process leak",                            maintenanceType: "CORRECTIVE",  priority: "EMERGENCY", status: "COMPLETED",   scheduledDate: ago(15),  dueDate: ago(15),   startedAt: ago(15),  completedAt: ago(14),estimatedHours: 6,   actualHours: 7,    technicianId: "tech-02", teamId: "mt-01", workCenterCode: "WC-PROD-A", erpWorkOrderId: "WO-2026-0550", vendorId: null, requiresApproval: true,  approvalStatus: "APPROVED",  createdBy: "tech-01",deletedAt: null, createdAt: ago(15),  updatedAt: ago(14) },
  { id: "task-04", organizationId: null, planId: "plan-07", assetId: "asset-inst-601", workCenterId: "wc-04", failureId: null, workOrderType: "PLANNED",   title: "FT-601 Flow Meter Calibration Q2",       description: "Quarterly calibration verification against NIST traceable standards",                        maintenanceType: "CALIBRATION", priority: "HIGH",     status: "PLANNED",     scheduledDate: from(10), dueDate: from(12),  startedAt: null,     completedAt: null,  estimatedHours: 5,   actualHours: null, technicianId: "tech-04", teamId: "mt-02", workCenterCode: "WC-INST",   erpWorkOrderId: null,           vendorId: null, requiresApproval: false, approvalStatus: null, createdBy: "admin", deletedAt: null, createdAt: ago(3),   updatedAt: ago(1) },
  { id: "task-05", organizationId: null, planId: "plan-05", assetId: "asset-plc-501",  workCenterId: "wc-04", failureId: null, workOrderType: "PLANNED",   title: "PLC Health Check & Backup — June 2026",  description: "Monthly PLC program backup, IO verification, UPS battery test",                             maintenanceType: "PREVENTIVE",  priority: "HIGH",     status: "PLANNED",     scheduledDate: from(2),  dueDate: from(4),   startedAt: null,     completedAt: null,  estimatedHours: 3,   actualHours: null, technicianId: "tech-04", teamId: "mt-02", workCenterCode: "WC-INST",   erpWorkOrderId: null,           vendorId: null, requiresApproval: false, approvalStatus: null, createdBy: "admin", deletedAt: null, createdAt: ago(2),   updatedAt: ago(1) },
  { id: "task-06", organizationId: null, planId: "plan-06", assetId: "asset-pump-102", workCenterId: "wc-01", failureId: null, workOrderType: "PLANNED",   title: "Weekly Lube Oil Check — Week 26",        description: "Weekly lube oil level, pressure differential, and sample collection",                       maintenanceType: "LUBRICATION", priority: "MEDIUM",   status: "OVERDUE",     scheduledDate: ago(3),   dueDate: ago(2),    startedAt: null,     completedAt: null,  estimatedHours: 1.5, actualHours: null, technicianId: "tech-05", teamId: "mt-01", workCenterCode: "WC-PROD-A", erpWorkOrderId: null,           vendorId: null, requiresApproval: false, approvalStatus: null, createdBy: "admin", deletedAt: null, createdAt: ago(10),  updatedAt: ago(3) },
  { id: "task-07", organizationId: null, planId: "plan-03", assetId: "asset-hvac-301", workCenterId: "wc-03", failureId: null, workOrderType: "PLANNED",   title: "CH-301 Chiller Bi-Annual Inspection",    description: "Bi-annual inspection: refrigerant levels, heat exchanger fouling, controls calibration",     maintenanceType: "INSPECTION",  priority: "MEDIUM",   status: "SCHEDULED",   scheduledDate: from(18), dueDate: from(22),  startedAt: null,     completedAt: null,  estimatedHours: 6,   actualHours: null, technicianId: "tech-06", teamId: "mt-03", workCenterCode: "WC-UTIL",   erpWorkOrderId: null,           vendorId: "vnd-02",requiresApproval: true,  approvalStatus: "APPROVED",  createdBy: "admin", deletedAt: null, createdAt: ago(7),   updatedAt: ago(2) },
  { id: "task-08", organizationId: null, planId: "plan-04", assetId: "asset-trx-401",  workCenterId: "wc-05", failureId: null, workOrderType: "PLANNED",   title: "TR-401 Annual Electrical Testing",       description: "Annual HV testing, oil sampling, DGA analysis, relay testing",                              maintenanceType: "PREVENTIVE",  priority: "CRITICAL", status: "PLANNED",     scheduledDate: from(35), dueDate: from(40),  startedAt: null,     completedAt: null,  estimatedHours: 12,  actualHours: null, technicianId: "tech-03", teamId: "mt-02", workCenterCode: "WC-ELEC",   erpWorkOrderId: "WO-2026-0603", vendorId: "vnd-01",requiresApproval: true,  approvalStatus: "PENDING",   createdBy: "admin", deletedAt: null, createdAt: ago(1),   updatedAt: ago(1) },
  { id: "task-09", organizationId: null, planId: null,      assetId: "asset-comp-201", workCenterId: "wc-01", failureId: "fail-02", workOrderType: "UNPLANNED", title: "C-201 Bearing Replacement",             description: "Replace failed #3 bearing, shaft inspection, coupling check",                               maintenanceType: "CORRECTIVE",  priority: "HIGH",     status: "COMPLETED",   scheduledDate: ago(30),  dueDate: ago(28),   startedAt: ago(30),  completedAt: ago(29),estimatedHours: 10,  actualHours: 11,   technicianId: "tech-07", teamId: "mt-01", workCenterCode: "WC-PROD-A", erpWorkOrderId: "WO-2026-0510", vendorId: null, requiresApproval: true,  approvalStatus: "APPROVED",  createdBy: "tech-07",deletedAt: null, createdAt: ago(30),  updatedAt: ago(29) },
  { id: "task-10", organizationId: null, planId: null,      assetId: "asset-plc-501",  workCenterId: "wc-04", failureId: "fail-03", workOrderType: "EMERGENCY", title: "PLC-501 Emergency Recovery",             description: "Emergency PLC fault recovery after unexpected power surge",                                  maintenanceType: "EMERGENCY",   priority: "EMERGENCY", status: "COMPLETED",  scheduledDate: ago(5),   dueDate: ago(5),    startedAt: ago(5),   completedAt: ago(5), estimatedHours: 2,   actualHours: 3,    technicianId: "tech-04", teamId: "mt-02", workCenterCode: "WC-INST",   erpWorkOrderId: "WO-2026-0590", vendorId: null, requiresApproval: false, approvalStatus: null, createdBy: "tech-04",deletedAt: null, createdAt: ago(5),   updatedAt: ago(5) },
  { id: "task-11", organizationId: null, planId: "plan-01", assetId: "asset-pump-101", workCenterId: "wc-01", failureId: null, workOrderType: "PLANNED",   title: "P-101 Monthly PM — May 2026",           description: "Monthly PM completed — all parameters within limits",                                       maintenanceType: "PREVENTIVE",  priority: "HIGH",     status: "COMPLETED",   scheduledDate: ago(31),  dueDate: ago(28),   startedAt: ago(30),  completedAt: ago(29),estimatedHours: 4,   actualHours: 3.5,  technicianId: "tech-01", teamId: "mt-01", workCenterCode: "WC-PROD-A", erpWorkOrderId: "WO-2026-0501", vendorId: null, requiresApproval: false, approvalStatus: null, createdBy: "admin", deletedAt: null, createdAt: ago(45),  updatedAt: ago(29) },
  { id: "task-12", organizationId: null, planId: null,      assetId: "asset-hvac-301", workCenterId: "wc-03", failureId: null, workOrderType: "PROJECT",   title: "HVAC Retrofit — Inverter Drive Install",description: "Install VFD on chilled water pump for energy optimization",                                 maintenanceType: "CORRECTIVE",  priority: "MEDIUM",   status: "DRAFT",       scheduledDate: from(45), dueDate: from(60),  startedAt: null,     completedAt: null,  estimatedHours: 16,  actualHours: null, technicianId: null,      teamId: "mt-04", workCenterCode: "WC-UTIL",   erpWorkOrderId: "WO-2026-0650", vendorId: "vnd-03",requiresApproval: true,  approvalStatus: "PENDING",   createdBy: "admin", deletedAt: null, createdAt: ago(1),   updatedAt: ago(1) },
];

// ── Failures ──────────────────────────────────────────────────────────────────

export const MOCK_FAILURES: MaintenanceFailure[] = [
  {
    id: "fail-01", organizationId: null, assetId: "asset-pump-101", taskId: "task-03", failureCodeId: "fc-02",
    title: "P-101 Mechanical Seal Failure",
    description: "Sudden process liquid leak from mechanical seal of centrifugal pump P-101 during normal operation. Leak rate approx. 2 L/min causing production shutdown.",
    severity: "MAJOR", category: "MECHANICAL", occurredAt: ago(15), detectedAt: ago(15), resolvedAt: ago(14),
    downtimeMinutes: 420, reportedBy: "tech-05", createdAt: ago(15), updatedAt: ago(14),
    causes: [
      { id: "fc-c-01", failureId: "fail-01", cause: "Seal face wear due to contaminated process fluid", probability: 0.8, isConfirmed: true,  notes: "Carbon particles found on seal faces", createdAt: ago(14) },
      { id: "fc-c-02", failureId: "fail-01", cause: "Excessive vibration from misaligned coupling",     probability: 0.6, isConfirmed: true,  notes: "Coupling alignment re-checked after repair", createdAt: ago(14) },
      { id: "fc-c-03", failureId: "fail-01", cause: "Overdue seal flush system maintenance",            probability: 0.4, isConfirmed: false, notes: "Flush plan API Plan 11 needs review",   createdAt: ago(14) },
    ],
    correctiveActions: [
      { id: "ca-01", failureId: "fail-01", action: "Replace mechanical seal with upgraded AISI 316L faces", assignedTo: "tech-02", dueDate: ago(14), completedAt: ago(14), status: "CLOSED", notes: "Upgraded to cartridge-type seal", createdAt: ago(14), updatedAt: ago(14) },
      { id: "ca-02", failureId: "fail-01", action: "Re-align pump-motor coupling to ≤0.05mm TIR",         assignedTo: "tech-07", dueDate: ago(13), completedAt: ago(13), status: "CLOSED", notes: "Final alignment 0.03mm TIR", createdAt: ago(14), updatedAt: ago(13) },
      { id: "ca-03", failureId: "fail-01", action: "Install inline filter on seal flush line",             assignedTo: "tech-01", dueDate: from(5),  completedAt: null,    status: "OPEN",   notes: "50-micron filter ordered", createdAt: ago(14), updatedAt: ago(5) },
    ],
  },
  {
    id: "fail-02", organizationId: null, assetId: "asset-comp-201", taskId: "task-09", failureCodeId: "fc-01",
    title: "C-201 Drive End Bearing Failure",
    description: "Abnormal noise and high vibration on compressor C-201. Bearing temperature 145°C (limit: 95°C). Emergency shutdown required.",
    severity: "CRITICAL", category: "MECHANICAL", occurredAt: ago(31), detectedAt: ago(30), resolvedAt: ago(29),
    downtimeMinutes: 960, reportedBy: "tech-07", createdAt: ago(31), updatedAt: ago(29),
    causes: [
      { id: "fc-c-04", failureId: "fail-02", cause: "Inadequate lubrication — grease degradation",     probability: 0.9, isConfirmed: true,  notes: "Grease sample showed metallic particles", createdAt: ago(29) },
      { id: "fc-c-05", failureId: "fail-02", cause: "Overloading beyond rated capacity",                probability: 0.5, isConfirmed: false, notes: "Suction conditions review pending",       createdAt: ago(29) },
    ],
    correctiveActions: [
      { id: "ca-04", failureId: "fail-02", action: "Replace #3 bearing SKF 6311-2RS",              assignedTo: "tech-07", dueDate: ago(28), completedAt: ago(29), status: "CLOSED", notes: "Installed OEM bearing", createdAt: ago(29), updatedAt: ago(29) },
      { id: "ca-05", failureId: "fail-02", action: "Implement online vibration monitoring on C-201",assignedTo: "tech-04", dueDate: from(30),completedAt: null,    status: "OPEN",   notes: "Sensor procurement in progress", createdAt: ago(29), updatedAt: ago(10) },
    ],
  },
  {
    id: "fail-03", organizationId: null, assetId: "asset-plc-501", taskId: "task-10", failureCodeId: "fc-06",
    title: "PLC-501 CPU Fault After Power Surge",
    description: "PLC-501 (Siemens S7-400) entered STOP mode following a power grid transient. Production line stopped. Manual override required.",
    severity: "CRITICAL", category: "SOFTWARE", occurredAt: ago(5), detectedAt: ago(5), resolvedAt: ago(5),
    downtimeMinutes: 180, reportedBy: "tech-04", createdAt: ago(5), updatedAt: ago(5),
    causes: [
      { id: "fc-c-06", failureId: "fail-03", cause: "Insufficient UPS capacity for full I/O rack",  probability: 0.85, isConfirmed: true,  notes: "UPS runtime 8 min, required 15 min", createdAt: ago(5) },
      { id: "fc-c-07", failureId: "fail-03", cause: "Missing surge protection on power supply",     probability: 0.7,  isConfirmed: true,  notes: "No MOV on 24VDC rail",              createdAt: ago(5) },
    ],
    correctiveActions: [
      { id: "ca-06", failureId: "fail-03", action: "Upgrade UPS to 30-minute runtime capacity", assignedTo: "tech-03", dueDate: from(14), completedAt: null, status: "IN_PROGRESS", notes: "APC SRT5KXLT ordered", createdAt: ago(5), updatedAt: ago(2) },
      { id: "ca-07", failureId: "fail-03", action: "Install surge protection on all PLC power rails", assignedTo: "tech-03", dueDate: from(7), completedAt: null, status: "OPEN", notes: "Phoenix Contact TRABTECH spec reviewed", createdAt: ago(5), updatedAt: ago(5) },
    ],
  },
  {
    id: "fail-04", organizationId: null, assetId: "asset-inst-601", taskId: null, failureCodeId: "fc-04",
    title: "FT-601 Flow Meter Out of Calibration",
    description: "Routine calibration check revealed FT-601 reading 8.2% high vs reference. Affecting material balance calculations for the past 45 days.",
    severity: "MAJOR", category: "INSTRUMENTATION", occurredAt: ago(47), detectedAt: ago(2), resolvedAt: null,
    downtimeMinutes: 0, reportedBy: "tech-04", createdAt: ago(2), updatedAt: ago(2),
    causes: [
      { id: "fc-c-08", failureId: "fail-04", cause: "Fouling on ultrasonic transducers due to scaling", probability: 0.75, isConfirmed: false, notes: "Inspection scheduled", createdAt: ago(2) },
    ],
    correctiveActions: [
      { id: "ca-08", failureId: "fail-04", action: "Clean and re-calibrate FT-601 transducers", assignedTo: "tech-04", dueDate: from(10), completedAt: null, status: "OPEN", notes: "Calibration task created WO task-04", createdAt: ago(2), updatedAt: ago(2) },
    ],
  },
];

// ── Downtime Records ──────────────────────────────────────────────────────────

export const MOCK_DOWNTIME: MaintenanceDowntime[] = [
  { id: "dt-01", organizationId: null, assetId: "asset-pump-101", taskId: "task-03", reason: "BREAKDOWN",         startedAt: ago(15),  endedAt: ago(14),   durationMinutes: 420,  description: "Mechanical seal failure on P-101",           impact: "Production line A stopped. 7 tonnes product loss.",   productionLoss: 42000, currency: "USD", reportedBy: "tech-05", createdAt: ago(15),  updatedAt: ago(14) },
  { id: "dt-02", organizationId: null, assetId: "asset-comp-201", taskId: "task-09", reason: "BREAKDOWN",         startedAt: ago(31),  endedAt: ago(29),   durationMinutes: 960,  description: "Bearing failure on C-201",                   impact: "Compressed air supply reduced 60%. Partial shutdown.", productionLoss: 95000, currency: "USD", reportedBy: "tech-07", createdAt: ago(31),  updatedAt: ago(29) },
  { id: "dt-03", organizationId: null, assetId: "asset-plc-501",  taskId: "task-10", reason: "BREAKDOWN",         startedAt: ago(5),   endedAt: ago(5),    durationMinutes: 180,  description: "PLC-501 CPU fault",                          impact: "Full production line B stopped",                      productionLoss: 31500, currency: "USD", reportedBy: "tech-04", createdAt: ago(5),   updatedAt: ago(5) },
  { id: "dt-04", organizationId: null, assetId: "asset-pump-101", taskId: "task-01", reason: "PLANNED_MAINTENANCE",startedAt: ago(1),   endedAt: from(0),   durationMinutes: 240,  description: "Monthly PM for P-101",                       impact: "Planned: production rerouted to P-102",              productionLoss: 0,     currency: "USD", reportedBy: "tech-01", createdAt: ago(1),   updatedAt: ago(0) },
  { id: "dt-05", organizationId: null, assetId: "asset-hvac-301", taskId: null,      reason: "WAITING_PARTS",     startedAt: ago(12),  endedAt: ago(10),   durationMinutes: 2880, description: "CH-301 waiting for bearing replacement parts", impact: "Cooling capacity reduced 40%. Temperature rise.",     productionLoss: 8500,  currency: "USD", reportedBy: "tech-06", createdAt: ago(12),  updatedAt: ago(10) },
  { id: "dt-06", organizationId: null, assetId: "asset-trx-401",  taskId: null,      reason: "WAITING_APPROVAL",  startedAt: ago(8),   endedAt: ago(7),    durationMinutes: 480,  description: "TR-401 inspection on hold pending approval",  impact: "Non-critical. Power rerouted to backup transformer.", productionLoss: 0,     currency: "USD", reportedBy: "tech-03", createdAt: ago(8),   updatedAt: ago(7) },
  { id: "dt-07", organizationId: null, assetId: "asset-comp-201", taskId: "task-02", reason: "PLANNED_MAINTENANCE",startedAt: from(20), endedAt: from(21),  durationMinutes: 480,  description: "Planned quarterly service for C-201",         impact: "Planned downtime during low-demand period",           productionLoss: 0,     currency: "USD", reportedBy: "admin",   createdAt: ago(5),   updatedAt: ago(5) },
  { id: "dt-08", organizationId: null, assetId: "asset-inst-601", taskId: null,      reason: "BREAKDOWN",         startedAt: ago(47),  endedAt: ago(47),   durationMinutes: 0,    description: "Flow meter drift — no physical shutdown",     impact: "Data quality impact only",                           productionLoss: 0,     currency: "USD", reportedBy: "tech-04", createdAt: ago(2),   updatedAt: ago(2) },
];

// ── Spare Parts ───────────────────────────────────────────────────────────────

export const MOCK_SPARE_PARTS: MaintenanceSparePart[] = [
  { id: "part-01", organizationId: null, partNumber: "SKF-6311-2RS",    name: "Ball Bearing SKF 6311-2RS",             description: "Deep groove ball bearing 55×120×29mm",    category: "Bearing",         manufacturer: "SKF",          unitCost: 185,   currency: "USD", stockQty: 8,  minStockQty: 4,  unit: "pcs",  location: "Warehouse A, Bin B-12", erpItemId: "ERP-ITEM-4521", vendorId: "vnd-01", isActive: true, createdAt: ago(365), updatedAt: ago(30) },
  { id: "part-02", organizationId: null, partNumber: "CRANE-CS-175",    name: "Mechanical Seal Cartridge 1.75\"",      description: "Stationary-mounted cartridge seal for P-101",category: "Seal",           manufacturer: "Crane Engineering",unitCost: 850, currency: "USD", stockQty: 3,  minStockQty: 2,  unit: "pcs",  location: "Warehouse A, Bin S-04", erpItemId: "ERP-ITEM-4522", vendorId: "vnd-01", isActive: true, createdAt: ago(300), updatedAt: ago(15) },
  { id: "part-03", organizationId: null, partNumber: "MOBIL-DTE-46",    name: "Hydraulic Oil Mobil DTE 46",            description: "ISO VG 46 hydraulic oil, anti-wear",     category: "Lubricant",       manufacturer: "ExxonMobil",   unitCost: 12.5, currency: "USD", stockQty: 200,minStockQty: 50, unit: "L",    location: "Lube Room, Tank L-03",  erpItemId: "ERP-ITEM-4580", vendorId: "vnd-04", isActive: true, createdAt: ago(365), updatedAt: ago(7) },
  { id: "part-04", organizationId: null, partNumber: "KLINGER-500-DN50",name: "Gasket Klingersil C-4500 DN50",         description: "Compressed fibre gasket 50mm",           category: "Gasket",          manufacturer: "Klinger",      unitCost: 18,   currency: "USD", stockQty: 24, minStockQty: 10, unit: "pcs",  location: "Warehouse B, Bin G-21", erpItemId: "ERP-ITEM-4590", vendorId: "vnd-02", isActive: true, createdAt: ago(200), updatedAt: ago(20) },
  { id: "part-05", organizationId: null, partNumber: "3M-1000-FILT",    name: "Air Filter Element 3M P100",            description: "Compressor intake filter element",       category: "Filter",          manufacturer: "3M Industrial",unitCost: 65,   currency: "USD", stockQty: 12, minStockQty: 6,  unit: "pcs",  location: "Warehouse A, Bin F-07", erpItemId: "ERP-ITEM-4595", vendorId: "vnd-02", isActive: true, createdAt: ago(180), updatedAt: ago(10) },
  { id: "part-06", organizationId: null, partNumber: "SIEMENS-6ES7-CPU",name: "Siemens S7-400 CPU Module 6ES7-414",   description: "PLC CPU replacement module for S7-400",  category: "Control System",  manufacturer: "Siemens",      unitCost: 3200, currency: "USD", stockQty: 1,  minStockQty: 1,  unit: "pcs",  location: "Control Room, Safe-1",  erpItemId: "ERP-ITEM-4600", vendorId: "vnd-05", isActive: true, createdAt: ago(100), updatedAt: ago(5) },
  { id: "part-07", organizationId: null, partNumber: "PARKER-VFC-1.5",  name: "Parker VFC 1.5\" Check Valve",          description: "Stainless steel check valve 1.5 inch",   category: "Valve",           manufacturer: "Parker",       unitCost: 340,  currency: "USD", stockQty: 5,  minStockQty: 3,  unit: "pcs",  location: "Warehouse B, Bin V-15", erpItemId: "ERP-ITEM-4610", vendorId: "vnd-01", isActive: true, createdAt: ago(150), updatedAt: ago(15) },
  { id: "part-08", organizationId: null, partNumber: "YOKOGAWA-EJA110A",name: "Yokogawa DP Transmitter EJA110A",       description: "Differential pressure transmitter",      category: "Instrument",      manufacturer: "Yokogawa",     unitCost: 1800, currency: "USD", stockQty: 2,  minStockQty: 1,  unit: "pcs",  location: "Instrument Store, IS-4", erpItemId: "ERP-ITEM-4620", vendorId: "vnd-05", isActive: true, createdAt: ago(120), updatedAt: ago(8) },
  { id: "part-09", organizationId: null, partNumber: "LOCTITE-243-50",  name: "Loctite 243 Threadlocker 50ml",         description: "Medium strength blue threadlocker",      category: "Chemical",        manufacturer: "Henkel",       unitCost: 22,   currency: "USD", stockQty: 30, minStockQty: 10, unit: "pcs",  location: "Maintenance Shop, CS-2", erpItemId: "ERP-ITEM-4630", vendorId: "vnd-02", isActive: true, createdAt: ago(200), updatedAt: ago(25) },
  { id: "part-10", organizationId: null, partNumber: "ITT-1.5-SS316",   name: "Centrifugal Pump Impeller 1.5\" SS316", description: "Stainless steel impeller for P-101/P-102",category: "Rotating Part",  manufacturer: "ITT/Goulds",   unitCost: 1250, currency: "USD", stockQty: 2,  minStockQty: 1,  unit: "pcs",  location: "Warehouse A, Bin R-03", erpItemId: "ERP-ITEM-4640", vendorId: "vnd-01", isActive: true, createdAt: ago(90),  updatedAt: ago(20) },
  { id: "part-11", organizationId: null, partNumber: "APC-SRT5KXLT",    name: "APC Smart-UPS SRT 5000VA",              description: "Online double-conversion UPS 5kVA",      category: "Electrical",      manufacturer: "APC/Schneider",unitCost: 4800, currency: "USD", stockQty: 0,  minStockQty: 1,  unit: "pcs",  location: "On order",              erpItemId: "ERP-ITEM-4650", vendorId: "vnd-03", isActive: true, createdAt: ago(5),   updatedAt: ago(2) },
  { id: "part-12", organizationId: null, partNumber: "CASTROL-OPTIEB-320",name: "Castrol Optileb 320 Gear Oil",        description: "ISO VG 320 industrial gear oil",         category: "Lubricant",       manufacturer: "Castrol",      unitCost: 9.5,  currency: "USD", stockQty: 150,minStockQty: 40, unit: "L",    location: "Lube Room, Tank L-05",  erpItemId: "ERP-ITEM-4660", vendorId: "vnd-04", isActive: true, createdAt: ago(300), updatedAt: ago(5) },
];

// ── Maintenance Costs ─────────────────────────────────────────────────────────

export const MOCK_COSTS: MaintenanceCost[] = [
  { id: "cost-01", taskId: "task-03", category: "PARTS",      description: "Mechanical seal cartridge CRANE-CS-175",     amount: 850,  currency: "USD", date: ago(14), invoiceRef: "INV-2026-3401", vendorId: "vnd-01", createdBy: "tech-02", createdAt: ago(14) },
  { id: "cost-02", taskId: "task-03", category: "LABOR",      description: "Tech-02 — 7 hours emergency repair",          amount: 350,  currency: "USD", date: ago(14), invoiceRef: null,             vendorId: null,     createdBy: "admin",   createdAt: ago(13) },
  { id: "cost-03", taskId: "task-09", category: "PARTS",      description: "SKF 6311-2RS bearing × 2",                   amount: 370,  currency: "USD", date: ago(29), invoiceRef: "INV-2026-3200", vendorId: "vnd-01", createdBy: "tech-07", createdAt: ago(29) },
  { id: "cost-04", taskId: "task-09", category: "LABOR",      description: "Tech-07 — 11 hours bearing replacement",      amount: 572,  currency: "USD", date: ago(29), invoiceRef: null,             vendorId: null,     createdBy: "admin",   createdAt: ago(28) },
  { id: "cost-05", taskId: "task-10", category: "LABOR",      description: "Tech-04 — 3 hours emergency PLC recovery",    amount: 165,  currency: "USD", date: ago(5),  invoiceRef: null,             vendorId: null,     createdBy: "admin",   createdAt: ago(5) },
  { id: "cost-06", taskId: "task-01", category: "LABOR",      description: "Tech-01 — 2.5 hours monthly PM (in progress)",amount: 112.5,currency: "USD", date: ago(1),  invoiceRef: null,             vendorId: null,     createdBy: "admin",   createdAt: ago(1) },
  { id: "cost-07", taskId: "task-11", category: "LABOR",      description: "Tech-01 — 3.5 hours monthly PM May",          amount: 157.5,currency: "USD", date: ago(29), invoiceRef: null,             vendorId: null,     createdBy: "admin",   createdAt: ago(29) },
  { id: "cost-08", taskId: "task-11", category: "PARTS",      description: "Consumables and lubricants",                  amount: 45,   currency: "USD", date: ago(29), invoiceRef: null,             vendorId: null,     createdBy: "admin",   createdAt: ago(29) },
  { id: "cost-09", taskId: "task-09", category: "CONTRACTOR", description: "Alignment specialist from Plant Services Ltd", amount: 1200, currency: "USD", date: ago(29), invoiceRef: "INV-2026-3205", vendorId: "vnd-02", createdBy: "admin",   createdAt: ago(28) },
  { id: "cost-10", taskId: "task-03", category: "OVERHEAD",   description: "Production loss allocation (7 hours × $1,000)",amount: 7000, currency: "USD", date: ago(14), invoiceRef: null,             vendorId: null,     createdBy: "admin",   createdAt: ago(12) },
];

// ── Calendar Events ───────────────────────────────────────────────────────────

export const MOCK_CALENDAR: MaintenanceCalendarEvent[] = [
  { id: "cal-01", organizationId: null, taskId: "task-01", title: "P-101 Monthly PM",           description: "Monthly preventive maintenance",     startDate: ago(1),   endDate: from(2),   allDay: false, eventType: "preventive",  assetId: "asset-pump-101", technicianId: "tech-01", priority: "HIGH",     color: "#3b82f6", createdBy: "admin", createdAt: ago(10), updatedAt: ago(1) },
  { id: "cal-02", organizationId: null, taskId: "task-02", title: "C-201 Quarterly Service",    description: "Full quarterly service",            startDate: from(20), endDate: from(21),  allDay: false, eventType: "preventive",  assetId: "asset-comp-201", technicianId: "tech-01", priority: "HIGH",     color: "#3b82f6", createdBy: "admin", createdAt: ago(5),  updatedAt: ago(5) },
  { id: "cal-03", organizationId: null, taskId: "task-04", title: "FT-601 Calibration",         description: "Quarterly calibration",             startDate: from(10), endDate: from(12),  allDay: false, eventType: "calibration", assetId: "asset-inst-601", technicianId: "tech-04", priority: "HIGH",     color: "#8b5cf6", createdBy: "admin", createdAt: ago(3),  updatedAt: ago(3) },
  { id: "cal-04", organizationId: null, taskId: "task-05", title: "PLC Health Check",           description: "Monthly PLC backup",                startDate: from(2),  endDate: from(4),   allDay: false, eventType: "preventive",  assetId: "asset-plc-501",  technicianId: "tech-04", priority: "HIGH",     color: "#3b82f6", createdBy: "admin", createdAt: ago(2),  updatedAt: ago(2) },
  { id: "cal-05", organizationId: null, taskId: "task-07", title: "CH-301 Chiller Inspection",  description: "Bi-annual chiller inspection",       startDate: from(18), endDate: from(22),  allDay: false, eventType: "inspection",  assetId: "asset-hvac-301", technicianId: "tech-06", priority: "MEDIUM",   color: "#10b981", createdBy: "admin", createdAt: ago(7),  updatedAt: ago(7) },
  { id: "cal-06", organizationId: null, taskId: "task-08", title: "TR-401 Annual Electrical",   description: "Annual HV testing",                 startDate: from(35), endDate: from(40),  allDay: false, eventType: "preventive",  assetId: "asset-trx-401",  technicianId: "tech-03", priority: "CRITICAL", color: "#ef4444", createdBy: "admin", createdAt: ago(1),  updatedAt: ago(1) },
  { id: "cal-07", organizationId: null, taskId: null,      title: "Annual Plant Shutdown",       description: "Full plant shutdown maintenance",    startDate: from(65), endDate: from(80),  allDay: true,  eventType: "shutdown",    assetId: null,             technicianId: null,      priority: "CRITICAL", color: "#ef4444", createdBy: "admin", createdAt: ago(10), updatedAt: ago(5) },
  { id: "cal-08", organizationId: null, taskId: "task-06", title: "P-102 Weekly Lube Check",    description: "Weekly lube oil check OVERDUE",     startDate: ago(3),   endDate: ago(2),    allDay: false, eventType: "lubrication", assetId: "asset-pump-102", technicianId: "tech-05", priority: "MEDIUM",   color: "#f59e0b", createdBy: "admin", createdAt: ago(10), updatedAt: ago(3) },
];

// ── History ───────────────────────────────────────────────────────────────────

export const MOCK_HISTORY: MaintenanceHistory[] = [
  { id: "hist-01", taskId: "task-03", userId: "tech-01", action: "TASK_CREATED",     description: "Emergency work order created for P-101 seal failure",              before: null, after: { status: "DRAFT" },        metadata: {}, createdAt: ago(15) },
  { id: "hist-02", taskId: "task-03", userId: "admin",   action: "APPROVAL_GRANTED", description: "Emergency repair approved by Plant Manager",                       before: null, after: { approvalStatus: "APPROVED" }, metadata: {}, createdAt: ago(15) },
  { id: "hist-03", taskId: "task-03", userId: "tech-02", action: "TASK_STARTED",     description: "Technician commenced repair work",                                 before: { status: "PLANNED" }, after: { status: "IN_PROGRESS" }, metadata: {}, createdAt: ago(15) },
  { id: "hist-04", taskId: "task-03", userId: "tech-02", action: "TASK_COMPLETED",   description: "Mechanical seal replaced and pump returned to service",            before: { status: "IN_PROGRESS" }, after: { status: "COMPLETED", actualHours: 7 }, metadata: {}, createdAt: ago(14) },
  { id: "hist-05", taskId: "task-09", userId: "tech-07", action: "TASK_CREATED",     description: "Work order raised for bearing replacement on C-201",               before: null, after: { status: "DRAFT" },        metadata: {}, createdAt: ago(30) },
  { id: "hist-06", taskId: "task-09", userId: "admin",   action: "TASK_APPROVED",    description: "Work order approved for bearing replacement",                      before: null, after: { approvalStatus: "APPROVED" }, metadata: {}, createdAt: ago(30) },
  { id: "hist-07", taskId: "task-09", userId: "tech-07", action: "TASK_COMPLETED",   description: "Bearing replaced, alignment performed, run test OK",               before: { status: "IN_PROGRESS" }, after: { status: "COMPLETED" }, metadata: {}, createdAt: ago(29) },
  { id: "hist-08", taskId: "task-01", userId: "tech-01", action: "TASK_STARTED",     description: "Monthly PM commenced",                                             before: { status: "SCHEDULED" }, after: { status: "IN_PROGRESS" }, metadata: {}, createdAt: ago(1) },
  { id: "hist-09", taskId: "task-02", userId: "admin",   action: "APPROVAL_PENDING", description: "Quarterly service approval requested from Plant Manager",           before: null, after: { approvalStatus: "PENDING" }, metadata: {}, createdAt: ago(2) },
  { id: "hist-10", taskId: "task-10", userId: "tech-04", action: "TASK_COMPLETED",   description: "PLC recovery complete. Backup programs restored. System running.", before: { status: "IN_PROGRESS" }, after: { status: "COMPLETED" }, metadata: {}, createdAt: ago(5) },
];

// ── Comments ──────────────────────────────────────────────────────────────────

export const MOCK_COMMENTS: MaintenanceComment[] = [
  { id: "cmt-01", taskId: "task-01", userId: "tech-01",  content: "Seal condition acceptable — no leakage detected. Bearing temperatures normal. Vibration within limits.",        isInternal: false, createdAt: ago(1),  updatedAt: ago(1) },
  { id: "cmt-02", taskId: "task-01", userId: "tech-01",  content: "Note: inlet strainer 35% blocked. Recommend cleaning during next scheduled opportunity.",                      isInternal: true,  createdAt: ago(1),  updatedAt: ago(1) },
  { id: "cmt-03", taskId: "task-03", userId: "tech-02",  content: "Old seal showed heavy carbon deposits on stationary face. Upgraded to cartridge type for easier future replacement.", isInternal: false, createdAt: ago(14), updatedAt: ago(14) },
  { id: "cmt-04", taskId: "task-09", userId: "tech-07",  content: "Final alignment reading 0.031mm TIR — within 0.05mm spec. Vibration post-restart: 0.8 mm/s RMS (was 12.4).",  isInternal: false, createdAt: ago(29), updatedAt: ago(29) },
  { id: "cmt-05", taskId: "task-02", userId: "admin",    content: "Please ensure spare parts are pre-positioned 1 week before scheduled date. Contact supplier for oil delivery.", isInternal: true,  createdAt: ago(2),  updatedAt: ago(2) },
];

// ── Approvals ─────────────────────────────────────────────────────────────────

export const MOCK_APPROVALS: MaintenanceApproval[] = [
  { id: "appr-01", taskId: "task-03", stage: 1, approverRole: "admin",    assignedTo: "admin",  status: "APPROVED", comment: "Emergency approved — proceed immediately",   decidedAt: ago(15), decidedBy: "admin", dueDate: ago(14), createdAt: ago(15), updatedAt: ago(15) },
  { id: "appr-02", taskId: "task-09", stage: 1, approverRole: "admin",    assignedTo: "admin",  status: "APPROVED", comment: "Approved — critical bearing replacement",     decidedAt: ago(30), decidedBy: "admin", dueDate: ago(29), createdAt: ago(30), updatedAt: ago(30) },
  { id: "appr-03", taskId: "task-02", stage: 1, approverRole: "admin",    assignedTo: "admin",  status: "PENDING",  comment: null,                                         decidedAt: null,    decidedBy: null,   dueDate: from(15),createdAt: ago(2),  updatedAt: ago(2) },
  { id: "appr-04", taskId: "task-07", stage: 1, approverRole: "engineer",  assignedTo: "tech-04",status: "APPROVED", comment: "Vendor confirmed, proceed with schedule",     decidedAt: ago(5),  decidedBy: "tech-04",dueDate: ago(4),createdAt: ago(7),  updatedAt: ago(5) },
  { id: "appr-05", taskId: "task-08", stage: 1, approverRole: "admin",    assignedTo: "admin",  status: "PENDING",  comment: null,                                         decidedAt: null,    decidedBy: null,   dueDate: from(30),createdAt: ago(1),  updatedAt: ago(1) },
  { id: "appr-06", taskId: "task-12", stage: 1, approverRole: "admin",    assignedTo: "admin",  status: "PENDING",  comment: null,                                         decidedAt: null,    decidedBy: null,   dueDate: from(40),createdAt: ago(1),  updatedAt: ago(1) },
];

// ── Schedules ─────────────────────────────────────────────────────────────────

export const MOCK_SCHEDULES_DATA: MaintenanceSchedule[] = [
  { id: "sch-01", organizationId: null, planId: "plan-01", assetId: "asset-pump-101", taskId: "task-01", name: "P-101 PM June 2026",       scheduledDate: ago(1),   estimatedHours: 4,   priority: "HIGH",     status: "IN_PROGRESS", technicianId: "tech-01", teamId: "mt-01", notes: null,                   completedAt: null,   createdBy: "admin", createdAt: ago(10), updatedAt: ago(1) },
  { id: "sch-02", organizationId: null, planId: "plan-01", assetId: "asset-pump-101", taskId: null,      name: "P-101 PM July 2026",       scheduledDate: from(29), estimatedHours: 4,   priority: "HIGH",     status: "PLANNED",     technicianId: "tech-01", teamId: "mt-01", notes: null,                   completedAt: null,   createdBy: "admin", createdAt: ago(5),  updatedAt: ago(5) },
  { id: "sch-03", organizationId: null, planId: "plan-02", assetId: "asset-comp-201", taskId: "task-02", name: "C-201 Q2 Service 2026",    scheduledDate: from(20), estimatedHours: 8,   priority: "HIGH",     status: "SCHEDULED",   technicianId: "tech-01", teamId: "mt-01", notes: "Pre-order oil filters",  completedAt: null,   createdBy: "admin", createdAt: ago(5),  updatedAt: ago(5) },
  { id: "sch-04", organizationId: null, planId: "plan-03", assetId: "asset-hvac-301", taskId: "task-07", name: "CH-301 Inspection H2 2026",scheduledDate: from(18), estimatedHours: 6,   priority: "MEDIUM",   status: "SCHEDULED",   technicianId: "tech-06", teamId: "mt-03", notes: null,                   completedAt: null,   createdBy: "admin", createdAt: ago(7),  updatedAt: ago(7) },
  { id: "sch-05", organizationId: null, planId: "plan-05", assetId: "asset-plc-501",  taskId: "task-05", name: "PLC Check June 2026",      scheduledDate: from(2),  estimatedHours: 3,   priority: "HIGH",     status: "PLANNED",     technicianId: "tech-04", teamId: "mt-02", notes: null,                   completedAt: null,   createdBy: "admin", createdAt: ago(2),  updatedAt: ago(2) },
  { id: "sch-06", organizationId: null, planId: "plan-06", assetId: "asset-pump-102", taskId: "task-06", name: "Lube Check Week 26",       scheduledDate: ago(3),   estimatedHours: 1.5, priority: "MEDIUM",   status: "OVERDUE",     technicianId: "tech-05", teamId: "mt-01", notes: null,                   completedAt: null,   createdBy: "admin", createdAt: ago(10), updatedAt: ago(3) },
  { id: "sch-07", organizationId: null, planId: "plan-07", assetId: "asset-inst-601", taskId: "task-04", name: "FT-601 Calibration Q2",    scheduledDate: from(10), estimatedHours: 5,   priority: "HIGH",     status: "PLANNED",     technicianId: "tech-04", teamId: "mt-02", notes: null,                   completedAt: null,   createdBy: "admin", createdAt: ago(3),  updatedAt: ago(3) },
  { id: "sch-08", organizationId: null, planId: "plan-04", assetId: "asset-trx-401",  taskId: "task-08", name: "TR-401 Annual Test 2026",  scheduledDate: from(35), estimatedHours: 12,  priority: "CRITICAL", status: "PLANNED",     technicianId: "tech-03", teamId: "mt-02", notes: "Coordinate with utility co",completedAt: null,  createdBy: "admin", createdAt: ago(1),  updatedAt: ago(1) },
];

// ── Notifications ─────────────────────────────────────────────────────────────

export const MOCK_NOTIFICATIONS: MaintenanceNotification[] = [
  { id: "notif-01", taskId: "task-06", userId: "tech-05", type: "TASK_OVERDUE",    title: "Work Order Overdue",     message: "P-102 Weekly Lube Check is 3 days overdue",             isRead: false, readAt: null,   sentAt: ago(1) },
  { id: "notif-02", taskId: "task-02", userId: "admin",   type: "APPROVAL_NEEDED", title: "Approval Required",      message: "C-201 Quarterly Service requires your approval",         isRead: false, readAt: null,   sentAt: ago(2) },
  { id: "notif-03", taskId: "task-05", userId: "tech-04", type: "TASK_DUE_SOON",   title: "Task Due in 2 Days",     message: "PLC Health Check is scheduled for day after tomorrow",   isRead: true,  readAt: ago(1), sentAt: ago(2) },
  { id: "notif-04", taskId: "task-03", userId: "admin",   type: "FAILURE_ALERT",   title: "Critical Failure Alert", message: "Emergency repair completed — P-101 back in service",     isRead: true,  readAt: ago(13),sentAt: ago(14) },
  { id: "notif-05", taskId: "task-08", userId: "admin",   type: "APPROVAL_NEEDED", title: "Approval Required",      message: "TR-401 Annual Electrical Testing requires your approval", isRead: false, readAt: null,  sentAt: ago(1) },
];
