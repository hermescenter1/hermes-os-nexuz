// PHASE 101-R — the runtime bridge contract.
//
// These tests are the reason the bridge can be trusted to be more than a
// wrapper. Each one states a property a reviewer would otherwise have to take
// on faith: that the surface reads the sealed corpus rather than a copy, that
// an unexposed scenario is unreachable and indistinguishable from a missing
// one, that the benchmark answer key never escapes, that evidence stays split
// into supporting / contradicting / missing, and that nothing the engine emits
// can be mistaken for a control action.

import { describe, it, expect } from "vitest";

import { CORPUS, corpusStats } from "../../corpus";
import { DIAGNOSTIC_ENGINE_VERSION } from "../../diagnostics";
import { localized, NEVER_EXECUTABLE_KINDS, type ReferenceSystem } from "../../types";
import {
  allScenarioIds,
  isPubliclyExposed,
  isWellFormedCaseId,
  MAX_CASE_ID_LENGTH,
  PUBLIC_SCENARIO_IDS,
  privateScenarioForTest,
  privateScenarioIds,
  resolvePublicScenario,
  assertExposureIntegrity,
} from "../exposure";
import { parseCaseQuery } from "../case-query";
import {
  bridgeFingerprint,
  corpusTextLocaleFor,
  defaultPublicCaseId,
  isCorpusTextForeign,
  listPublicReferenceCases,
  MAX_HYPOTHESES,
  runPublicReferenceDiagnosis,
  type BridgeLocale,
} from "../bridge";

const nodeById = new Map(CORPUS.flatMap((s: ReferenceSystem) => s.nodes.map((n) => [n.id, n])));

function okOutcome(caseId: string, locale: BridgeLocale = "en") {
  const outcome = runPublicReferenceDiagnosis({ caseParam: caseId, locale });
  if (outcome.status !== "OK") {
    throw new Error(`expected OK for ${caseId}, got ${outcome.status}`);
  }
  return outcome;
}

/* ── 1. Corpus → runtime parity ───────────────────────────────────────────── */

