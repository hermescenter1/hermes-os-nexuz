// Phase 65 — Customer Portal DB layer

import { getPrisma } from "@/lib/db/prisma";
import type {
  CustomerAccount,
  CustomerContact,
  CustomerProject,
  CustomerSupportTicket,
  CustomerSupportMessage,
  CustomerDocument,
  CustomerActivityLog,
  CustomerSubscriptionView,
  CustomerPortalPreference,
  CustomerOverview,
  AdminCustomerListItem,
  Milestone,
} from "./types";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;

async function m() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    account:      d.customerAccount       as AnyModel,
    contact:      d.customerContact       as AnyModel,
    project:      d.customerProject       as AnyModel,
    ticket:       d.customerSupportTicket as AnyModel,
    message:      d.customerSupportMessage as AnyModel,
    document:     d.customerDocument      as AnyModel,
    activity:     d.customerActivityLog   as AnyModel,
    subscription: d.customerSubscriptionView as AnyModel,
    preference:   d.customerPortalPreference as AnyModel,
    orgMember:    d.organizationMember    as AnyModel,
  };
}

// ── Account lookup helpers ────────────────────────────────────────────────────

export async function getAccountByOrgId(organizationId: string): Promise<CustomerAccount | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.account.findUnique({ where: { organizationId } } as unknown)) as CustomerAccount | null;
  } catch { return null; }
}

export async function getAccountForUser(userId: string): Promise<CustomerAccount | null> {
  const db = await m();
  if (!db) return null;
  try {
    const member = (await db.orgMember.findFirst({
      where:  { userId, status: "ACTIVE" },
      select: { organizationId: true },
    } as unknown)) as { organizationId: string } | null;
    if (!member) return null;
    return (await db.account.findUnique({ where: { organizationId: member.organizationId } } as unknown)) as CustomerAccount | null;
  } catch { return null; }
}

// ── Customer overview ─────────────────────────────────────────────────────────

export async function getCustomerOverview(accountId: string): Promise<CustomerOverview | null> {
  const db = await m();
  if (!db) return null;
  try {
    const [account, openTickets, activeProjects, totalDocuments, recentActivity, subscription] =
      await Promise.all([
        db.account.findUnique({ where: { id: accountId } } as unknown),
        db.ticket.count({ where: { accountId, status: { in: ["OPEN", "IN_PROGRESS"] }, deletedAt: null } } as unknown),
        db.project.count({ where: { accountId, status: "ACTIVE", deletedAt: null } } as unknown),
        db.document.count({ where: { accountId, deletedAt: null } } as unknown),
        db.activity.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 10 } as unknown),
        db.subscription.findUnique({ where: { accountId } } as unknown),
      ]);
    return {
      account:        account        as CustomerAccount | null,
      openTickets:    openTickets    as number,
      activeProjects: activeProjects as number,
      totalDocuments: totalDocuments as number,
      recentActivity: recentActivity as CustomerActivityLog[],
      subscription:   subscription   as CustomerSubscriptionView | null,
    };
  } catch { return null; }
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function getContacts(accountId: string): Promise<CustomerContact[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.contact.findMany({ where: { accountId }, orderBy: { isPrimary: "desc" } } as unknown)) as CustomerContact[];
  } catch { return []; }
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects(accountId: string): Promise<CustomerProject[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.project.findMany({
      where:   { accountId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tickets: true, documents: true } } },
    } as unknown)) as CustomerProject[];
  } catch { return []; }
}

export async function getProjectById(accountId: string, projectId: string): Promise<CustomerProject | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.project.findFirst({
      where: { id: projectId, accountId, deletedAt: null },
    } as unknown)) as CustomerProject | null;
  } catch { return null; }
}

// ── Support tickets ───────────────────────────────────────────────────────────

export async function getTickets(accountId: string, status?: string): Promise<CustomerSupportTicket[]> {
  const db = await m();
  if (!db) return [];
  try {
    const where = status
      ? { accountId, status, deletedAt: null }
      : { accountId, deletedAt: null };
    return (await db.ticket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { messages: true } } },
    } as unknown)) as CustomerSupportTicket[];
  } catch { return []; }
}

