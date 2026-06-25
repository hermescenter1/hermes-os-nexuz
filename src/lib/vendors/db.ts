import { getPrisma }              from "@/lib/db/prisma";
import type {
  VendorListItem,
  VendorDetailItem,
  VendorOnboardingRequestItem,
  VendorApplyPayload,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any;

async function db(): Promise<AnyDB | null> {
  const prisma = await getPrisma();
  return prisma ?? null;
}

// ── Public vendor queries ─────────────────────────────────────────────────────

export async function listApprovedVendors(opts?: {
  search?:   string;
  category?: string;
  type?:     string;
  tier?:     string;
  skip?:     number;
  take?:     number;
}): Promise<VendorListItem[] | null> {
  const p = await db();
  if (!p) return null;
  try {
    const where: Record<string, unknown> = {
      status:    "APPROVED",
      isActive:  true,
      deletedAt: null,
    };
    if (opts?.category) where.category = { slug: opts.category };
    if (opts?.type)     where.vendorType = opts.type;
    if (opts?.tier)     where.tier = opts.tier;
    if (opts?.search) {
      where.OR = [
        { nameEn: { contains: opts.search, mode: "insensitive" } },
        { nameFa: { contains: opts.search } },
        { descriptionEn: { contains: opts.search, mode: "insensitive" } },
      ];
    }
    const rows = await p.vendorProfile.findMany({
      where,
      include: {
        category:     true,
        capabilities: { take: 5 },
        _count:       { select: { services: true, products: true, capabilities: true } },
      },
      orderBy: [
        { isFeatured: "desc" },
        { createdAt:  "desc" },
      ],
      skip: opts?.skip ?? 0,
      take: opts?.take ?? 30,
    });
    return rows as VendorListItem[];
  } catch {
    return null;
  }
}

export async function getVendorBySlug(slug: string): Promise<VendorDetailItem | null> {
  const p = await db();
  if (!p) return null;
  try {
    const row = await p.vendorProfile.findFirst({
      where:   { slug, status: "APPROVED", isActive: true, deletedAt: null },
      include: {
        category:         true,
        capabilities:     true,
        services:         { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        products:         { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        complianceRecords: true,
        _count:           { select: { services: true, products: true, capabilities: true } },
      },
    });
    return row as VendorDetailItem | null;
  } catch {
    return null;
  }
}

export async function listApprovedVendorSlugs(): Promise<string[] | null> {
  const p = await db();
  if (!p) return null;
  try {
    const rows = await p.vendorProfile.findMany({
      where:  { status: "APPROVED", isActive: true, deletedAt: null },
      select: { slug: true },
    });
    return (rows as { slug: string }[]).map((r) => r.slug);
  } catch {
    return null;
  }
}

// ── Onboarding request ────────────────────────────────────────────────────────

export async function createOnboardingRequest(
  payload: VendorApplyPayload,
  sessionId?: string
): Promise<{ id: string } | null> {
  const p = await db();
  if (!p) return null;
  try {
    const row = await p.vendorOnboardingRequest.create({
      data: {
        ...payload,
        websiteUrl:          payload.websiteUrl     || null,
        headquartersCity:    payload.headquartersCity || null,
        headquartersCountry: payload.headquartersCountry ?? "Iran",
        foundedYear:         payload.foundedYear    ?? null,
        employeeCount:       payload.employeeCount  || null,
        contactNameFa:       payload.contactNameFa  || null,
        contactPhone:        payload.contactPhone   || null,
        contactTitle:        payload.contactTitle   || null,
        categorySlug:        payload.categorySlug   || null,
        companyNameFa:       payload.companyNameFa  || null,
        companyDescEn:       payload.companyDescEn  || null,
        companyDescFa:       payload.companyDescFa  || null,
        sessionId:           sessionId              || null,
        status:              "PENDING",
        submittedAt:         new Date(),
      },
      select: { id: true },
    });
    return { id: (row as { id: string }).id };
  } catch {
    return null;
  }
}

// ── Admin queries ─────────────────────────────────────────────────────────────

export async function adminListOnboardingRequests(opts?: {
  status?: string;
  take?:   number;
  skip?:   number;
}): Promise<VendorOnboardingRequestItem[] | null> {
  const p = await db();
  if (!p) return null;
  try {
    const where: Record<string, unknown> = {};
    if (opts?.status) where.status = opts.status;
    const rows = await p.vendorOnboardingRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    opts?.take ?? 50,
      skip:    opts?.skip ?? 0,
    });
    return rows as VendorOnboardingRequestItem[];
  } catch {
    return null;
  }
}

export async function adminListVendors(opts?: {
  status?: string;
  take?:   number;
  skip?:   number;
}): Promise<VendorListItem[] | null> {
  const p = await db();
  if (!p) return null;
  try {
    const where: Record<string, unknown> = { deletedAt: null };
    if (opts?.status) where.status = opts.status;
    const rows = await p.vendorProfile.findMany({
      where,
      include: {
        category: true,
        _count:   { select: { services: true, products: true, capabilities: true } },
      },
      orderBy: { createdAt: "desc" },
      take:    opts?.take ?? 50,
      skip:    opts?.skip ?? 0,
    });
    return rows as VendorListItem[];
  } catch {
    return null;
  }
}

export async function adminApproveOnboardingRequest(
  requestId:  string,
  reviewedBy: string
): Promise<{ vendorId: string } | null> {
  const p = await db();
  if (!p) return null;
  try {
    const req = await p.vendorOnboardingRequest.findUnique({ where: { id: requestId } });
    if (!req) return null;

    const slug = `${String(req.companyNameEn).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${requestId.slice(-6)}`;

    const vendor = await p.vendorProfile.create({
      data: {
        slug,
        nameEn:              req.companyNameEn,
        nameFa:              req.companyNameFa ?? req.companyNameEn,
        websiteUrl:          req.websiteUrl,
        headquartersCity:    req.headquartersCity,
        headquartersCountry: req.headquartersCountry,
        foundedYear:         req.foundedYear,
        employeeCount:       req.employeeCount,
        descriptionEn:       req.companyDescEn,
        contactEmail:        req.contactEmail,
        contactPhone:        req.contactPhone,
        vendorType:          req.vendorType,
        regionsServed:       req.regionsServed,
        status:              "APPROVED",
        isActive:            true,
        approvedAt:          new Date(),
        approvedBy:          reviewedBy,
      },
      select: { id: true },
    });

    await p.vendorOnboardingRequest.update({
      where: { id: requestId },
      data: {
        status:        "APPROVED",
        reviewedBy,
        reviewedAt:    new Date(),
        resultVendorId: (vendor as { id: string }).id,
      },
    });

    return { vendorId: (vendor as { id: string }).id };
  } catch {
    return null;
  }
}

export async function adminRejectOnboardingRequest(
  requestId:       string,
  reviewedBy:      string,
  rejectionReason: string
): Promise<boolean> {
  const p = await db();
  if (!p) return false;
  try {
    await p.vendorOnboardingRequest.update({
      where: { id: requestId },
      data: {
        status:          "REJECTED",
        reviewedBy,
        reviewedAt:      new Date(),
        rejectionReason: rejectionReason || "Application did not meet requirements.",
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function adminUpdateVendorProfile(
  id:   string,
  data: Record<string, unknown>
): Promise<boolean> {
  const p = await db();
  if (!p) return false;
  try {
    await p.vendorProfile.update({ where: { id }, data });
    return true;
  } catch {
    return false;
  }
}
