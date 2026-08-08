// PHASE 96 runtime — Prisma-backed webhook claim store.
//
// The (provider, providerEventId) unique index is the authoritative atomic claim
// mechanism. A fresh event inserts a PROCESSING row; a concurrent duplicate hits
// the unique constraint and is rejected; an already PROCESSED/IGNORED event is a
// DUPLICATE; a previously FAILED event may be re-claimed (controlled retry).
//
// Stores only the envelope — never the raw payload or any secret.

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ClaimResult, WebhookClaimStore, WebhookEnvelope } from "../webhook-idempotency";

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "P2002");
}

export function prismaWebhookClaimStore(): WebhookClaimStore {
  return {
    async claim(env: WebhookEnvelope): Promise<ClaimResult> {
      const client = (await getPrisma()) as unknown as PrismaClient | null;
      // No DB ⇒ cannot guarantee idempotency ⇒ fail closed by declaring DUPLICATE
      // (do not process an event we cannot durably claim).
      if (!client) return "DUPLICATE";

      try {
        await client.billingWebhookEvent.create({
          data: {
            provider: env.provider,
            providerEventId: env.providerEventId,
            providerCreatedAt: env.providerCreatedAt,
            eventType: env.eventType,
            objectReferenceHash: env.objectReferenceHash,
            status: "PROCESSING",
            attemptCount: 1,
            processingStartedAt: new Date(),
          },
        });
        return "CLAIMED";
      } catch (err) {
        if (!isUniqueViolation(err)) return "DUPLICATE"; // unknown error ⇒ do not process
        // Row exists — decide duplicate vs retry-after-failure.
        const existing = await client.billingWebhookEvent.findUnique({
          where: { provider_providerEventId: { provider: env.provider, providerEventId: env.providerEventId } },
        });
        if (!existing) return "DUPLICATE";
        if (existing.status === "PROCESSED" || existing.status === "IGNORED") return "DUPLICATE";
        if (existing.status === "FAILED") {
          // Re-claim atomically: only succeeds if still FAILED.
          const res = await client.billingWebhookEvent.updateMany({
            where: { id: existing.id, status: "FAILED" },
            data: { status: "PROCESSING", processingStartedAt: new Date(), attemptCount: { increment: 1 } },
          });
          return res.count === 1 ? "CLAIMED" : "DUPLICATE";
        }
        // RECEIVED / PROCESSING ⇒ another worker owns it.
        return "DUPLICATE";
      }
    },

    async markProcessed(provider, providerEventId): Promise<void> {
      const client = (await getPrisma()) as unknown as PrismaClient | null;
      if (!client) return;
      await client.billingWebhookEvent.updateMany({
        where: { provider, providerEventId },
        data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
      });
    },

    async markIgnored(provider, providerEventId, code): Promise<void> {
      const client = (await getPrisma()) as unknown as PrismaClient | null;
      if (!client) return;
      await client.billingWebhookEvent.updateMany({
        where: { provider, providerEventId },
        data: { status: "IGNORED", processedAt: new Date(), failureCode: code },
      });
    },

    async markFailed(provider, providerEventId, code): Promise<void> {
      const client = (await getPrisma()) as unknown as PrismaClient | null;
      if (!client) return;
      await client.billingWebhookEvent.updateMany({
        where: { provider, providerEventId },
        data: { status: "FAILED", failureCode: code },
      });
    },
  };
}
