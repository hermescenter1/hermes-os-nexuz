/**
 * Organization management types (Phase 32).
 * Source of truth for all org-level TypeScript interfaces.
 */

export type OrgRole       = "OWNER" | "ADMIN" | "MANAGER" | "ENGINEER" | "VIEWER" | "BILLING_ADMIN" | "MEMBER";
export type MemberStatus  = "ACTIVE" | "INVITED" | "SUSPENDED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export const ALL_ORG_ROLES: OrgRole[] = ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"];

export const DEPT_TYPES = ["automation", "electrical", "maintenance", "production", "management", "it_ot"] as const;
export type DeptType = typeof DEPT_TYPES[number];

// ── Records returned by service functions ────────────────────────────────────

export interface OrgRecord {
  id:          string;
  name:        string;
  slug:        string;
  description: string | null;
  website:     string | null;
  logoUrl:     string | null;
  settings:    Record<string, unknown>;
  createdAt:   string;
  updatedAt:   string;
}

export interface MemberRecord {
  id:             string;
  organizationId: string;
  userId:         string;
  role:           OrgRole;
  status:         MemberStatus;
  departmentId:   string | null;
  invitedById:    string | null;
  joinedAt:       string | null;
  createdAt:      string;
  updatedAt:      string;
  user?: {
    id:    string;
    name:  string;
    email: string;
  };
}

export interface InvitationRecord {
  id:             string;
  organizationId: string;
  email:          string;
  role:           OrgRole;
  status:         InvitationStatus;
  invitedById:    string | null;
  expiresAt:      string;
  createdAt:      string;
  updatedAt:      string;
  // token is NEVER returned except during creation
}

export interface InvitationCreatedRecord extends InvitationRecord {
  token: string;
}

export interface DeptRecord {
  id:             string;
  organizationId: string;
  name:           string;
  description:    string | null;
  type:           string;
  managerId:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

/** Resolved context for an authenticated user acting within an org. */
export interface OrgActorContext {
  userId:   string;
  orgId:    string;
  memberId: string;
  role:     OrgRole;
  status:   MemberStatus;
}
