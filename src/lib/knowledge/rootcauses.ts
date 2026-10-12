/**
 * IndustrialRootCause CRUD + getRootCauseCandidates() — Phase 40.
 *
 * getRootCauseCandidates() — deterministic, fully documented ordering:
 *
 * Candidate score formula (capped at 1.0):
 *   base  = rootCause.confidenceWeight             (0.0–1.0 from DB)
 *   +0.20  if asset is DEGRADING or RAPIDLY_DEGRADING (Phase 39 FailureIndicator)
 *   +0.15  if alarm count in last 7d > 5 (Phase 37 telemetry quality)
 *   +0.10  if FailureIndicator.probability is MEDIUM or HIGH (Phase 39)
 *   +0.10  if failure mode's assetTypes includes this asset's type
 *   cap at 1.0
 *
 * Sorting: candidateScore DESC → failureMode.severity DESC (CRITICAL>HIGH>MEDIUM>LOW) → id ASC.
 * Every factor is logged in scoringFactors for full explainability.
 *
 * SITE SCOPE (slice C, IR-04): the candidates read the asset's FailureIndicator and its BAD/STALE telemetry
 * count, so they are computed only for an {@link AuthorizedAsset} — an asset proven to be the organisation's
 * and to stand on one of the caller's readable ACTIVE sites (see {@link resolveAuthorizedAsset}). A
 * client-supplied asset id never reaches those reads directly.
 */

import { getPrisma }            from "@/lib/db/prisma";
import { logInfraFailure }      from "@/lib/logger/security-events";
import { confidenceFromWeight } from "./types";
import {
  RC_BONUS_DECLINING_HEALTH,
  RC_BONUS_HIGH_ALARMS,
  RC_BONUS_FAILURE_INDICATOR,
  RC_BONUS_ASSET_TYPE_MATCH,
} from "./types";
import type {
  RootCauseRecord, FailureModeRecord, RootCauseCandidate, KnowledgeEvidence,
} from "./types";
import { _rowToFM, _rowToRC } from "./failures";

type RCModel = {
  create:   (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst:(a: unknown) => Promise<Record<string, unknown> | null>;
  update:   (a: unknown) => Promise<Record<string, unknown>>;
};

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

declare const authorizedAssetBrand: unique symbol;

/** An asset the caller may read. Only {@link resolveAuthorizedAsset} produces one. */
export interface AuthorizedAsset {
  readonly [authorizedAssetBrand]: true;
  readonly id:        string;
  readonly siteId:    string;
  /** Server-derived: never taken from the request. */
  readonly assetType: string | null;
}

const MAX_ASSET_ID_LENGTH = 128;

/**
 * The asset, if and only if it belongs to `organizationId` AND stands on one of `allowedSiteIds` (the caller's
 * readable ACTIVE sites) AND that site is still ACTIVE. A hidden, inactive, foreign, nonexistent or malformed
 * id is `null` — one answer. Fails closed on a database error.
 */
export async function resolveAuthorizedAsset(
  organizationId: string,
  assetId:        unknown,
  allowedSiteIds: readonly string[],
): Promise<AuthorizedAsset | null> {
  if (typeof assetId !== "string" || assetId.length === 0 || assetId.length > MAX_ASSET_ID_LENGTH) return null;
  const sites = Array.from(new Set(allowedSiteIds.filter((s) => typeof s === "string" && s.length > 0)));
  if (!organizationId || sites.length === 0) return null;
  const db = await getPrisma();
  if (!db) return null;
  try {
    type AssetFind = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    const rows = await ((db as unknown as Record<string, unknown>).industrialAsset as AssetFind).findMany({
      where:  { id: assetId, organizationId, siteId: { in: sites }, site: { is: { organizationId, status: "ACTIVE" } } },
      select: { id: true, siteId: true, assetType: true },
      take:   1,
    });
    const row = rows[0];
    if (!row || typeof row.siteId !== "string" || !sites.includes(row.siteId)) return null;
    return {
      id: assetId, siteId: row.siteId, assetType: typeof row.assetType === "string" ? row.assetType : null,
    } as unknown as AuthorizedAsset;
  } catch (err) {
    logInfraFailure("database", "knowledge.resolve_authorized_asset", err);
    return null;
  }
}

export async function listRootCauses(
  organizationId: string,
  failureModeId?: string,
  limit           = 100,
): Promise<RootCauseRecord[]> {
  const db = await getPrisma();
  if (!db) return [];
  const m = (db as Record<string, unknown>).industrialRootCause as RCModel;
  try {
    const where: Record<string, unknown> = { organizationId };
    if (failureModeId) where.failureModeId = failureModeId;
    const rows = await m.findMany({ where, orderBy: { confidenceWeight: "desc" }, take: limit });
    return rows.map(_rowToRC);
  } catch { return []; }
}

export async function createRootCause(
  organizationId: string,
  input: {
    failureModeId:       string;
    description:         string;
    confidenceWeight?:   number;
    supportingEvidence?: string[];
    sourceType?:         string;
  },
): Promise<RootCauseRecord | null> {
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as Record<string, unknown>).industrialRootCause as RCModel;
  try {
    const row = await m.create({
      data: {
        organizationId,
        failureModeId:      input.failureModeId,
        description:        input.description,
        confidenceWeight:   Math.max(0, Math.min(1, input.confidenceWeight ?? 0.5)),
        supportingEvidence: input.supportingEvidence ?? [],
        sourceType:         input.sourceType ?? "MANUAL",
      },
    });
    return _rowToRC(row);
  } catch { return null; }
}

