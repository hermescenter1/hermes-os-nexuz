// Phase 69 — EDMS retention policy engine

import type { EdmsDocument, EdmsRetentionPolicy } from "./types";

export interface RetentionCheckResult {
  documentId:    string;
  title:         string;
  createdAt:     string;
  ageInDays:     number;
  policyName:    string | null;
  retentionDays: number | null;
  shouldArchive: boolean;
  shouldDelete:  boolean;
  action:        "keep" | "archive" | "delete";
}

export function checkRetention(
  doc: EdmsDocument,
  policies: EdmsRetentionPolicy[]
): RetentionCheckResult {
  const matchingPolicy = policies.find(p =>
    p.isActive && (p.documentType === null || p.documentType === doc.documentType)
  );

  const now      = Date.now();
  const created  = new Date(doc.createdAt).getTime();
  const ageInMs  = now - created;
  const ageInDays = Math.floor(ageInMs / 86400000);

  if (!matchingPolicy) {
    return {
      documentId: doc.id, title: doc.title, createdAt: doc.createdAt,
      ageInDays, policyName: null, retentionDays: null,
      shouldArchive: false, shouldDelete: false, action: "keep",
    };
  }

  const shouldDelete  = matchingPolicy.autoDelete  && ageInDays > matchingPolicy.retentionDays;
  const shouldArchive = matchingPolicy.autoArchive && ageInDays > matchingPolicy.retentionDays && !shouldDelete;
  const action        = shouldDelete ? "delete" : shouldArchive ? "archive" : "keep";

  return {
    documentId: doc.id, title: doc.title, createdAt: doc.createdAt,
    ageInDays, policyName: matchingPolicy.name, retentionDays: matchingPolicy.retentionDays,
    shouldArchive, shouldDelete, action,
  };
}

export function applyRetentionPolicies(
  documents: EdmsDocument[],
  policies:  EdmsRetentionPolicy[]
): RetentionCheckResult[] {
  return documents
    .filter(d => !d.deletedAt && d.status !== "ARCHIVED")
    .map(d => checkRetention(d, policies));
}