export async function getTicketById(accountId: string, ticketId: string): Promise<CustomerSupportTicket | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.ticket.findFirst({
      where: { id: ticketId, accountId, deletedAt: null },
    } as unknown)) as CustomerSupportTicket | null;
  } catch { return null; }
}

export async function createTicket(data: {
  accountId:       string;
  projectId?:      string | null;
  createdByUserId?: string | null;
  title:           string;
  descriptionEn:   string;
  priority:        string;
  category:        string;
}): Promise<CustomerSupportTicket | null> {
  const db = await m();
  if (!db) return null;
  try {
    const slaHours: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 48, LOW: 120 };
    const hours = slaHours[data.priority] ?? 48;
    const slaDeadline = new Date(Date.now() + hours * 3600 * 1000);
    return (await db.ticket.create({
      data: {
        accountId:       data.accountId,
        projectId:       data.projectId ?? null,
        createdByUserId: data.createdByUserId ?? null,
        title:           data.title,
        descriptionEn:   data.descriptionEn,
        priority:        data.priority,
        category:        data.category,
        slaDeadline,
        updatedAt:       new Date(),
      },
    } as unknown)) as CustomerSupportTicket;
  } catch { return null; }
}

// ── Ticket messages ───────────────────────────────────────────────────────────

export async function getMessages(ticketId: string, includeInternal = false): Promise<CustomerSupportMessage[]> {
  const db = await m();
  if (!db) return [];
  try {
    const where = includeInternal ? { ticketId } : { ticketId, isInternal: false };
    return (await db.message.findMany({ where, orderBy: { createdAt: "asc" } } as unknown)) as CustomerSupportMessage[];
  } catch { return []; }
}

export async function createMessage(data: {
  ticketId:   string;
  authorId?:  string | null;
  authorName: string;
  authorRole: string;
  body:       string;
  isInternal?: boolean;
}): Promise<CustomerSupportMessage | null> {
  const db = await m();
  if (!db) return null;
  try {
    const msg = (await db.message.create({
      data: {
        ticketId:   data.ticketId,
        authorId:   data.authorId ?? null,
        authorName: data.authorName,
        authorRole: data.authorRole,
        body:       data.body,
        isInternal: data.isInternal ?? false,
      },
    } as unknown)) as CustomerSupportMessage;
    // Update ticket updatedAt
    await db.ticket.update({ where: { id: data.ticketId }, data: { updatedAt: new Date() } } as unknown);
    return msg;
  } catch { return null; }
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function getDocuments(accountId: string, category?: string): Promise<CustomerDocument[]> {
  const db = await m();
  if (!db) return [];
  try {
    const where = category
      ? { accountId, category, deletedAt: null }
      : { accountId, deletedAt: null };
    return (await db.document.findMany({ where, orderBy: { createdAt: "desc" } } as unknown)) as CustomerDocument[];
  } catch { return []; }
}

// ── Activity log ──────────────────────────────────────────────────────────────

export async function getActivityLog(accountId: string, take = 50): Promise<CustomerActivityLog[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.activity.findMany({
      where:   { accountId },
      orderBy: { createdAt: "desc" },
      take,
    } as unknown)) as CustomerActivityLog[];
  } catch { return []; }
}

export async function logActivity(data: {
  accountId:   string;
  userId?:     string | null;
  eventType:   string;
  description: string;
  metadata?:   Record<string, unknown>;
  ipAddress?:  string;
}): Promise<void> {
  const db = await m();
  if (!db) return;
  try {
    await db.activity.create({
      data: {
        accountId:   data.accountId,
        userId:      data.userId ?? null,
        eventType:   data.eventType,
        description: data.description,
        metadata:    data.metadata ?? {},
        ipAddress:   data.ipAddress ?? null,
      },
    } as unknown);
  } catch { /* fire-and-forget */ }
}

// ── Subscription ──────────────────────────────────────────────────────────────

export async function getSubscription(accountId: string): Promise<CustomerSubscriptionView | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.subscription.findUnique({ where: { accountId } } as unknown)) as CustomerSubscriptionView | null;
  } catch { return null; }
}

// ── Preferences ───────────────────────────────────────────────────────────────