describe("corpus-to-runtime parity", () => {
  it("every public case id exists in the sealed corpus", () => {
    expect(() => assertExposureIntegrity()).not.toThrow();
    for (const id of PUBLIC_SCENARIO_IDS) {
      expect(resolvePublicScenario(id), id).not.toBeNull();
    }
  });

  it("catalogue text is the corpus text, not a restatement of it", () => {
    for (const locale of ["en", "fa"] as const) {
      for (const entry of listPublicReferenceCases(locale)) {
        const resolved = resolvePublicScenario(entry.caseId)!;
        expect(entry.title).toBe(localized(resolved.scenario.title, locale));
        expect(entry.narrative).toBe(localized(resolved.scenario.narrative, locale));
        expect(entry.system.checksum).toBe(resolved.system.checksum);
        expect(entry.observationCount).toBe(resolved.scenario.observations.length);
      }
    }
  });

  it("the fingerprint is DERIVED from the corpus, never pinned", () => {
    const stats = corpusStats();
    const fingerprint = bridgeFingerprint();
    expect(fingerprint.systems).toBe(stats.systems);
    expect(fingerprint.nodes).toBe(stats.nodes);
    expect(fingerprint.edges).toBe(stats.edges);
    expect(fingerprint.scenarios).toBe(stats.scenarios);
    expect(fingerprint.artifacts).toBe(stats.artifacts);
    expect(fingerprint.publicCases).toBe(PUBLIC_SCENARIO_IDS.length);
    expect(fingerprint.engineVersion).toBe(DIAGNOSTIC_ENGINE_VERSION);
    expect(fingerprint.corpusChecksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the corpus is genuinely larger than what is published", () => {
    // The public surface must be a curated SUBSET. If these ever became equal,
    // the allowlist would have stopped being an exposure decision.
    expect(allScenarioIds().length).toBeGreaterThan(PUBLIC_SCENARIO_IDS.length);
  });
});

/* ── 2. Fail-closed schema / registry ─────────────────────────────────────── */

describe("fail-closed input handling", () => {
  // MAX_CASE_ID_LENGTH is the longest PUBLISHED id (14), so a fixture must
  // stay under it to exercise the grammar rather than the length. Each row
  // therefore isolates exactly one refusal class.
  //
  // The invisible characters are built with String.fromCharCode rather than
  // written as escapes, so what this table asserts stays legible in review
  // and no editor can normalise a NUL or a zero-width joiner out of it.
  it.each([
    ["empty", "", "EMPTY"],
    ["whitespace only", "   ", "EMPTY"],
    ["leading tab", `${String.fromCharCode(9)}TIA-01`, "MALFORMED"],
    ["NUL control character", `TIA-01${String.fromCharCode(0)}`, "MALFORMED"],
    ["newline", `TIA-01${String.fromCharCode(10)}`, "MALFORMED"],
    ["zero-width joiner", `TIA-01${String.fromCharCode(0x200d)}`, "MALFORMED"],
    ["non-breaking space", `TIA${String.fromCharCode(0xa0)}01`, "MALFORMED"],
    ["Persian digits", `TIA-${String.fromCharCode(0x06f0, 0x06f1)}`, "MALFORMED"],
    ["lower case", "tia-01-fs-01", "MALFORMED"],
    ["path traversal", "../../etc", "MALFORMED"],
    ["separator", "TIA-01/SC", "MALFORMED"],
    ["over length", "A".repeat(MAX_CASE_ID_LENGTH + 1), "TOO_LONG"],
    ["far over length", "A".repeat(100_000), "TOO_LONG"],
    ["well-formed but unknown", "TIA-99", "NOT_PUBLIC"],
  ])("rejects a %s case id", (_label, caseParam, reason) => {
    const parsed = parseCaseQuery(caseParam);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe(reason);
    // Whatever the reason, the SURFACE says only one thing.
    expect(runPublicReferenceDiagnosis({ caseParam, locale: "en" }).status).toBe("NOT_AVAILABLE");
  });

  it("refuses a REPEATED parameter instead of silently picking one", () => {
    const both = [PUBLIC_SCENARIO_IDS[0], PUBLIC_SCENARIO_IDS[1]];
    const parsed = parseCaseQuery(both);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("REPEATED");
    expect(runPublicReferenceDiagnosis({ caseParam: both, locale: "en" }).status).toBe(
      "NOT_AVAILABLE",
    );
    // Even an array of ONE is refused: ?case=X and ?case=X&case=X are different
    // requests, and only the first is a question this surface answers.
    expect(parseCaseQuery([PUBLIC_SCENARIO_IDS[0]]).ok).toBe(false);
  });

  it("treats an ABSENT parameter as a visitor who has not chosen, not a rejection", () => {
    for (const absent of [undefined, null] as const) {
      const outcome = runPublicReferenceDiagnosis({ caseParam: absent, locale: "en" });
      expect(outcome.status).toBe("OK");
      if (outcome.status === "OK") expect(outcome.case.caseId).toBe(defaultPublicCaseId());
    }
  });

  it("accepts every published id and refuses every unpublished one", () => {
    for (const id of PUBLIC_SCENARIO_IDS) {
      const parsed = parseCaseQuery(id);
      expect(parsed.ok, id).toBe(true);
      if (parsed.ok) expect(parsed.caseId).toBe(id);
      expect(isWellFormedCaseId(id)).toBe(true);
    }
    for (const id of privateScenarioIds()) {
      const parsed = parseCaseQuery(id);
      expect(parsed.ok, id).toBe(false);
      if (!parsed.ok) expect(parsed.reason).toBe("NOT_PUBLIC");
    }
  });

  it("bounds the id length by the LONGEST PUBLISHED id, derived not pinned", () => {
    expect(MAX_CASE_ID_LENGTH).toBe(
      PUBLIC_SCENARIO_IDS.reduce((longest, id) => Math.max(longest, id.length), 0),
    );
    // A tight bound is the point: one character more than the longest real id
    // can never be a published case, so it is refused without a lookup.
    expect(parseCaseQuery("A".repeat(MAX_CASE_ID_LENGTH + 1)).ok).toBe(false);
  });

  it("clamps the hypothesis bound instead of trusting it", () => {
    const caseId = defaultPublicCaseId();
    for (const requested of [0, -5, 1000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bounded = runPublicReferenceDiagnosis({
        caseParam: caseId,
        locale: "en",
        maxHypotheses: requested,
      });
      expect(bounded.status).toBe("OK");
      if (bounded.status !== "OK") return;
      expect(bounded.diagnosis.hypotheses.length).toBeGreaterThan(0);
      expect(bounded.diagnosis.hypotheses.length).toBeLessThanOrEqual(MAX_HYPOTHESES);
    }
  });
});

/* ── 3. Public / private isolation ────────────────────────────────────────── */

describe("public exposure isolation", () => {
  // PRIVATE is DERIVED as a set difference. No private id is ever transcribed
  // into this file: a copied id would outlive the scenario it names, and a
  // copied line of engineering text would itself be the leak under test.
  const privateIds = privateScenarioIds();

  it("the private set is exactly ALL minus PUBLIC", () => {
    const all = allScenarioIds();
    expect(privateIds).toEqual(all.filter((id) => !PUBLIC_SCENARIO_IDS.includes(id)));
    expect(privateIds.length).toBe(all.length - PUBLIC_SCENARIO_IDS.length);
    expect(privateIds.length).toBeGreaterThan(0);
    for (const id of privateIds) expect(isPubliclyExposed(id)).toBe(false);
  });

  it("publishes exactly seven curated scenarios, all of them real", () => {
    expect(PUBLIC_SCENARIO_IDS.length).toBe(7);
    expect(new Set(PUBLIC_SCENARIO_IDS).size).toBe(7);
    const all = new Set(allScenarioIds());
    for (const id of PUBLIC_SCENARIO_IDS) expect(all.has(id), id).toBe(true);
  });

  it("never RESOLVES an unpublished scenario on a request path", () => {
    // Not "resolves it and then refuses" — the published index is the only map
    // a request consults, so the lookup itself IS the authorization decision.
    for (const id of privateIds) {
      expect(resolvePublicScenario(id), id).toBeNull();
    }
    // …while the scenario demonstrably DOES exist in the corpus, which is what
    // makes the null above a policy decision rather than an empty corpus.
    expect(privateScenarioForTest(privateIds[0])).not.toBeNull();
  });

  it("gives an unpublished id and an invented id the SAME outcome", () => {
    const invented = "ZZZZ99";
    expect(privateScenarioForTest(invented)).toBeNull();
    const inventedOutcome = runPublicReferenceDiagnosis({ caseParam: invented, locale: "en" });
    for (const id of privateIds) {
      expect(runPublicReferenceDiagnosis({ caseParam: id, locale: "en" }), id).toEqual(
        inventedOutcome,
      );
    }
    // …and a malformed value lands in that same state, so nothing about the
    // corpus can be read off the response.
    expect(runPublicReferenceDiagnosis({ caseParam: "\u0000", locale: "en" })).toEqual(
      inventedOutcome,
    );
  });

  it("publishes no private id and no private prose in any outcome", () => {
    const secrets = privateIds.flatMap((id) => {
      const resolved = privateScenarioForTest(id)!;
      return [
        id,
        localized(resolved.scenario.title, "en"),
        localized(resolved.scenario.title, "fa"),
      ];
    });
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      for (const locale of ["en", "de", "fa"] as const) {
        const serialised = JSON.stringify(okOutcome(caseId, locale));
        for (const secret of secrets) {
          expect(serialised.includes(secret), `${caseId}/${locale} leaked ${secret}`).toBe(false);
        }
      }
    }
  });
});

/* ── 4. Determinism ───────────────────────────────────────────────────────── */

describe("deterministic retrieval", () => {
  it.each(PUBLIC_SCENARIO_IDS)("%s produces an identical result on every run", (caseId) => {
    const first = okOutcome(caseId);
    const second = okOutcome(caseId);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("hypothesis ordering is total, never insertion-dependent", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      for (let i = 1; i < diagnosis.hypotheses.length; i += 1) {
        const previous = diagnosis.hypotheses[i - 1];
        const current = diagnosis.hypotheses[i];
        const ordered =
          previous.score > current.score ||
          (previous.score === current.score && previous.confidence > current.confidence) ||
          (previous.score === current.score &&
            previous.confidence === current.confidence &&
            previous.faultModeId < current.faultModeId);
        expect(ordered, `${caseId}: ${previous.faultModeId} before ${current.faultModeId}`).toBe(
          true,
        );
      }
    }
  });
});

/* ── 5. Provenance completeness ───────────────────────────────────────────── */

describe("provenance completeness", () => {
  it("every citation resolves to a real corpus node and carries full provenance", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      const cited = [
        ...diagnosis.observedFacts,
        ...diagnosis.supportingEvidence,
        ...diagnosis.contradictoryEvidence,
        ...diagnosis.missingEvidence,
      ];
      expect(cited.length).toBeGreaterThan(0);
      for (const citation of cited) {
        expect(nodeById.has(citation.nodeId), `${caseId}: ${citation.nodeId}`).toBe(true);
        for (const field of ["projectId", "sourceId", "domain", "subsystem", "safetyClass"] as const) {
          expect(String(citation[field]).length, `${caseId}: ${citation.nodeId}.${field}`)
            .toBeGreaterThan(0);
        }
        expect(citation.label.length).toBeGreaterThan(0);
      }
      for (const id of diagnosis.citations) expect(nodeById.has(id), id).toBe(true);
      expect(diagnosis.unresolvedObservations).toEqual([]);
    }
  });
});

