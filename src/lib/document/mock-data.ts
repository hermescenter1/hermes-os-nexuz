// Phase 69 — EDMS deterministic mock data

import type {
  EdmsFolder, EdmsCategory, EdmsTemplate, EdmsRetentionPolicy,
  EdmsDocument, EdmsRevision, EdmsApproval, EdmsComment, EdmsTag,
  EdmsAudit, EdmsAttachment, EdmsMetadata, EdmsFavorite, EdmsCheckout,
  EdmsShare,
} from "./types";

const NOW = new Date("2026-06-25T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const from = (d: number) => new Date(NOW.getTime() + d * 86400000).toISOString();

// ── Folders ───────────────────────────────────────────────────────────────────

export const MOCK_FOLDERS: EdmsFolder[] = [
  { id: "fld-eng",           organizationId: null, parentId: null,      name: "Engineering",         description: "Engineering drawings and technical documents", path: "/Engineering",                    color: "#3b82f6", icon: "⚙️",  createdBy: "admin", deletedAt: null, createdAt: ago(180), updatedAt: ago(5) },
  { id: "fld-eng-pid",       organizationId: null, parentId: "fld-eng", name: "P&ID Diagrams",       description: "Process & Instrumentation Diagrams",           path: "/Engineering/P&ID Diagrams",      color: "#3b82f6", icon: "📐", createdBy: "admin", deletedAt: null, createdAt: ago(180), updatedAt: ago(5) },
  { id: "fld-eng-elec",      organizationId: null, parentId: "fld-eng", name: "Electrical Drawings",  description: "Electrical schematic drawings",                 path: "/Engineering/Electrical Drawings", color: "#f59e0b", icon: "⚡", createdBy: "admin", deletedAt: null, createdAt: ago(180), updatedAt: ago(3) },
  { id: "fld-eng-plc",       organizationId: null, parentId: "fld-eng", name: "PLC Programs",         description: "PLC logic programs and ladder diagrams",        path: "/Engineering/PLC Programs",       color: "#8b5cf6", icon: "💾", createdBy: "admin", deletedAt: null, createdAt: ago(90),  updatedAt: ago(2) },
  { id: "fld-vendor",        organizationId: null, parentId: null,      name: "Vendor Documents",     description: "Vendor-supplied datasheets and manuals",        path: "/Vendor Documents",               color: "#10b981", icon: "📦", createdBy: "admin", deletedAt: null, createdAt: ago(120), updatedAt: ago(4) },
  { id: "fld-vendor-ds",     organizationId: null, parentId: "fld-vendor",name: "Datasheets",         description: "Equipment and component datasheets",            path: "/Vendor Documents/Datasheets",    color: "#10b981", icon: "📄", createdBy: "admin", deletedAt: null, createdAt: ago(120), updatedAt: ago(4) },
  { id: "fld-vendor-cert",   organizationId: null, parentId: "fld-vendor",name: "Certificates",       description: "Vendor and product certificates",               path: "/Vendor Documents/Certificates",  color: "#10b981", icon: "🏆", createdBy: "admin", deletedAt: null, createdAt: ago(90),  updatedAt: ago(6) },
  { id: "fld-compliance",    organizationId: null, parentId: null,      name: "Compliance",           description: "Legal, compliance and contractual documents",   path: "/Compliance",                     color: "#ef4444", icon: "⚖️",  createdBy: "admin", deletedAt: null, createdAt: ago(150), updatedAt: ago(7) },
  { id: "fld-compliance-contract", organizationId: null, parentId: "fld-compliance", name: "Contracts", description: "Legal contracts and agreements",            path: "/Compliance/Contracts",           color: "#ef4444", icon: "📝", createdBy: "admin", deletedAt: null, createdAt: ago(150), updatedAt: ago(7) },
  { id: "fld-academy",       organizationId: null, parentId: null,      name: "Academy",              description: "Training materials and course documents",       path: "/Academy",                        color: "#f97316", icon: "🎓", createdBy: "admin", deletedAt: null, createdAt: ago(60),  updatedAt: ago(1) },
];

// ── Categories ────────────────────────────────────────────────────────────────

export const MOCK_CATEGORIES: EdmsCategory[] = [
  { id: "cat-eng",     organizationId: null, name: "Engineering",      description: "Technical engineering documents",    color: "#3b82f6", createdAt: ago(180), updatedAt: ago(5) },
  { id: "cat-vendor",  organizationId: null, name: "Vendor",           description: "Vendor-supplied documentation",      color: "#10b981", createdAt: ago(120), updatedAt: ago(4) },
  { id: "cat-legal",   organizationId: null, name: "Legal & Compliance",description: "Contracts, certificates, and law",  color: "#ef4444", createdAt: ago(150), updatedAt: ago(7) },
  { id: "cat-ops",     organizationId: null, name: "Operations",       description: "Operational procedures and reports", color: "#8b5cf6", createdAt: ago(90),  updatedAt: ago(3) },
  { id: "cat-training",organizationId: null, name: "Training",         description: "Academy and training content",       color: "#f97316", createdAt: ago(60),  updatedAt: ago(1) },
  { id: "cat-finance", organizationId: null, name: "Finance",          description: "Quotations, invoices, contracts",    color: "#6366f1", createdAt: ago(80),  updatedAt: ago(10) },
];

// ── Templates ─────────────────────────────────────────────────────────────────

export const MOCK_TEMPLATES: EdmsTemplate[] = [
  { id: "tpl-eng-draw", organizationId: null, name: "Engineering Drawing Template",    description: "Standard ISO title block for engineering drawings",   documentType: "ENGINEERING_DRAWING", templateData: null, isActive: true, createdBy: "admin", createdAt: ago(90), updatedAt: ago(10) },
  { id: "tpl-pid",      organizationId: null, name: "P&ID Template",                  description: "ISA-5.1 compliant P&ID template",                     documentType: "PID",                 templateData: null, isActive: true, createdBy: "admin", createdAt: ago(90), updatedAt: ago(10) },
  { id: "tpl-vendor-ds",organizationId: null, name: "Vendor Datasheet Template",       description: "Standard format for vendor equipment datasheets",     documentType: "VENDOR_DATASHEET",    templateData: null, isActive: true, createdBy: "admin", createdAt: ago(60), updatedAt: ago(8) },
  { id: "tpl-procedure",organizationId: null, name: "Work Instruction Template",       description: "ISO 9001 compliant work instruction format",          documentType: "WORK_INSTRUCTION",    templateData: null, isActive: true, createdBy: "admin", createdAt: ago(45), updatedAt: ago(5) },
  { id: "tpl-report",   organizationId: null, name: "Inspection Report Template",      description: "Standard inspection report with sign-off sections",   documentType: "INSPECTION_REPORT",   templateData: null, isActive: true, createdBy: "admin", createdAt: ago(30), updatedAt: ago(3) },
];

// ── Retention Policies ────────────────────────────────────────────────────────

export const MOCK_RETENTION_POLICIES: EdmsRetentionPolicy[] = [
  { id: "ret-contract",  organizationId: null, name: "Contract Retention",    documentType: "CONTRACT",      retentionDays: 3650, autoArchive: true,  autoDelete: false, description: "Retain contracts for 10 years",   isActive: true, createdAt: ago(120), updatedAt: ago(30) },
  { id: "ret-eng-draw",  organizationId: null, name: "Engineering Drawings",  documentType: "ENGINEERING_DRAWING", retentionDays: 1825, autoArchive: true, autoDelete: false, description: "Retain drawings for 5 years", isActive: true, createdAt: ago(120), updatedAt: ago(30) },
  { id: "ret-cert",      organizationId: null, name: "Certificate Retention", documentType: "CERTIFICATE",   retentionDays: 730,  autoArchive: true,  autoDelete: false, description: "Retain certificates for 2 years", isActive: true, createdAt: ago(90),  updatedAt: ago(20) },
  { id: "ret-invoice",   organizationId: null, name: "Invoice Retention",     documentType: "INVOICE",       retentionDays: 2555, autoArchive: true,  autoDelete: false, description: "Retain invoices for 7 years",     isActive: true, createdAt: ago(80),  updatedAt: ago(15) },
];

// ── Documents ─────────────────────────────────────────────────────────────────

export const MOCK_DOCUMENTS: EdmsDocument[] = [
  {
    id: "doc-001", organizationId: null, folderId: "fld-eng-pid",       categoryId: "cat-eng",     templateId: "tpl-pid",
    title: "P&ID-001 Main Process Flow Diagram",      description: "Main process flow P&ID for Site A production line",
    documentType: "PID",                  status: "APPROVED",   currentRevision: "2.1.0",
    language: "en", keywords: ["process","pid","site-a"], ownerId: "admin",
    erpProjectId: "prj-02", workOrderId: null, crmAccountId: null, vendorId: null, siteId: "site-a", equipmentId: null,
    filePath: "/files/pid-001-v2.1.0.pdf", fileSize: 2457600, mimeType: "application/pdf", checksum: "sha256:abc001",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(90), updatedAt: ago(5),
  },
  {
    id: "doc-002", organizationId: null, folderId: "fld-eng-elec",      categoryId: "cat-eng",     templateId: "tpl-eng-draw",
    title: "EL-001 Main Distribution Board Schematic", description: "Single-line diagram for MDB-01",
    documentType: "ELECTRICAL_DRAWING",   status: "REVIEW",     currentRevision: "1.2.0",
    language: "en", keywords: ["electrical","mdb","schematic"], ownerId: "admin",
    erpProjectId: "prj-01", workOrderId: null, crmAccountId: null, vendorId: null, siteId: null, equipmentId: "mdb-01",
    filePath: "/files/el-001-v1.2.0.pdf", fileSize: 1843200, mimeType: "application/pdf", checksum: "sha256:abc002",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(60), updatedAt: ago(3),
  },
  {
    id: "doc-003", organizationId: null, folderId: "fld-eng-plc",       categoryId: "cat-eng",     templateId: null,
    title: "PLC-001 Conveyor System Logic Program",    description: "Ladder logic for conveyor automation PLC-01",
    documentType: "PLC_PROGRAM",          status: "DRAFT",      currentRevision: "0.3.0",
    language: "en", keywords: ["plc","conveyor","automation"], ownerId: "admin",
    erpProjectId: "prj-01", workOrderId: "wo-01", crmAccountId: null, vendorId: null, siteId: "site-a", equipmentId: "plc-01",
    filePath: "/files/plc-001-v0.3.0.l5x", fileSize: 512000, mimeType: "application/octet-stream", checksum: "sha256:abc003",
    isLocked: true, lockedBy: "eng-01", lockedAt: ago(1), deletedAt: null, createdBy: "admin", createdAt: ago(30), updatedAt: ago(1),
  },
  {
    id: "doc-004", organizationId: null, folderId: "fld-vendor-ds",     categoryId: "cat-vendor",  templateId: "tpl-vendor-ds",
    title: "Grundfos CR32 Centrifugal Pump Manual",    description: "Installation, operation and maintenance manual",
    documentType: "MANUAL",               status: "APPROVED",   currentRevision: "1.0.0",
    language: "en", keywords: ["pump","grundfos","maintenance"], ownerId: "admin",
    erpProjectId: null, workOrderId: null, crmAccountId: null, vendorId: "vendor-01", siteId: null, equipmentId: "pump-01",
    filePath: "/files/grundfos-cr32-manual.pdf", fileSize: 8388608, mimeType: "application/pdf", checksum: "sha256:abc004",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(120), updatedAt: ago(120),
  },
  {
    id: "doc-005", organizationId: null, folderId: "fld-vendor-cert",   categoryId: "cat-legal",   templateId: null,
    title: "CE Certificate — ABB ACS880 Variable Speed Drive", description: "CE Declaration of Conformity for VSD unit",
    documentType: "CERTIFICATE",          status: "APPROVED",   currentRevision: "1.0.0",
    language: "en", keywords: ["ce","certificate","vsd","abb"], ownerId: "admin",
    erpProjectId: null, workOrderId: null, crmAccountId: null, vendorId: "vendor-02", siteId: null, equipmentId: "vsd-01",
    filePath: "/files/abb-acs880-ce-cert.pdf", fileSize: 524288, mimeType: "application/pdf", checksum: "sha256:abc005",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(180), updatedAt: ago(180),
  },
  {
    id: "doc-006", organizationId: null, folderId: "fld-compliance",    categoryId: "cat-legal",   templateId: null,
    title: "SP-001 Site Safety Procedure",             description: "General site safety rules and emergency procedures",
    documentType: "PROCEDURE",            status: "APPROVED",   currentRevision: "3.0.0",
    language: "en", keywords: ["safety","procedure","emergency"], ownerId: "admin",
    erpProjectId: null, workOrderId: null, crmAccountId: null, vendorId: null, siteId: "site-a", equipmentId: null,
    filePath: "/files/sp-001-v3.0.0.pdf", fileSize: 1048576, mimeType: "application/pdf", checksum: "sha256:abc006",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(365), updatedAt: ago(45),
  },
  {
    id: "doc-007", organizationId: null, folderId: "fld-eng",           categoryId: "cat-ops",     templateId: "tpl-report",
    title: "CR-001 Commissioning Report — Pump Station A", description: "Full commissioning sign-off report for Pump Station A",
    documentType: "COMMISSIONING_REPORT", status: "APPROVED",   currentRevision: "1.0.0",
    language: "en", keywords: ["commissioning","pump-station","sign-off"], ownerId: "admin",
    erpProjectId: "prj-02", workOrderId: "wo-05", crmAccountId: null, vendorId: null, siteId: "site-a", equipmentId: null,
    filePath: "/files/cr-001-v1.0.0.pdf", fileSize: 3145728, mimeType: "application/pdf", checksum: "sha256:abc007",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(45), updatedAt: ago(30),
  },
  {
    id: "doc-008", organizationId: null, folderId: "fld-eng",           categoryId: "cat-ops",     templateId: null,
    title: "FAT-001 Factory Acceptance Test — Control Panel CP-01", description: "FAT report for main control panel",
    documentType: "FAT",                  status: "APPROVED",   currentRevision: "1.0.0",
    language: "en", keywords: ["fat","control-panel","acceptance"], ownerId: "admin",
    erpProjectId: "prj-01", workOrderId: null, crmAccountId: null, vendorId: "vendor-03", siteId: null, equipmentId: "cp-01",
    filePath: "/files/fat-001-v1.0.0.pdf", fileSize: 2097152, mimeType: "application/pdf", checksum: "sha256:abc008",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(60), updatedAt: ago(55),
  },
  {
    id: "doc-009", organizationId: null, folderId: "fld-eng",           categoryId: "cat-ops",     templateId: "tpl-procedure",
    title: "WI-001 Work Instruction — Monthly Pump Maintenance",    description: "Step-by-step maintenance instructions for CR series pumps",
    documentType: "WORK_INSTRUCTION",     status: "DRAFT",      currentRevision: "0.1.0",
    language: "en", keywords: ["maintenance","pump","monthly"], ownerId: "admin",
    erpProjectId: null, workOrderId: "wo-06", crmAccountId: null, vendorId: null, siteId: null, equipmentId: "pump-01",
    filePath: null, fileSize: null, mimeType: null, checksum: null,
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(7), updatedAt: ago(1),
  },
  {
    id: "doc-010", organizationId: null, folderId: "fld-compliance-contract", categoryId: "cat-legal", templateId: null,
    title: "Main EPC Contract Agreement — Phase 2 Industrial Expansion", description: "EPC contract for Site A Phase 2 expansion project",
    documentType: "CONTRACT",             status: "APPROVED",   currentRevision: "2.0.0",
    language: "en", keywords: ["contract","epc","legal","expansion"], ownerId: "admin",
    erpProjectId: "prj-02", workOrderId: null, crmAccountId: "acc-02", vendorId: null, siteId: null, equipmentId: null,
    filePath: "/files/epc-contract-v2.0.0.pdf", fileSize: 5242880, mimeType: "application/pdf", checksum: "sha256:abc010",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(200), updatedAt: ago(90),
  },
  {
    id: "doc-011", organizationId: null, folderId: "fld-vendor-ds",     categoryId: "cat-finance",  templateId: null,
    title: "Quotation Q-2026-001 — IoT Gateway Hardware",              description: "Vendor quotation for 10x IoT gateway devices",
    documentType: "QUOTATION",            status: "ARCHIVED",   currentRevision: "1.0.0",
    language: "en", keywords: ["quotation","iot","gateway","vendor"], ownerId: "admin",
    erpProjectId: "prj-02", workOrderId: null, crmAccountId: null, vendorId: "vendor-04", siteId: null, equipmentId: null,
    filePath: "/files/q-2026-001.pdf", fileSize: 262144, mimeType: "application/pdf", checksum: "sha256:abc011",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(90), updatedAt: ago(60),
  },
  {
    id: "doc-012", organizationId: null, folderId: "fld-academy",       categoryId: "cat-training", templateId: null,
    title: "Academy Module 1 — ERP & Operations Platform Guide",       description: "Comprehensive guide to the Hermes ERP module for operators",
    documentType: "MANUAL",               status: "APPROVED",   currentRevision: "1.1.0",
    language: "en", keywords: ["academy","erp","training","guide"], ownerId: "admin",
    erpProjectId: null, workOrderId: null, crmAccountId: null, vendorId: null, siteId: null, equipmentId: null,
    filePath: "/files/academy-module-01-v1.1.0.pdf", fileSize: 4194304, mimeType: "application/pdf", checksum: "sha256:abc012",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(30), updatedAt: ago(5),
  },
  {
    id: "doc-013", organizationId: null, folderId: "fld-eng",           categoryId: "cat-ops",     templateId: "tpl-report",
    title: "IR-001 Inspection Report — Boiler Station Annual",          description: "Annual inspection of boiler station BS-01",
    documentType: "INSPECTION_REPORT",    status: "REVIEW",     currentRevision: "1.0.0",
    language: "en", keywords: ["inspection","boiler","annual"], ownerId: "admin",
    erpProjectId: null, workOrderId: "wo-04", crmAccountId: null, vendorId: null, siteId: "site-a", equipmentId: "boiler-01",
    filePath: "/files/ir-001-v1.0.0.pdf", fileSize: 1572864, mimeType: "application/pdf", checksum: "sha256:abc013",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(14), updatedAt: ago(2),
  },
  {
    id: "doc-014", organizationId: null, folderId: "fld-eng",           categoryId: "cat-eng",     templateId: null,
    title: "SCADA-001 Project Backup — Site A Control System v3",      description: "Full SCADA project backup with tags and screens",
    documentType: "SCADA_PROJECT",        status: "APPROVED",   currentRevision: "3.0.0",
    language: "en", keywords: ["scada","backup","control-system","site-a"], ownerId: "admin",
    erpProjectId: "prj-02", workOrderId: null, crmAccountId: null, vendorId: null, siteId: "site-a", equipmentId: null,
    filePath: "/files/scada-001-v3.0.0.zip", fileSize: 15728640, mimeType: "application/zip", checksum: "sha256:abc014",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(120), updatedAt: ago(20),
  },
  {
    id: "doc-015", organizationId: null, folderId: "fld-eng",           categoryId: "cat-ops",     templateId: null,
    title: "SAT-001 Site Acceptance Test — Pump Station A",             description: "SAT documentation for Pump Station A commissioning",
    documentType: "SAT",                  status: "APPROVED",   currentRevision: "1.0.0",
    language: "en", keywords: ["sat","acceptance","pump-station"], ownerId: "admin",
    erpProjectId: "prj-02", workOrderId: null, crmAccountId: null, vendorId: null, siteId: "site-a", equipmentId: null,
    filePath: "/files/sat-001-v1.0.0.pdf", fileSize: 2621440, mimeType: "application/pdf", checksum: "sha256:abc015",
    isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null, createdBy: "admin", createdAt: ago(35), updatedAt: ago(28),
  },
];

// ── Revisions ─────────────────────────────────────────────────────────────────

export const MOCK_REVISIONS: EdmsRevision[] = [
  { id: "rev-001-1", documentId: "doc-001", revisionNumber: "1.0.0", revisionType: "MAJOR", summary: "Initial issue",                      filePath: "/files/pid-001-v1.0.0.pdf",  fileSize: 2097152, mimeType: "application/pdf", checksum: "sha256:r001a", createdBy: "admin", createdAt: ago(90) },
  { id: "rev-001-2", documentId: "doc-001", revisionNumber: "2.0.0", revisionType: "MAJOR", summary: "Site A layout revised",              filePath: "/files/pid-001-v2.0.0.pdf",  fileSize: 2359296, mimeType: "application/pdf", checksum: "sha256:r001b", createdBy: "admin", createdAt: ago(30) },
  { id: "rev-001-3", documentId: "doc-001", revisionNumber: "2.1.0", revisionType: "MINOR", summary: "Instrument tags corrected",           filePath: "/files/pid-001-v2.1.0.pdf",  fileSize: 2457600, mimeType: "application/pdf", checksum: "sha256:r001c", createdBy: "admin", createdAt: ago(5) },
  { id: "rev-002-1", documentId: "doc-002", revisionNumber: "1.0.0", revisionType: "MAJOR", summary: "Initial issue",                      filePath: "/files/el-001-v1.0.0.pdf",   fileSize: 1572864, mimeType: "application/pdf", checksum: "sha256:r002a", createdBy: "admin", createdAt: ago(60) },
  { id: "rev-002-2", documentId: "doc-002", revisionNumber: "1.1.0", revisionType: "MINOR", summary: "Cable schedule updated",              filePath: "/files/el-001-v1.1.0.pdf",   fileSize: 1703936, mimeType: "application/pdf", checksum: "sha256:r002b", createdBy: "admin", createdAt: ago(20) },
  { id: "rev-002-3", documentId: "doc-002", revisionNumber: "1.2.0", revisionType: "MINOR", summary: "Issued for review (IFR)",             filePath: "/files/el-001-v1.2.0.pdf",   fileSize: 1843200, mimeType: "application/pdf", checksum: "sha256:r002c", createdBy: "admin", createdAt: ago(3) },
  { id: "rev-003-1", documentId: "doc-003", revisionNumber: "0.1.0", revisionType: "MINOR", summary: "Draft logic, conveyor sections 1-3", filePath: "/files/plc-001-v0.1.0.l5x",  fileSize: 204800,  mimeType: "application/octet-stream", checksum: "sha256:r003a", createdBy: "admin", createdAt: ago(30) },
  { id: "rev-003-2", documentId: "doc-003", revisionNumber: "0.2.0", revisionType: "MINOR", summary: "Safety interlock logic added",        filePath: "/files/plc-001-v0.2.0.l5x",  fileSize: 409600,  mimeType: "application/octet-stream", checksum: "sha256:r003b", createdBy: "admin", createdAt: ago(10) },
  { id: "rev-003-3", documentId: "doc-003", revisionNumber: "0.3.0", revisionType: "PATCH", summary: "Minor bug fix in conveyor speed ramp",filePath: "/files/plc-001-v0.3.0.l5x",  fileSize: 512000,  mimeType: "application/octet-stream", checksum: "sha256:r003c", createdBy: "admin", createdAt: ago(1) },
  { id: "rev-006-1", documentId: "doc-006", revisionNumber: "1.0.0", revisionType: "MAJOR", summary: "Initial safety procedure",            filePath: "/files/sp-001-v1.0.0.pdf",   fileSize: 524288,  mimeType: "application/pdf", checksum: "sha256:r006a", createdBy: "admin", createdAt: ago(365) },
  { id: "rev-006-2", documentId: "doc-006", revisionNumber: "2.0.0", revisionType: "MAJOR", summary: "Updated for new emergency protocol",  filePath: "/files/sp-001-v2.0.0.pdf",   fileSize: 786432,  mimeType: "application/pdf", checksum: "sha256:r006b", createdBy: "admin", createdAt: ago(180) },
  { id: "rev-006-3", documentId: "doc-006", revisionNumber: "3.0.0", revisionType: "MAJOR", summary: "ISO 45001 compliance update",         filePath: "/files/sp-001-v3.0.0.pdf",   fileSize: 1048576, mimeType: "application/pdf", checksum: "sha256:r006c", createdBy: "admin", createdAt: ago(45) },
];

// ── Approvals ─────────────────────────────────────────────────────────────────

export const MOCK_APPROVALS: EdmsApproval[] = [
  { id: "apr-doc-002-1", documentId: "doc-002", revisionId: "rev-002-3", stage: 1, approverRole: "engineer", assignedTo: "eng-01", status: "APPROVED", comment: "Schematic is technically sound", decidedAt: ago(2), decidedBy: "eng-01", dueDate: ago(1), createdAt: ago(3), updatedAt: ago(2) },
  { id: "apr-doc-002-2", documentId: "doc-002", revisionId: "rev-002-3", stage: 2, approverRole: "admin",    assignedTo: "admin",  status: "PENDING",  comment: null, decidedAt: null, decidedBy: null, dueDate: from(3), createdAt: ago(3), updatedAt: ago(3) },
  { id: "apr-doc-013-1", documentId: "doc-013", revisionId: null, stage: 1, approverRole: "engineer", assignedTo: "eng-03", status: "PENDING", comment: null, decidedAt: null, decidedBy: null, dueDate: from(5), createdAt: ago(2), updatedAt: ago(2) },
  { id: "apr-doc-001-1", documentId: "doc-001", revisionId: "rev-001-3", stage: 1, approverRole: "engineer", assignedTo: "eng-04", status: "APPROVED", comment: "P&ID verified against site survey", decidedAt: ago(4), decidedBy: "eng-04", dueDate: ago(5), createdAt: ago(6), updatedAt: ago(4) },
  { id: "apr-doc-001-2", documentId: "doc-001", revisionId: "rev-001-3", stage: 2, approverRole: "admin",    assignedTo: "admin",  status: "APPROVED", comment: "Approved for construction",         decidedAt: ago(3), decidedBy: "admin",  dueDate: ago(3), createdAt: ago(6), updatedAt: ago(3) },
];

// ── Comments ──────────────────────────────────────────────────────────────────

export const MOCK_COMMENTS: EdmsComment[] = [
  { id: "cmt-001", documentId: "doc-002", revisionId: "rev-002-3", parentId: null, userId: "eng-01", content: "Please verify the cable tag on L2 matches the cable schedule in rev 1.1.", isResolved: false, resolvedBy: null, resolvedAt: null, createdAt: ago(2), updatedAt: ago(2) },
  { id: "cmt-002", documentId: "doc-002", revisionId: "rev-002-3", parentId: "cmt-001", userId: "admin", content: "Confirmed — tag updated in this revision.", isResolved: false, resolvedBy: null, resolvedAt: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "cmt-003", documentId: "doc-003", revisionId: "rev-003-3", parentId: null, userId: "eng-03", content: "Safety interlock timer value needs sign-off from EH&S team before approval.", isResolved: false, resolvedBy: null, resolvedAt: null, createdAt: ago(1), updatedAt: ago(1) },
  { id: "cmt-004", documentId: "doc-013", revisionId: null, parentId: null, userId: "admin", content: "Boiler pressure readings on p.3 are outside normal range — needs engineer review.", isResolved: false, resolvedBy: null, resolvedAt: null, createdAt: ago(2), updatedAt: ago(2) },
  { id: "cmt-005", documentId: "doc-001", revisionId: "rev-001-2", parentId: null, userId: "eng-04", content: "Instrument tag IN-042 is missing from layout diagram.", isResolved: true, resolvedBy: "admin", resolvedAt: ago(4), createdAt: ago(8), updatedAt: ago(4) },
];

// ── Tags ──────────────────────────────────────────────────────────────────────

export const MOCK_TAGS: EdmsTag[] = [
  { id: "tag-001", documentId: "doc-001", tagName: "process",       createdBy: "admin", createdAt: ago(90) },
  { id: "tag-002", documentId: "doc-001", tagName: "site-a",        createdBy: "admin", createdAt: ago(90) },
  { id: "tag-003", documentId: "doc-002", tagName: "electrical",    createdBy: "admin", createdAt: ago(60) },
  { id: "tag-004", documentId: "doc-003", tagName: "automation",    createdBy: "admin", createdAt: ago(30) },
  { id: "tag-005", documentId: "doc-004", tagName: "maintenance",   createdBy: "admin", createdAt: ago(120) },
  { id: "tag-006", documentId: "doc-006", tagName: "safety",        createdBy: "admin", createdAt: ago(365) },
  { id: "tag-007", documentId: "doc-010", tagName: "legal",         createdBy: "admin", createdAt: ago(200) },
  { id: "tag-008", documentId: "doc-012", tagName: "training",      createdBy: "admin", createdAt: ago(30) },
];

// ── Audit ─────────────────────────────────────────────────────────────────────

export const MOCK_AUDIT: EdmsAudit[] = [
  { id: "aud-001", documentId: "doc-001", userId: "admin",  action: "VIEW",     details: "Document viewed",                ipAddress: "192.168.1.10", userAgent: "Mozilla/5.0", createdAt: ago(1) },
  { id: "aud-002", documentId: "doc-001", userId: "eng-04", action: "APPROVE",  details: "Stage 1 approved",               ipAddress: "192.168.1.12", userAgent: "Mozilla/5.0", createdAt: ago(4) },
  { id: "aud-003", documentId: "doc-001", userId: "admin",  action: "APPROVE",  details: "Stage 2 approved — IFC",         ipAddress: "192.168.1.10", userAgent: "Mozilla/5.0", createdAt: ago(3) },
  { id: "aud-004", documentId: "doc-002", userId: "admin",  action: "UPLOAD",   details: "Revision 1.2.0 uploaded",        ipAddress: "192.168.1.10", userAgent: "Mozilla/5.0", createdAt: ago(3) },
  { id: "aud-005", documentId: "doc-003", userId: "eng-01", action: "CHECKOUT", details: "Document checked out for edit",  ipAddress: "192.168.1.11", userAgent: "Mozilla/5.0", createdAt: ago(1) },
  { id: "aud-006", documentId: "doc-006", userId: "admin",  action: "UPLOAD",   details: "Revision 3.0.0 — ISO 45001",    ipAddress: "192.168.1.10", userAgent: "Mozilla/5.0", createdAt: ago(45) },
  { id: "aud-007", documentId: "doc-010", userId: "admin",  action: "VIEW",     details: "Contract accessed",              ipAddress: "192.168.1.10", userAgent: "Mozilla/5.0", createdAt: ago(2) },
  { id: "aud-008", documentId: "doc-013", userId: "admin",  action: "UPLOAD",   details: "Inspection report submitted",    ipAddress: "192.168.1.10", userAgent: "Mozilla/5.0", createdAt: ago(14) },
  { id: "aud-009", documentId: "doc-012", userId: "eng-05", action: "DOWNLOAD", details: "PDF downloaded",                 ipAddress: "192.168.1.15", userAgent: "Mozilla/5.0", createdAt: ago(3) },
  { id: "aud-010", documentId: "doc-014", userId: "eng-04", action: "VIEW",     details: "SCADA project backup accessed",  ipAddress: "192.168.1.12", userAgent: "Mozilla/5.0", createdAt: ago(2) },
];

// ── Attachments ───────────────────────────────────────────────────────────────

export const MOCK_ATTACHMENTS: EdmsAttachment[] = [
  { id: "att-001", documentId: "doc-001", fileName: "P&ID-001-redlines.pdf",   fileSize: 524288,  mimeType: "application/pdf", filePath: "/files/att/pid-001-redlines.pdf",    uploadedBy: "eng-04", createdAt: ago(6) },
  { id: "att-002", documentId: "doc-002", fileName: "EL-001-cable-sched.xlsx", fileSize: 131072,  mimeType: "application/vnd.ms-excel", filePath: "/files/att/el-001-cable-sched.xlsx", uploadedBy: "admin", createdAt: ago(3) },
  { id: "att-003", documentId: "doc-007", fileName: "photos-commissioning.zip",fileSize: 20971520,mimeType: "application/zip",          filePath: "/files/att/photos-commissioning.zip",  uploadedBy: "admin", createdAt: ago(30) },
];

// ── Metadata ──────────────────────────────────────────────────────────────────

export const MOCK_METADATA: EdmsMetadata[] = [
  { id: "meta-001", documentId: "doc-001", key: "project",     value: "Phase 2 Industrial Expansion", createdAt: ago(90), updatedAt: ago(90) },
  { id: "meta-002", documentId: "doc-001", key: "vendor",      value: "Hermes Engineering Ltd",       createdAt: ago(90), updatedAt: ago(90) },
  { id: "meta-003", documentId: "doc-001", key: "discipline",  value: "Process",                      createdAt: ago(90), updatedAt: ago(90) },
  { id: "meta-004", documentId: "doc-002", key: "discipline",  value: "Electrical",                   createdAt: ago(60), updatedAt: ago(60) },
  { id: "meta-005", documentId: "doc-002", key: "voltage",     value: "400V 3-phase",                 createdAt: ago(60), updatedAt: ago(60) },
  { id: "meta-006", documentId: "doc-004", key: "model",       value: "Grundfos CR32-5",              createdAt: ago(120),updatedAt: ago(120) },
  { id: "meta-007", documentId: "doc-004", key: "power",       value: "7.5 kW",                       createdAt: ago(120),updatedAt: ago(120) },
  { id: "meta-008", documentId: "doc-010", key: "contract_value", value: "USD 2,800,000",             createdAt: ago(200),updatedAt: ago(200) },
  { id: "meta-009", documentId: "doc-010", key: "contract_duration", value: "18 months",              createdAt: ago(200),updatedAt: ago(200) },
  { id: "meta-010", documentId: "doc-014", key: "plc_vendor",  value: "Siemens",                      createdAt: ago(120),updatedAt: ago(120) },
];

// ── Favorites ─────────────────────────────────────────────────────────────────

export const MOCK_FAVORITES: EdmsFavorite[] = [
  { id: "fav-001", documentId: "doc-001", userId: "admin",  createdAt: ago(10) },
  { id: "fav-002", documentId: "doc-006", userId: "admin",  createdAt: ago(20) },
  { id: "fav-003", documentId: "doc-004", userId: "eng-04", createdAt: ago(30) },
  { id: "fav-004", documentId: "doc-012", userId: "eng-05", createdAt: ago(5) },
];

// ── Checkouts ─────────────────────────────────────────────────────────────────

export const MOCK_CHECKOUTS: EdmsCheckout[] = [
  { id: "co-001", documentId: "doc-003", userId: "eng-01", checkedOutAt: ago(1), dueAt: from(2), checkedInAt: null, message: "Adding safety interlock for conveyor section 4" },
];

// ── Shares ────────────────────────────────────────────────────────────────────

export const MOCK_SHARES: EdmsShare[] = [
  { id: "sh-001", documentId: "doc-004", sharedWith: "vendor-01@example.com", sharedBy: "admin", expiresAt: from(30), accessLevel: "reader", token: "share-tok-001", createdAt: ago(5) },
  { id: "sh-002", documentId: "doc-010", sharedWith: "legal@partner.com",     sharedBy: "admin", expiresAt: from(90), accessLevel: "reader", token: "share-tok-002", createdAt: ago(7) },
];

// ── Derived helpers ───────────────────────────────────────────────────────────

export const PENDING_APPROVALS  = MOCK_APPROVALS.filter(a => a.status === "PENDING");
export const ACTIVE_CHECKOUTS   = MOCK_CHECKOUTS.filter(c => !c.checkedInAt);
export const LOCKED_DOCUMENTS   = MOCK_DOCUMENTS.filter(d => d.isLocked && !d.deletedAt);

export function getMockDocumentFull(id: string) {
  const doc = MOCK_DOCUMENTS.find(d => d.id === id);
  if (!doc) return null;
  return {
    ...doc,
    revisions:   MOCK_REVISIONS.filter(r => r.documentId === id),
    approvals:   MOCK_APPROVALS.filter(a => a.documentId === id),
    comments:    MOCK_COMMENTS.filter(c => c.documentId === id),
    tags:        MOCK_TAGS.filter(t => t.documentId === id),
    links:       [] as { id: string; documentId: string; linkedDocumentId: string; linkType: string; createdBy: string | null; createdAt: string }[],
    attachments: MOCK_ATTACHMENTS.filter(a => a.documentId === id),
    metadata:    MOCK_METADATA.filter(m => m.documentId === id),
    audit:       MOCK_AUDIT.filter(a => a.documentId === id),
  };
}

export function getMockFolderFull(id: string) {
  const folder = MOCK_FOLDERS.find(f => f.id === id);
  if (!folder) return null;
  return {
    ...folder,
    children:  MOCK_FOLDERS.filter(f => f.parentId === id),
    documents: MOCK_DOCUMENTS.filter(d => d.folderId === id && !d.deletedAt),
  };
}