export async function getPreference(accountId: string): Promise<CustomerPortalPreference | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.preference.findUnique({ where: { accountId } } as unknown)) as CustomerPortalPreference | null;
  } catch { return null; }
}

export async function upsertPreference(
  accountId: string,
  userId: string | null,
  data: Partial<Omit<CustomerPortalPreference, "id" | "accountId" | "userId">>
): Promise<CustomerPortalPreference | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.preference.upsert({
      where:  { accountId },
      create: { accountId, userId, ...data, updatedAt: new Date() },
      update: { ...data, updatedAt: new Date() },
    } as unknown)) as CustomerPortalPreference;
  } catch { return null; }
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

export async function adminListAccounts(opts?: {
  status?: string;
  take?:   number;
  skip?:   number;
}): Promise<AdminCustomerListItem[]> {
  const db = await m();
  if (!db) return [];
  try {
    const rows = (await db.account.findMany({
      where:   opts?.status ? { status: opts.status, deletedAt: null } : { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take:    opts?.take ?? 100,
      skip:    opts?.skip ?? 0,
      include: {
        _count: {
          select: {
            tickets:  { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } },
            projects: { where: { status: "ACTIVE" } },
          },
        },
      },
    } as unknown)) as Array<CustomerAccount & { _count: { tickets: number; projects: number } }>;

    return rows.map((r) => ({
      id:             r.id,
      accountNumber:  r.accountNumber,
      displayName:    r.displayName,
      industry:       r.industry,
      tier:           r.tier,
      status:         r.status,
      healthScore:    r.healthScore,
      openTickets:    (r as unknown as { _count: { tickets: number } })._count.tickets,
      activeProjects: (r as unknown as { _count: { projects: number } })._count.projects,
      csManagerId:    r.csManagerId,
      createdAt:      typeof r.createdAt === "string" ? r.createdAt : new Date(r.createdAt as unknown as string).toISOString(),
    }));
  } catch { return []; }
}

export async function adminGetAccount(id: string): Promise<(CustomerAccount & {
  contacts:      CustomerContact[];
  projects:      CustomerProject[];
  tickets:       CustomerSupportTicket[];
  preference:    CustomerPortalPreference | null;
  subscriptionView: CustomerSubscriptionView | null;
}) | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.account.findUnique({
      where:   { id },
      include: { contacts: true, projects: { where: { deletedAt: null } }, tickets: { where: { deletedAt: null }, take: 10, orderBy: { createdAt: "desc" } }, preference: true, subscriptionView: true },
    } as unknown)) as never;
  } catch { return null; }
}

export async function adminUpdateAccount(id: string, data: Partial<{
  displayName:  string;
  industry:     string;
  region:       string;
  tier:         string;
  csManagerId:  string | null;
  status:       string;
  notes:        string;
  healthScore:  number;
}>): Promise<CustomerAccount | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.account.update({
      where: { id },
      data:  { ...data, updatedAt: new Date() },
    } as unknown)) as CustomerAccount;
  } catch { return null; }
}

// ── Academy integration ───────────────────────────────────────────────────────

export async function getTrainingForUser(userId: string): Promise<{
  enrollments: unknown[];
  certificates: unknown[];
}> {
  const db = await getPrisma();
  if (!db) return { enrollments: [], certificates: [] };
  const d = db as Record<string, AnyModel>;
  try {
    const [enrollments, certificates] = await Promise.all([
      d.academyEnrollment.findMany({
        where:   { userId },
        include: { course: { select: { id: true, titleEn: true, titleFa: true, estimatedHours: true, level: true, thumbnailUrl: true } } },
        orderBy: { enrolledAt: "desc" },
        take:    20,
      } as unknown),
      d.academyCertificate.findMany({
        where:   { userId },
        include: { course: { select: { id: true, titleEn: true } } },
        orderBy: { issuedAt: "desc" },
        take:    10,
      } as unknown),
    ]);
    return {
      enrollments:  enrollments  as unknown[],
      certificates: certificates as unknown[],
    };
  } catch { return { enrollments: [], certificates: [] }; }
}

// ── Milestone helper ─────────────────────────────────────────────────────────

export function parseMilestones(raw: unknown): Milestone[] {
  if (!Array.isArray(raw)) return [];
  return raw as Milestone[];
}