/* ── 6. Evidence / contradiction / missing separation ─────────────────────── */

describe("evidence separation", () => {
  it("the three evidence sets are disjoint inside every hypothesis", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      for (const hypothesis of diagnosis.hypotheses) {
        const supporting = new Set(hypothesis.supporting.map((c) => c.nodeId));
        const contradicting = new Set(hypothesis.contradicting.map((c) => c.nodeId));
        const missing = new Set(hypothesis.missing.map((c) => c.nodeId));
        for (const id of supporting) {
          expect(contradicting.has(id), `${hypothesis.faultModeId}: ${id}`).toBe(false);
          expect(missing.has(id), `${hypothesis.faultModeId}: ${id}`).toBe(false);
        }
        for (const id of contradicting) expect(missing.has(id)).toBe(false);
      }
    }
  });

  it("missing evidence is never presented as observed", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      const observedWithState = new Map(
        diagnosis.observedFacts.filter((f) => f.state && f.state !== "ABSENT").map((f) => [f.nodeId, f]),
      );
      for (const hypothesis of diagnosis.hypotheses) {
        for (const citation of hypothesis.missing) {
          expect(observedWithState.has(citation.nodeId), citation.nodeId).toBe(false);
          // A missing citation either carries no state at all, or the explicit
          // ABSENT state. It may never borrow a value it was not given.
          expect(citation.state === undefined || citation.state === "ABSENT").toBe(true);
        }
      }
    }
  });

  it("the curated set actually demonstrates contradicting evidence", () => {
    // A demonstration in which nothing ever argues AGAINST a hypothesis would
    // let the contradiction channel be dropped entirely without any test
    // noticing, and would misrepresent the engine as never being challenged.
    const total = PUBLIC_SCENARIO_IDS.reduce((sum, caseId) => {
      const { diagnosis } = okOutcome(caseId);
      return sum + diagnosis.hypotheses.reduce((n, h) => n + h.contradicting.length, 0);
    }, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("supporting evidence is always evidence that was actually supplied", () => {
    // The failure this forbids is silent promotion: an unanswered question
    // reclassified as an answer, which would make a hypothesis look confirmed
    // by observations nobody ever made.
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      const supplied = new Map(diagnosis.observedFacts.map((f) => [f.nodeId, f.state]));
      for (const hypothesis of diagnosis.hypotheses) {
        for (const citation of hypothesis.supporting) {
          expect(citation.state, `${hypothesis.faultModeId}: ${citation.nodeId}`).toBeDefined();
          expect(citation.state).not.toBe("ABSENT");
          expect(supplied.get(citation.nodeId)).toBe(citation.state);
        }
      }
    }
  });

  it("confidence never exceeds the declared-evidence coverage it is derived from", () => {
    // `confidence` is defined as (supporting - contradicting) / declared, and
    // `declared` is exactly the three evidence sets together. Any value above
    // that ceiling is a number the evidence does not support.
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      for (const hypothesis of diagnosis.hypotheses) {
        const declared =
          hypothesis.supporting.length + hypothesis.contradicting.length + hypothesis.missing.length;
        if (declared === 0) {
          expect(hypothesis.confidence, hypothesis.faultModeId).toBe(0);
          continue;
        }
        const ceiling = (hypothesis.supporting.length - hypothesis.contradicting.length) / declared;
        expect(hypothesis.confidence, hypothesis.faultModeId).toBeCloseTo(
          Math.min(Math.max(ceiling, 0), 1),
          10,
        );
      }
    }
  });

  it("confidence is bounded and never invented for an unevidenced hypothesis", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      expect(diagnosis.confidence).toBe(diagnosis.hypotheses[0]?.confidence ?? 0);
      for (const hypothesis of diagnosis.hypotheses) {
        expect(hypothesis.confidence).toBeGreaterThanOrEqual(0);
        expect(hypothesis.confidence).toBeLessThanOrEqual(1);
        if (hypothesis.supporting.length === 0) expect(hypothesis.confidence).toBe(0);
      }
    }
  });
});