/**
 * Deterministic root cause candidates for an asset.
 *
 * Inputs consumed from Phase 39 (read-only):
 *   degradationClass — from FailureIndicator (DEGRADING/RAPIDLY_DEGRADING triggers bonus)
 *   failureProbability — from FailureIndicator (MEDIUM/HIGH triggers bonus)
 *
 * Alarm count check uses TelemetryRecord.quality IN (BAD, STALE) for last 7 days.
 */
export async function getRootCauseCandidates(
  organizationId: string,
  asset:          AuthorizedAsset,
  opts:           { failureModeId?: string } = {},
): Promise<RootCauseCandidate[]> {
  const assetId   = asset.id;
  const assetType = asset.assetType ?? undefined;
  const db = await getPrisma();
  if (!db) return [];
  const d = db as unknown as Record<string, unknown>;

  try {
    // Read Phase 39 FailureIndicator (most recent)
    type FIModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };
    const fiRow = await (d.failureIndicator as unknown as FIModel).findFirst({
      where: { organizationId, assetId }, orderBy: { createdAt: "desc" },
    });
    const degradationClass    = (fiRow?.degradationClass as string) ?? "STABLE";
    const failureProbability  = (fiRow?.probability       as string) ?? "LOW";
    const isDeclining         = degradationClass === "DEGRADING" || degradationClass === "RAPIDLY_DEGRADING";
    const hasHighProbability  = failureProbability === "MEDIUM"  || failureProbability === "HIGH";

    // Count BAD/STALE telemetry in last 7 days
    const since7d = new Date(Date.now() - 7 * 86400_000);
    type TelCountModel = { count: (a: unknown) => Promise<number> };
    const alarmCount = await (d.telemetryRecord as unknown as TelCountModel).count({
      where: {
        organizationId, assetId,
        quality:    { in: ["BAD", "STALE"] },
        receivedAt: { gte: since7d },
      },
    }).catch(() => 0);
    const highAlarms = alarmCount > 5;

    // Load all failure modes + their root causes
    type FMModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    type RCModel2 = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    const [fmRows, rcRows] = await Promise.all([
      // When a failure mode is named (the failure-detail route), only ITS root causes are candidates.
      (d.industrialFailureMode as FMModel).findMany({
        where: { organizationId, ...(opts.failureModeId ? { id: opts.failureModeId } : {}) }, orderBy: { id: "asc" }, take: 100,
      }),
      (d.industrialRootCause as RCModel2).findMany({
        where: { organizationId, ...(opts.failureModeId ? { failureModeId: opts.failureModeId } : {}) }, orderBy: { id: "asc" }, take: 500,
      }),
    ]);

    const fmMap = new Map<string, FailureModeRecord>();
    for (const r of fmRows) {
      const fm = _rowToFM(r);
      fmMap.set(fm.id, fm);
    }

    const candidates: RootCauseCandidate[] = [];

    for (const r of rcRows) {
      const rc = _rowToRC(r);
      const fm = fmMap.get(rc.failureModeId);
      if (!fm) continue;

      // Only include if assetType matches or FM has no assetType restriction
      const assetTypeMatch = assetType
        ? fm.assetTypes.length === 0 || fm.assetTypes.includes(assetType)
        : true;
      if (!assetType && fm.assetTypes.length > 0) continue; // skip asset-specific FMs when no type given
      if (!assetTypeMatch) continue;

      // Score this candidate
      let score = rc.confidenceWeight;
      const factors: string[] = [`base confidence: ${rc.confidenceWeight.toFixed(2)}`];

      if (isDeclining) {
        score += RC_BONUS_DECLINING_HEALTH;
        factors.push(`+${RC_BONUS_DECLINING_HEALTH} health declining (${degradationClass})`);
      }
      if (highAlarms) {
        score += RC_BONUS_HIGH_ALARMS;
        factors.push(`+${RC_BONUS_HIGH_ALARMS} high alarm count (${alarmCount} in 7d)`);
      }
      if (hasHighProbability) {
        score += RC_BONUS_FAILURE_INDICATOR;
        factors.push(`+${RC_BONUS_FAILURE_INDICATOR} failure indicator ${failureProbability}`);
      }
      if (assetType && fm.assetTypes.includes(assetType)) {
        score += RC_BONUS_ASSET_TYPE_MATCH;
        factors.push(`+${RC_BONUS_ASSET_TYPE_MATCH} asset type match (${assetType})`);
      }

      score = Math.min(1.0, score);

      const evidence: KnowledgeEvidence[] = [
        { type: "failureMode", recordId: fm.id, assetId, description: `Failure mode: ${fm.name}`, sourceType: fm.sourceType },
        ...(fiRow ? [{ type: "predictive" as const, recordId: fiRow.id as string, assetId, description: `FailureIndicator: ${failureProbability} probability, ${degradationClass}` }] : []),
      ];

      candidates.push({
        rootCause:      rc,
        failureMode:    fm,
        candidateScore: score,
        confidence:     confidenceFromWeight(score),
        scoringFactors: factors,
        evidence,
      });
    }

    // Sort: candidateScore DESC → severity DESC → id ASC
    candidates.sort((a, b) => {
      if (b.candidateScore !== a.candidateScore) return b.candidateScore - a.candidateScore;
      const sA = SEVERITY_ORDER[a.failureMode.severity] ?? 0;
      const sB = SEVERITY_ORDER[b.failureMode.severity] ?? 0;
      if (sB !== sA) return sB - sA;
      return a.rootCause.id.localeCompare(b.rootCause.id);
    });

    return candidates.slice(0, 20);
  } catch { return []; }
}
