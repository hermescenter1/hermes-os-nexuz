/**
 * The Stage-1 public application schema — the ONE definition.
 *
 * Dependency-free apart from zod, on purpose: the server route validates with
 * it, and the public application form validates the SAME object in the
 * browser, so the two can never disagree about what a valid application is.
 * `@/lib/ats/application` re-exports it for every server caller; it cannot live
 * there alone because that module reaches Prisma (→ pg → node `tls`), which a
 * client bundle must never contain.
 *
 * `.strict()`: an unknown key is refused, so a client can never smuggle a
 * status, a consent bypass or a retired field (e.g. workAuthorization) in.
 */
import { z } from "zod";

export const stage1ApplicationSchema = z
  .object({
    jobId: z.string().trim().min(1).max(64),
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(3).max(40).optional(),
    currentLocation: z.string().trim().min(1).max(200).optional(),
    yearsExperience: z.number().int().min(0).max(60).optional(),
    keySkills: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
    resumeText: z.string().trim().min(1).max(20000).optional(),
    fitStatement: z.string().trim().min(1).max(4000).optional(),
    linkedinUrl: z.string().trim().url().max(300).optional(),
    privacyNoticeAcknowledged: z.literal(true),
    accuracyConfirmed: z.literal(true),
    futureOpeningsConsent: z.boolean().optional(),
  })
  .strict();

export type Stage1Application = z.infer<typeof stage1ApplicationSchema>;