/* ── 7. No control action, no answer-key leakage ──────────────────────────── */

describe("safety posture", () => {
  it("never exposes the benchmark ground truth", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const serialised = JSON.stringify(okOutcome(caseId));
      for (const forbidden of [
        "groundTruth",
        "expectedMissingNodeIds",
        "expectedSafeActionIds",
        "supportingNodeIds",
        "requiresEscalation",
      ]) {
        expect(serialised.includes(forbidden), `${caseId} leaked ${forbidden}`).toBe(false);
      }
    }
  });

  it("emits no command, write or acknowledgement vocabulary", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const outcome = okOutcome(caseId);
      const keys = new Set<string>();
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) return void value.forEach(walk);
        if (value && typeof value === "object") {
          for (const [k, v] of Object.entries(value)) {
            keys.add(k);
            walk(v);
          }
        }
      };
      walk(outcome);
      for (const forbidden of ["command", "write", "acknowledge", "ack", "execute", "setpoint"]) {
        expect([...keys].some((k) => k.toLowerCase() === forbidden), `${caseId}: ${forbidden}`)
          .toBe(false);
      }
    }
  });

  it("every recommended action is a SAFE_ACTION node, never an executable object", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      for (const action of diagnosis.safeVerificationActions) {
        const node = nodeById.get(action.nodeId);
        expect(node, action.nodeId).toBeDefined();
        expect(node!.kind).toBe("SAFE_ACTION");
        expect(NEVER_EXECUTABLE_KINDS).toContain(node!.kind);
        expect(action.verifies.length).toBeGreaterThan(0);
      }
    }
  });

  it("raises the human-validation gate whenever a safety object is involved", () => {
    for (const caseId of PUBLIC_SCENARIO_IDS) {
      const { diagnosis } = okOutcome(caseId);
      const touchesSafety = diagnosis.hypotheses.some((h) => h.reviewOnly);
      if (touchesSafety) expect(diagnosis.escalationConditions.length).toBeGreaterThan(0);
    }
  });
});

/* ── 8. Locale behaviour ──────────────────────────────────────────────────── */

describe("locale handling", () => {
  it("serves Persian corpus text for fa and English for en", () => {
    expect(corpusTextLocaleFor("fa")).toBe("fa");
    expect(corpusTextLocaleFor("en")).toBe("en");
    const fa = okOutcome(defaultPublicCaseId(), "fa");
    const en = okOutcome(defaultPublicCaseId(), "en");
    expect(fa.case.title).not.toBe(en.case.title);
    expect(fa.case.narrative).not.toBe(en.case.narrative);
    expect(fa.case.corpusTextLocale).toBe("fa");
  });

  it("declares — rather than hides — that German falls back to English", () => {
    const de = okOutcome(defaultPublicCaseId(), "de");
    const en = okOutcome(defaultPublicCaseId(), "en");
    expect(de.case.corpusTextLocale).toBe("en");
    expect(de.case.title).toBe(en.case.title);
    expect(isCorpusTextForeign("de")).toBe(true);
    expect(isCorpusTextForeign("en")).toBe(false);
    expect(isCorpusTextForeign("fa")).toBe(false);
  });
});
