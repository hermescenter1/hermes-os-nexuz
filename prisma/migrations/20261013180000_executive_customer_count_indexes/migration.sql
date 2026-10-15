-- Executive Management Center — indexes for the customer counters
-- (requirement row 11, the performance baseline).
--
-- Measured on an isolated PostgreSQL at 64,063 customers in one organization
-- (2026-10-13): three of the five customer counts were sequential scans of the
-- whole table. The worst was the "new customers in this period" count, which
-- read 64,063 rows to return 155.
--
-- Additive only: two indexes, no column, constraint or data is touched, so the
-- rollback is DROP INDEX and nothing else.

-- The period counts: organization, customer kind, creation time.
CREATE INDEX "Party_organizationId_kind_createdAt_idx"
    ON "Party" ("organizationId", "kind", "createdAt");

-- Interactions of the whole organization inside a period. The existing index
-- leads with "partyId", so it cannot serve a time range across all customers.
CREATE INDEX "PartyInteraction_organizationId_occurredAt_idx"
    ON "PartyInteraction" ("organizationId", "occurredAt");
