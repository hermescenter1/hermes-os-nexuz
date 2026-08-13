// PHASE 101 — authoring helpers for the reference engineering corpus.
//
// These exist so a reference system reads like an engineering declaration
// instead of like a data structure. They add no semantics of their own: every
// helper is a thin, typed constructor whose only job is to keep node ids
// consistent (`<PROJECT>:<KIND>:<LOCAL>`, which sealing enforces) and to stop
// the same subsystem/domain/safety triple being retyped on every line.
//
// SAFETY NOTE
// `safe()` builds SAFE_ACTION nodes. Every one of them is an instruction for a
// qualified human being. None of them is, or can become, something this system
// executes — the corpus carries no connection, no address it can dial, and no
// write path. Actions that touch a safety function are authored with
// `SAFETY_RELATED`/`SAFETY_CRITICAL` so `isReviewOnly()` reports them as
// review-only wherever they surface.

import type {
  AuthoredEdge,
  AuthoredNode,
  EngineeringDomain,
  KnowledgeNodeKind,
  KnowledgeRelation,
  LocalizedText,
  NodeAttributes,
  SafetyClass,
} from "../types";

export interface AuthoringContext {
  projectId: string;
  /** Default subsystem for nodes that do not name their own. */
  subsystem: string;
  /** Default engineering domain. */
  domain: EngineeringDomain;
  /** Default safety class. */
  safetyClass?: SafetyClass;
}

export interface NodeOptions {
  subsystem?: string;
  domain?: EngineeringDomain;
  safetyClass?: SafetyClass;
  /** Identifier inside the source artefact. Defaults to the local id. */
  sourceId?: string;
  attributes?: NodeAttributes;
  description?: LocalizedText;
}

export interface Authoring {
  /** Canonical corpus id for a local name. */
  id(kind: KnowledgeNodeKind, local: string): string;
  node(
    kind: KnowledgeNodeKind,
    local: string,
    label: LocalizedText,
    options?: NodeOptions,
  ): AuthoredNode;
  edge(
    source: string,
    target: string,
    relation: KnowledgeRelation,
    note?: LocalizedText,
  ): AuthoredEdge;
}

/** Bilingual label shorthand. */
export function t(en: string, fa: string): LocalizedText {
  return { en, fa };
}

export function authoring(ctx: AuthoringContext): Authoring {
  const idOf = (kind: KnowledgeNodeKind, local: string) => `${ctx.projectId}:${kind}:${local}`;

  return {
    id: idOf,
    node(kind, local, label, options = {}) {
      return {
        id: idOf(kind, local),
        kind,
        label,
        ...(options.description ? { description: options.description } : {}),
        ...(options.attributes ? { attributes: options.attributes } : {}),
        provenance: {
          subsystem: options.subsystem ?? ctx.subsystem,
          sourceId: options.sourceId ?? local,
          domain: options.domain ?? ctx.domain,
          safetyClass: options.safetyClass ?? ctx.safetyClass ?? "NON_SAFETY",
        },
      };
    },
    edge(source, target, relation, note) {
      return { source, target, relation, ...(note ? { note } : {}) };
    },
  };
}

/**
 * Expand a linear sequence into `TRANSITIONS_TO` edges.
 *
 * Authoring the transitions by hand is where step-order mistakes hide; deriving
 * them from the declared step order makes an out-of-order sequence impossible
 * to express by accident.
 */
export function chainStates(a: Authoring, stateIds: readonly string[]): AuthoredEdge[] {
  const edges: AuthoredEdge[] = [];
  for (let i = 0; i < stateIds.length - 1; i += 1) {
    edges.push(a.edge(stateIds[i], stateIds[i + 1], "TRANSITIONS_TO"));
  }
  return edges;
}
