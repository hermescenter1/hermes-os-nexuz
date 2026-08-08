// PHASE 95 runtime — Prisma-backed tenant provider-policy store.
//
// Fail-closed: no database, no row, or any error resolves to `null` (deny). The
// store reads the approval envelope only; it never touches a provider key.

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { DataClass } from "../types";
import type { OrganisationProviderPolicy, ProviderPolicyStore } from "../provider-policy";

export function prismaProviderPolicyStore(): ProviderPolicyStore {
  return {
    async find(organisationId: string, providerRegistryId: string): Promise<OrganisationProviderPolicy | null> {
      try {
        const client = (await getPrisma()) as unknown as PrismaClient | null;
        if (!client) return null; // no DB ⇒ deny (fail closed)
        const row = await client.aiProviderPolicy.findUnique({
          where: { organizationId_providerRegistryId: { organizationId: organisationId, providerRegistryId } },
        });
        if (!row) return null;
        return {
          organisationId: row.organizationId,
          providerRegistryId: row.providerRegistryId,
          enabled: row.enabled,
          allowedDataClasses: row.allowedDataClasses as DataClass[],
          allowedWorkflows: row.allowedWorkflows,
          approvedBy: row.approvedBy,
          approvedAt: row.approvedAt,
          policyVersion: row.policyVersion,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      } catch {
        return null; // any failure ⇒ deny
      }
    },
  };
}
