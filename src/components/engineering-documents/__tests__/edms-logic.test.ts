import { describe, it, expect } from "vitest";
import {
  deriveDocumentAttention, documentsWithoutCurrentRevision, orderedCounts, linkedContext,
} from "../logic";
import type { EdmsDashboard, EdmsDocument } from "@/lib/document/types";

/**
 * PHASE 87J — the EDMS attention layer derives DETERMINISTICALLY from real
 * EdmsDashboard fields. No inferred urgency, no fabricated compliance/audit
 * metric, and crucially NO "overdue" claim (the summary carries no due dates).
 */

function doc(over: Partial<EdmsDocument> = {}): EdmsDocument {
  return {
    id: "d1", organizationId: null, folderId: null, categoryId: null, templateId: null,
    title: "P&ID — Feed Line", description: null, documentType: "PID", status: "APPROVED",
    currentRevision: "B", language: "en", keywords: [], ownerId: "u1",
    erpProjectId: null, workOrderId: null, crmAccountId: null, vendorId: null,
    siteId: null, equipmentId: null, filePath: null, fileSize: null, mimeType: null,
    checksum: null, isLocked: false, lockedBy: null, lockedAt: null, deletedAt: null,
    createdBy: null, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z",
    ...over,
  };
}

function dash(over: Partial<EdmsDashboard> = {}): EdmsDashboard {
  return {
    totalDocuments: 12, draftCount: 2, reviewCount: 0, approvedCount: 8,
    rejectedCount: 0, archivedCount: 2, pendingApprovals: 0, activeCheckouts: 0,
    recentDocuments: [], recentAudit: [],
    documentsByType: { PID: 4, MANUAL: 3 },
    documentsByStatus: { APPROVED: 8, DRAFT: 2, ARCHIVED: 2 },
    ...over,
  };
}

describe("deriveDocumentAttention — deterministic thresholds, stable order", () => {
  it("orders approvals → in-review → returned → missing-revision → checked-out", () => {
    const items = deriveDocumentAttention(dash({
      pendingApprovals: 3, reviewCount: 5, rejectedCount: 1, activeCheckouts: 2,
      recentDocuments: [doc({ id: "a", currentRevision: null }), doc({ id: "b", currentRevision: "A" })],
    }));
    expect(items.map((i) => i.kind)).toEqual([
      "pendingApprovals", "inReview", "rejected", "missingRevision", "checkedOut",
    ]);
    expect(items.map((i) => i.count)).toEqual([3, 5, 1, 1, 2]);
    expect(items.map((i) => i.severity)).toEqual(["action", "action", "action", "review", "review"]);
  });

  it("routes each item to a real EDMS destination", () => {
    const items = deriveDocumentAttention(dash({ pendingApprovals: 1, rejectedCount: 1, activeCheckouts: 1 }));
    expect(items.find((i) => i.kind === "pendingApprovals")?.href).toBe("/documents/approvals");
    expect(items.find((i) => i.kind === "rejected")?.href).toBe("/documents/explorer");
    expect(items.find((i) => i.kind === "checkedOut")?.href).toBe("/documents/explorer");
    expect(items.every((i) => i.href.startsWith("/documents"))).toBe(true);
  });

  it("emits NO overdue item — the dashboard carries no due dates (no fabrication)", () => {
    const items = deriveDocumentAttention(dash({ pendingApprovals: 9, reviewCount: 9 }));
    expect(items.some((i) => String(i.kind).toLowerCase().includes("overdue"))).toBe(false);
  });

  it("empty when every queue is clear (drives the calm empty state)", () => {
    expect(deriveDocumentAttention(dash())).toEqual([]);
  });
});

describe("documentsWithoutCurrentRevision — current vs. absent revision", () => {
  it("counts null and empty revision codes, skips soft-deleted records", () => {
    const rows = documentsWithoutCurrentRevision([
      doc({ id: "a", currentRevision: null }),
      doc({ id: "b", currentRevision: "" }),
      doc({ id: "c", currentRevision: "P01" }),
      doc({ id: "d", currentRevision: null, deletedAt: "2026-07-01T00:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("treats a revision code as an opaque identifier (A / B / 01 / P01 / C02 all kept)", () => {
    for (const rev of ["A", "B", "01", "P01", "C02"]) {
      expect(documentsWithoutCurrentRevision([doc({ currentRevision: rev })])).toEqual([]);
    }
  });
});

describe("orderedCounts — enum order preserved, zeros dropped", () => {
  it("keeps supplied order and omits zero counts", () => {
    expect(orderedCounts(["REVIEW", "DRAFT", "APPROVED"] as const, { APPROVED: 8, DRAFT: 2, REVIEW: 0 }))
      .toEqual([{ key: "DRAFT", count: 2 }, { key: "APPROVED", count: 8 }]);
  });

  it("tolerates a missing distribution", () => {
    expect(orderedCounts(["A"] as const, undefined)).toEqual([]);
  });
});

describe("linkedContext — only relationships the record actually carries", () => {
  it("returns project/site/asset/workOrder in a stable order, skipping nulls", () => {
    expect(linkedContext(doc({ erpProjectId: "PRJ-1", siteId: "SITE-B", equipmentId: "PMP-204", workOrderId: "WO-7" })))
      .toEqual([
        { kind: "project", id: "PRJ-1" },
        { kind: "site", id: "SITE-B" },
        { kind: "asset", id: "PMP-204" },
        { kind: "workOrder", id: "WO-7" },
      ]);
  });

  it("returns nothing when the document has no engineering links (never fabricated)", () => {
    expect(linkedContext(doc())).toEqual([]);
  });
});
