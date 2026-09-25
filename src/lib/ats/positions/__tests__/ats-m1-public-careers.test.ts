/**
 * ATS-M1 — the public careers listing shows exactly the published positions.
 *
 * The REAL `listPublicJobCards` runs against a store whose `findMany`
 * evaluates the Prisma `where` it is handed — every clause, including the
 * relation filter on the organization's settings — so the test proves the
 * database predicate, not a re-implementation of it. Any clause the evaluator
 * does not understand throws, so a silently ignored filter cannot pass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { getPublicJobDetail, getPublicJobPosting, listPublicJobCards } from "@/lib/ats/public-jobs";

type Row = Record<string, unknown>;
const NOW = Date.now();
const DAY = 86_400_000;

function evalCond(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond !== "object") return value === cond;
  const c = cond as Row;
  let ok = true;
  for (const [op, arg] of Object.entries(c)) {
    const v = value instanceof Date ? value.getTime() : value;
    const a = arg instanceof Date ? arg.getTime() : arg;
    if (op === "not") ok &&= arg === null ? value !== null && value !== undefined : v !== a;
    else if (op === "lte") ok &&= v !== null && v !== undefined && (v as number) <= (a as number);
    else if (op === "gte") ok &&= v !== null && v !== undefined && (v as number) >= (a as number);
    else throw new Error(`unsupported operator ${op}`);
  }
  return ok;
}

function evalWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    if (k === "OR") {
      if (!(cond as Row[]).some((w) => evalWhere(row, w))) return false;
    } else if (k === "organization") {
      if (!evalWhere(row.organization as Row, cond as Row)) return false;
    } else if (k === "atsSettings") {
      const rel = row.atsSettings as Row | null;
      const is = (cond as { is: Row | null }).is;
      if (!("is" in (cond as Row))) throw new Error("relation filter without `is`");
      if (is === null ? rel !== null : rel === null || !evalWhere(rel, is)) return false;
    } else if (!evalCond(row[k], cond)) {
      return false;
    }
  }
  return true;
}

function job(id: string, over: Row = {}, org = "org-A"): Row {
  return {
    id,
    organizationId: org,
    status: "OPEN",
    isPublic: true,
    deletedAt: null,
    publishedAt: new Date(NOW - DAY),
    closingDate: null,
    department: "Engineering",
    location: "Tehran",
    locationType: null,
    employmentType: null,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    skills: [],
    requisitionKey: id,
    addressLocality: null,
    addressRegion: null,
    addressCountry: null,
    translations: ["EN", "FA"].map((language) => ({
      language,
      title: `${id}-${language}`,
      shortSummary: "s",
      description: "d",
      departmentLabel: "Engineering",
      seoTitle: `${id}-${language}`,
      seoDescription: "s",
    })),
    ...over,
  };
}

let rows: Row[];
let orgSettings: Record<string, Row | null>;

beforeEach(() => {
  orgSettings = { "org-A": null, "org-OFF": { publicListingEnabled: false }, "org-ON": { publicListingEnabled: true } };
  rows = [
    job("open-public"),
    job("draft", { status: "DRAFT" }),
    job("paused", { status: "PAUSED" }),
    job("legacy-on-hold", { status: "ON_HOLD" }),
    job("closed", { status: "CLOSED" }),
    job("archived", { status: "ARCHIVED" }),
    job("soft-deleted", { status: "ARCHIVED", deletedAt: new Date(NOW - DAY) }),
    job("open-deleted", { deletedAt: new Date(NOW - DAY) }),
    job("open-internal", { isPublic: false }),
    job("open-unpublished", { publishedAt: null }),
    job("open-future", { publishedAt: new Date(NOW + DAY) }),
    job("open-expired", { closingDate: new Date(NOW - DAY) }),
    job("open-closing-later", { closingDate: new Date(NOW + 10 * DAY) }),
    job("org-off", {}, "org-OFF"),
    job("org-on", {}, "org-ON"),
  ];
  const findMany = async (a: { where: Row; include?: { translations?: { where?: { language?: string } } } }) => {
    const lang = a.include?.translations?.where?.language;
    return rows
      .map((r): Row => ({ ...r, organization: { atsSettings: orgSettings[r.organizationId as string] ?? null } }))
      .filter((r) => evalWhere(r, a.where))
      .map((r) => ({ ...r, translations: (r.translations as Row[]).filter((t) => !lang || t.language === lang) }));
  };
  const findFirst = async (a: { where: Row; include?: { translations?: true | { where?: { language?: string } } } }) =>
    (await findMany({ where: a.where, include: a.include === undefined || a.include.translations === true ? undefined : (a.include as never) }))[0] ?? null;
  h.db = { atsJob: { findMany, findFirst } };
});

describe("the careers listing — /fa/careers and /en/careers", () => {
  it.each(["fa", "en"])("%s shows ONLY open, public, opened, unexpired, undeleted positions of listing organizations", async (locale) => {
    const cards = await listPublicJobCards(locale);
    expect(cards).not.toBeNull();
    const ids = cards!.map((c) => (c as unknown as { id: string }).id).sort();
    expect(ids).toEqual(["open-closing-later", "open-public", "org-on"]);
  });

  it("the localized title is the requested locale's own", async () => {
    const fa = await listPublicJobCards("fa");
    const en = await listPublicJobCards("en");
    expect(JSON.stringify(fa)).toContain("open-public-FA");
    expect(JSON.stringify(fa)).not.toContain("open-public-EN");
    expect(JSON.stringify(en)).toContain("open-public-EN");
  });

  it("switching an organization's listing off removes all of its positions at once", async () => {
    orgSettings["org-A"] = { publicListingEnabled: false };
    const ids = (await listPublicJobCards("en"))!.map((c) => (c as unknown as { id: string }).id);
    expect(ids).toEqual(["org-on"]);
  });

  it("a position that is paused, closed or archived disappears on the next read", async () => {
    for (const status of ["PAUSED", "CLOSED", "ARCHIVED", "DRAFT"]) {
      rows[0] = job("open-public", { status });
      const ids = (await listPublicJobCards("fa"))!.map((c) => (c as unknown as { id: string }).id);
      expect(ids, status).not.toContain("open-public");
    }
  });
});

describe("ATS-M1 review fix — a confidential salary is never published", () => {
  const withSalary = (salaryConfidential: boolean) =>
    job("salaried", {
      salaryConfidential,
      salaryCurrency: "EUR",
      salaryMin: 90000,
      salaryMax: 120000,
      addressLocality: "Tehran",
      addressRegion: "Tehran Province",
      addressCountry: "IR",
    });

  it("confidential: neither the detail page nor the JobPosting structured data carries any salary field", async () => {
    rows = [withSalary(true)];
    const detail = await getPublicJobDetail("salaried", "en");
    expect(detail && detail !== "UNAVAILABLE").toBeTruthy();
    if (detail && detail !== "UNAVAILABLE") expect([detail.salaryCurrency, detail.salaryMin, detail.salaryMax]).toEqual([null, null, null]);
    const posting = await getPublicJobPosting("salaried", "en");
    expect(posting).not.toBeNull();
    expect([posting!.currency, posting!.salaryMin, posting!.salaryMax]).toEqual([null, null, null]);
    expect(JSON.stringify([detail, posting])).not.toMatch(/90000|120000/);
  });

  it("not confidential: the salary is published as before", async () => {
    rows = [withSalary(false)];
    const detail = await getPublicJobDetail("salaried", "en");
    if (detail && detail !== "UNAVAILABLE") expect([detail.salaryCurrency, detail.salaryMin, detail.salaryMax]).toEqual(["EUR", 90000, 120000]);
    else throw new Error("detail missing");
    const posting = await getPublicJobPosting("salaried", "en");
    expect([posting!.currency, posting!.salaryMin, posting!.salaryMax]).toEqual(["EUR", 90000, 120000]);
  });
});
