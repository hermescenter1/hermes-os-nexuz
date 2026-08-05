/**
 * Phase 97 Part G — deterministic export executor (collect → package → store).
 *
 * This is the PLANNER + collector orchestration. It performs NO lifecycle writes
 * and NO provider calls: it collects allow-listed sources, builds the
 * deterministic package, and stores it through the repository object-storage
 * abstraction under a server-generated, request-scoped key. Production execution
 * is gated by isExportExecutionEnabled() at the API layer; when disabled the API
 * never invokes this and never marks a job READY.
 */
import { collectExportSources, type ExportPrisma, type ExportSubject } from "./export-sources";
import { buildExportPackage, computeExportPackageHash, type ExportPackage } from "./export-package";
import { resolveExportExpiry, type ExportExpiryConfig } from "./export-lifecycle";
import { exportPackageKey } from "./export-db";
import type { ObjectStorage } from "@/lib/documents/object-storage";

export interface GovernedExportResult {
  packageKey:   string;
  contentHash:  string;
  packageHash:  string;
  recordCounts: Record<string, number>;
  expiryStatus: string;
  expiresAt:    Date | null;
  pkg:          ExportPackage;
}

export async function runGovernedExport(params: {
  db:            ExportPrisma;
  storage:       ObjectStorage;
  exportRequestId: string;
  privacyRequestId: string | null;
  subject:       ExportSubject;
  subjectClass:  string;
  locale:        string;
  expiryConfig:  ExportExpiryConfig | null;
  now:           Date;
}): Promise<GovernedExportResult> {
  const sources = await collectExportSources(params.db, params.subject);
  const expiry = resolveExportExpiry(params.expiryConfig, params.now);

  const pkg = buildExportPackage(sources, {
    exportRequestId:   params.exportRequestId,
    privacyRequestId:  params.privacyRequestId,
    subjectClass:      params.subjectClass,
    organizationScope: params.subject.organizationId,
    locale:            params.locale,
    generatedAt:       params.now,
    expiry:            { status: expiry.status, expiresAt: expiry.expiresAt },
  });

  const key = exportPackageKey(params.exportRequestId); // server-generated, scoped
  await params.storage.put({ key, body: JSON.stringify(pkg), contentType: "application/json" });

  const recordCounts: Record<string, number> = {};
  for (const s of sources) recordCounts[s.name] = s.records.length;

  const packageHash = computeExportPackageHash(pkg); // full-envelope integrity (Finding 3)
  return { packageKey: key, contentHash: pkg.contentHash, packageHash, recordCounts, expiryStatus: expiry.status, expiresAt: expiry.expiresAt, pkg };
}
