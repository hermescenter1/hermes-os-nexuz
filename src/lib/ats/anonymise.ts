/**
 * ATS — the ONE anonymisation primitive for an application's personal content.
 *
 * Extracted from the retention sweep so the sweep and the candidate-erasure
 * workflow share exactly one definition of "remove the personal content of an
 * application". It clears the free-text personal fields (`resumeText`,
 * `coverLetter`, `notes`) and stamps `anonymizedAt`, tenant-scoped and
 * idempotent (a second call on an already-anonymised row changes nothing).
 *
 * It deliberately does NOT change the application's pipeline status, write an
 * audit row, or touch the candidate record — the caller owns the reason, the
 * audit and the surrounding transaction. A data-retention or erasure request
 * is not a hiring decision, so the status is left exactly as it was.
 */

export interface AnonymiseApplicationArgs {
  applicationId: string;
  /** Tenant guard: the update only matches a row in this organization. */
  organizationId: string;
  now: Date;
  /** When true, also soft-deletes the application (the retention DELETE action). */
  alsoSoftDelete?: boolean;
}

/** Minimal shape of the Prisma transaction client this helper needs. */
export interface AnonymiseTx {
  atsApplication: {
    updateMany: (args: {
      where: { id: string; organizationId: string; anonymizedAt: null };
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
}

/**
 * Anonymise one application inside an open transaction. Returns true when it
 * actually changed a row (i.e. the application existed in this organization and
 * was not already anonymised), false otherwise.
 */
export async function anonymiseApplicationTx(tx: AnonymiseTx, args: AnonymiseApplicationArgs): Promise<boolean> {
  const changed = await tx.atsApplication.updateMany({
    where: { id: args.applicationId, organizationId: args.organizationId, anonymizedAt: null },
    data: {
      resumeText: null,
      coverLetter: null,
      notes: null,
      anonymizedAt: args.now,
      ...(args.alsoSoftDelete ? { deletedAt: args.now } : {}),
    },
  });
  return changed.count === 1;
}
