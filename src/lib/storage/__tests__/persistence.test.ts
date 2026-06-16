import { it, expect, describe } from "vitest";
import { caseRepository } from "@/lib/storage/case-repository";
import { knowledgeRepository } from "@/lib/storage/knowledge-repository";
import { unknownRepository } from "@/lib/storage/unknown-repository";
import { analysisRepository } from "@/lib/storage/analysis-repository";
import { recordAuditEvent, filterAuditEvents, AUDIT_ACTIONS } from "@/lib/audit/audit-service";

/**
 * Persistent Knowledge Core — repository/service contract.
 *
 * These exercise the storage layer that all pages and API routes read/write
 * through. In session mode (this suite) they run against the in-process store;
 * in database mode the SAME calls hit PostgreSQL via Prisma. Passing here
 * means the contract every page depends on is intact.
 */
describe("Persistent Knowledge Core", () => {
  it("cases: full CRUD", async () => {
    const r = caseRepository();
    const c = await r.create({ title: "RT Case", vendor: "abb", domain: "drives", problem: "p", rootCause: "rc", secondaryCauses: [], verificationSteps: [], correctiveActions: [], safetyNotes: "", tags: [], confidence: 75, status: "draft" });
    expect((await r.list()).some((x) => x.id === c.id)).toBe(true);
    expect((await r.update(c.id, { status: "ready" }))?.status).toBe("ready");
    expect(await r.delete(c.id)).toBe(true);
    expect(await r.get(c.id)).toBeNull();
  });
  it("cases: dedup by title", async () => {
    const r = caseRepository();
    const a = await r.create({ title: "DupT", vendor: "abb", domain: "drives", problem: "", rootCause: "v1", secondaryCauses: [], verificationSteps: [], correctiveActions: [], safetyNotes: "", tags: [], confidence: 70, status: "draft" });
    expect((await r.findByTitle?.("DupT"))?.id).toBe(a.id);
  });
  it("knowledge: create -> get", async () => {
    const r = knowledgeRepository();
    const a = await r.create({ title: "RT Art", domain: "drives", summary: "s", content: "", failureModes: [], diagnosticGuidance: [], verificationSteps: [], correctiveActions: [], safetyNotes: "", tags: [], confidence: 80, status: "draft" });
    expect((await r.get(a.id))?.title).toBe("RT Art");
  });
  it("unknown: create -> resolve", async () => {
    const r = unknownRepository();
    const u = await r.create({ query: "weird", locale: "en", confidence: 0.2, suggestedDomains: ["plc"], suggestedVendors: [], status: "open" });
    expect((await r.update(u.id, { status: "resolved" }))?.status).toBe("resolved");
  });
  it("analysis: create -> list", async () => {
    const r = analysisRepository();
    const a = await r.create({ query: "q", locale: "en", mode: "library", domains: ["drives"], vendors: ["abb"], cases: [], knowledge: [], confidence: 0.7, riskLevel: "low", isUnknown: false });
    expect((await r.list()).some((x) => x.id === a.id)).toBe(true);
  });
  it("audit: record -> filter", async () => {
    await recordAuditEvent({ userId: "u1", action: AUDIT_ACTIONS.CASE_CREATED, entityType: "case", entityId: "c-persist-1", metadata: {} });
    const { events } = await filterAuditEvents({ action: AUDIT_ACTIONS.CASE_CREATED });
    expect(events.some((e) => e.entityId === "c-persist-1")).toBe(true);
  });
});
