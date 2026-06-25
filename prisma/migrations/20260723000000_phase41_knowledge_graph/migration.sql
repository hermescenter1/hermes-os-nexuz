-- Phase 41: Industrial Knowledge Graph
-- DERIVED/MATERIALIZED VIEW of source tables (Phases 35–40).
-- entityId is a SOFT REFERENCE — no DB foreign key.
-- Rebuilt via POST /api/industrial-graph/rebuild (manage_knowledge_graph permission).

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "KnowledgeGraphNodeType" AS ENUM (
  'ASSET',
  'FAILURE_MODE',
  'ROOT_CAUSE',
  'PROCEDURE',
  'ENGINEERING_CASE',
  'PREDICTIVE_RISK',
  'TELEMETRY_TAG',
  'DIGITAL_TWIN_NODE'
);

CREATE TYPE "KnowledgeGraphEdgeType" AS ENUM (
  'HAS_FAILURE_MODE',
  'CAUSED_BY',
  'MITIGATED_BY',
  'DOCUMENTED_IN',
  'OBSERVED_ON',
  'CONNECTED_TO',
  'DEPENDS_ON',
  'INDICATES_RISK',
  'RELATED_TO'
);

-- ── IndustrialKnowledgeGraphNode ─────────────────────────────────────────────
-- @@unique([organizationId, nodeType, entityId]) enforces one node per source entity.
-- entityId is a soft reference — see schema comment.

CREATE TABLE "IndustrialKnowledgeGraphNode" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "nodeType"       "KnowledgeGraphNodeType" NOT NULL,
  "entityId"       TEXT         NOT NULL,
  "label"          TEXT         NOT NULL,
  "metadata"       JSONB        NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "IndustrialKnowledgeGraphNode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IndustrialKnowledgeGraphNode_org_fk"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "IndustrialKnowledgeGraphNode_org_type_entity_key"
    UNIQUE ("organizationId", "nodeType", "entityId")
);

CREATE INDEX "IndustrialKnowledgeGraphNode_orgId_nodeType_idx"
  ON "IndustrialKnowledgeGraphNode" ("organizationId", "nodeType");

-- ── IndustrialKnowledgeGraphEdge ─────────────────────────────────────────────
-- weight: 0.0–1.0 normalized (see schema comment for normalization rules).
-- Cascade delete on sourceNode/targetNode ensures no dangling edges.

CREATE TABLE "IndustrialKnowledgeGraphEdge" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "sourceNodeId"   TEXT         NOT NULL,
  "targetNodeId"   TEXT         NOT NULL,
  "edgeType"       "KnowledgeGraphEdgeType" NOT NULL,
  "weight"         DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "evidence"       JSONB        NOT NULL DEFAULT '{}',
  "metadata"       JSONB        NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "IndustrialKnowledgeGraphEdge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IndustrialKnowledgeGraphEdge_org_fk"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "IndustrialKnowledgeGraphEdge_source_fk"
    FOREIGN KEY ("sourceNodeId") REFERENCES "IndustrialKnowledgeGraphNode"("id") ON DELETE CASCADE,
  CONSTRAINT "IndustrialKnowledgeGraphEdge_target_fk"
    FOREIGN KEY ("targetNodeId") REFERENCES "IndustrialKnowledgeGraphNode"("id") ON DELETE CASCADE,
  CONSTRAINT "IndustrialKnowledgeGraphEdge_src_tgt_type_key"
    UNIQUE ("sourceNodeId", "targetNodeId", "edgeType")
);

CREATE INDEX "IndustrialKnowledgeGraphEdge_org_edgeType_idx"
  ON "IndustrialKnowledgeGraphEdge" ("organizationId", "edgeType");

CREATE INDEX "IndustrialKnowledgeGraphEdge_org_source_idx"
  ON "IndustrialKnowledgeGraphEdge" ("organizationId", "sourceNodeId");

CREATE INDEX "IndustrialKnowledgeGraphEdge_org_target_idx"
  ON "IndustrialKnowledgeGraphEdge" ("organizationId", "targetNodeId");

-- ── KnowledgeGraphSnapshot ───────────────────────────────────────────────────
-- Records each successful rebuild. Most recent row's createdAt = lastBuiltAt.

CREATE TABLE "KnowledgeGraphSnapshot" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "name"           TEXT        NOT NULL,
  "summary"        JSONB       NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "KnowledgeGraphSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeGraphSnapshot_org_fk"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE INDEX "KnowledgeGraphSnapshot_org_createdAt_idx"
  ON "KnowledgeGraphSnapshot" ("organizationId", "createdAt");
