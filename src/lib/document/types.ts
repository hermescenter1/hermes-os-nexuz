// Phase 69 — EDMS types (Edms-prefixed to match Prisma models)

export type EdmsDocumentStatus  = "DRAFT" | "REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED" | "OBSOLETE";
export type EdmsDocumentType    =
  | "ENGINEERING_DRAWING" | "PID" | "ELECTRICAL_DRAWING" | "PLC_PROGRAM" | "SCADA_PROJECT"
  | "COMMISSIONING_REPORT" | "INSPECTION_REPORT" | "FAT" | "SAT"
  | "MANUAL" | "PROCEDURE" | "WORK_INSTRUCTION" | "CERTIFICATE"
  | "VENDOR_DATASHEET" | "CONTRACT" | "QUOTATION" | "INVOICE" | "OTHER";
export type EdmsApprovalStatus  = "PENDING" | "APPROVED" | "REJECTED";
export type EdmsRevisionType    = "MAJOR" | "MINOR" | "PATCH";

// ── Core model interfaces ─────────────────────────────────────────────────────

export interface EdmsFolder {
  id:             string;
  organizationId: string | null;
  parentId:       string | null;
  name:           string;
  description:    string | null;
  path:           string;
  color:          string | null;
  icon:           string | null;
  createdBy:      string | null;
  deletedAt:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface EdmsCategory {
  id:             string;
  organizationId: string | null;
  name:           string;
  description:    string | null;
  color:          string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface EdmsTemplate {
  id:             string;
  organizationId: string | null;
  name:           string;
  description:    string | null;
  documentType:   EdmsDocumentType;
  templateData:   string | null;
  isActive:       boolean;
  createdBy:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface EdmsRetentionPolicy {
  id:             string;
  organizationId: string | null;
  name:           string;
  documentType:   EdmsDocumentType | null;
  retentionDays:  number;
  autoArchive:    boolean;
  autoDelete:     boolean;
  description:    string | null;
  isActive:       boolean;
  createdAt:      string;
  updatedAt:      string;
}

export interface EdmsDocument {
  id:              string;
  organizationId:  string | null;
  folderId:        string | null;
  categoryId:      string | null;
  templateId:      string | null;
  title:           string;
  description:     string | null;
  documentType:    EdmsDocumentType;
  status:          EdmsDocumentStatus;
  currentRevision: string | null;
  language:        string;
  keywords:        string[];
  ownerId:         string | null;
  erpProjectId:    string | null;
  workOrderId:     string | null;
  crmAccountId:    string | null;
  vendorId:        string | null;
  siteId:          string | null;
  equipmentId:     string | null;
  filePath:        string | null;
  fileSize:        number | null;
  mimeType:        string | null;
  checksum:        string | null;
  isLocked:        boolean;
  lockedBy:        string | null;
  lockedAt:        string | null;
  deletedAt:       string | null;
  createdBy:       string | null;
  createdAt:       string;
  updatedAt:       string;
}

export interface EdmsRevision {
  id:             string;
  documentId:     string;
  revisionNumber: string;
  revisionType:   EdmsRevisionType;
  summary:        string | null;
  filePath:       string | null;
  fileSize:       number | null;
  mimeType:       string | null;
  checksum:       string | null;
  createdBy:      string | null;
  createdAt:      string;
}

export interface EdmsApproval {
  id:           string;
  documentId:   string;
  revisionId:   string | null;
  stage:        number;
  approverRole: string;
  assignedTo:   string | null;
  status:       EdmsApprovalStatus;
  comment:      string | null;
  decidedAt:    string | null;
  decidedBy:    string | null;
  dueDate:      string | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface EdmsComment {
  id:         string;
  documentId: string;
  revisionId: string | null;
  parentId:   string | null;
  userId:     string | null;
  content:    string;
  isResolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt:  string;
  updatedAt:  string;
}

export interface EdmsTag {
  id:         string;
  documentId: string;
  tagName:    string;
  createdBy:  string | null;
  createdAt:  string;
}

export interface EdmsLink {
  id:               string;
  documentId:       string;
  linkedDocumentId: string;
  linkType:         string;
  createdBy:        string | null;
  createdAt:        string;
}

export interface EdmsPermission {
  id:         string;
  documentId: string | null;
  folderId:   string | null;
  userId:     string;
  role:       string;
  grantedBy:  string | null;
  createdAt:  string;
  updatedAt:  string;
}

export interface EdmsCheckout {
  id:           string;
  documentId:   string;
  userId:       string;
  checkedOutAt: string;
  dueAt:        string | null;
  checkedInAt:  string | null;
  message:      string | null;
}

export interface EdmsFavorite {
  id:         string;
  documentId: string;
  userId:     string;
  createdAt:  string;
}

export interface EdmsShare {
  id:          string;
  documentId:  string;
  sharedWith:  string;
  sharedBy:    string | null;
  expiresAt:   string | null;
  accessLevel: string;
  token:       string | null;
  createdAt:   string;
}

export interface EdmsSignature {
  id:          string;
  documentId:  string;
  revisionId:  string | null;
  userId:      string;
  signedAt:    string;
  role:        string | null;
  certificate: string | null;
  ipAddress:   string | null;
}

export interface EdmsAudit {
  id:         string;
  documentId: string;
  userId:     string | null;
  action:     string;
  details:    string | null;
  ipAddress:  string | null;
  userAgent:  string | null;
  createdAt:  string;
}

export interface EdmsWorkflow {
  id:                   string;
  documentId:           string;
  workflowDefinitionId: string | null;
  status:               string;
  startedAt:            string | null;
  completedAt:          string | null;
  triggeredBy:          string | null;
  createdAt:            string;
}

export interface EdmsAttachment {
  id:         string;
  documentId: string;
  fileName:   string;
  fileSize:   number | null;
  mimeType:   string | null;
  filePath:   string | null;
  uploadedBy: string | null;
  createdAt:  string;
}

export interface EdmsMetadata {
  id:         string;
  documentId: string;
  key:        string;
  value:      string;
  createdAt:  string;
  updatedAt:  string;
}

// ── Composite / overview types ────────────────────────────────────────────────

export interface EdmsDocumentFull extends EdmsDocument {
  revisions:   EdmsRevision[];
  approvals:   EdmsApproval[];
  comments:    EdmsComment[];
  tags:        EdmsTag[];
  links:       EdmsLink[];
  attachments: EdmsAttachment[];
  metadata:    EdmsMetadata[];
  audit:       EdmsAudit[];
}

export interface EdmsFolderFull extends EdmsFolder {
  children:  EdmsFolder[];
  documents: EdmsDocument[];
}

export interface EdmsDashboard {
  totalDocuments:   number;
  draftCount:       number;
  reviewCount:      number;
  approvedCount:    number;
  rejectedCount:    number;
  archivedCount:    number;
  pendingApprovals: number;
  activeCheckouts:  number;
  recentDocuments:  EdmsDocument[];
  recentAudit:      EdmsAudit[];
  documentsByType:  Record<string, number>;
  documentsByStatus: Record<string, number>;
}

export interface EdmsSearchResult {
  documents: EdmsDocument[];
  total:     number;
  page:      number;
  pageSize:  number;
}
