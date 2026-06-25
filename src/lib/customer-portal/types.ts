// Phase 65 — Customer Portal types

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TicketStatus   = "OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
export type ProjectStatus  = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
export type DocCategory    = "CONTRACT" | "PROPOSAL" | "REPORT" | "INVOICE" | "TECHNICAL" | "COMPLIANCE" | "OTHER";

export interface CustomerAccount {
  id:             string;
  organizationId: string;
  accountNumber:  string;
  displayName:    string;
  industry:       string | null;
  region:         string | null;
  tier:           string;
  csManagerId:    string | null;
  status:         string;
  healthScore:    number | null;
  contractStart:  string | null;
  contractEnd:    string | null;
  onboardedAt:    string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface CustomerContact {
  id:          string;
  accountId:   string;
  userId:      string | null;
  fullName:    string;
  email:       string;
  phone:       string | null;
  title:       string | null;
  isPrimary:   boolean;
  isBilling:   boolean;
  isTechnical: boolean;
}

export interface Milestone {
  id:          string;
  title:       string;
  dueDate:     string | null;
  completed:   boolean;
  description: string | null;
}

export interface CustomerProject {
  id:            string;
  accountId:     string;
  title:         string;
  descriptionEn: string | null;
  descriptionFa: string | null;
  status:        ProjectStatus;
  priority:      string;
  managerName:   string | null;
  teamMembers:   string[];
  tags:          string[];
  startDate:     string | null;
  endDate:       string | null;
  progress:      number;
  milestones:    Milestone[];
  createdAt:     string;
  updatedAt:     string;
  _count?: { tickets: number; documents: number };
}

export interface CustomerSupportTicket {
  id:              string;
  accountId:       string;
  projectId:       string | null;
  title:           string;
  descriptionEn:   string;
  priority:        TicketPriority;
  status:          TicketStatus;
  category:        string;
  slaDeadline:     string | null;
  resolvedAt:      string | null;
  createdAt:       string;
  updatedAt:       string;
  _count?: { messages: number };
}

export interface CustomerSupportMessage {
  id:             string;
  ticketId:       string;
  authorId:       string | null;
  authorName:     string;
  authorRole:     string;
  body:           string;
  isInternal:     boolean;
  attachmentUrls: string[];
  createdAt:      string;
}

export interface CustomerDocument {
  id:            string;
  accountId:     string;
  projectId:     string | null;
  title:         string;
  category:      DocCategory;
  fileUrl:       string | null;
  fileSizeBytes: number | null;
  mimeType:      string | null;
  version:       string;
  isPublic:      boolean;
  uploadedBy:    string | null;
  expiresAt:     string | null;
  createdAt:     string;
}

export interface CustomerActivityLog {
  id:          string;
  accountId:   string;
  userId:      string | null;
  eventType:   string;
  description: string;
  metadata:    Record<string, unknown>;
  createdAt:   string;
}

export interface CustomerSubscriptionView {
  id:                 string;
  accountId:          string;
  planName:           string;
  planTier:           string;
  billingCycle:       string;
  status:             string;
  currentPeriodStart: string | null;
  currentPeriodEnd:   string | null;
  usersCount:         number;
  usersLimit:         number;
  storageUsedGb:      number;
  storageLimitGb:     number;
  apiCallsMonth:      number;
  apiCallsLimit:      number;
  features:           string[];
}

export interface CustomerPortalPreference {
  id:                 string;
  accountId:          string;
  userId:             string | null;
  language:           string;
  timezone:           string;
  emailNotifications: boolean;
  ticketUpdates:      boolean;
  projectUpdates:     boolean;
  documentAlerts:     boolean;
  marketingEmails:    boolean;
}

export interface CustomerOverview {
  account:      CustomerAccount | null;
  openTickets:  number;
  activeProjects: number;
  totalDocuments: number;
  recentActivity: CustomerActivityLog[];
  subscription:   CustomerSubscriptionView | null;
}

export interface AdminCustomerListItem {
  id:            string;
  accountNumber: string;
  displayName:   string;
  industry:      string | null;
  tier:          string;
  status:        string;
  healthScore:   number | null;
  openTickets:   number;
  activeProjects: number;
  csManagerId:   string | null;
  createdAt:     string;
}
