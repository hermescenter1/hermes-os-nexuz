// PHASE 101-R — the product surface that actually RUNS the Phase 101 engine.
//
// WHY THIS IS A SERVER COMPONENT WITH A PLAIN GET FORM
// The reasoning is pure, deterministic and needs no browser state, so there is
// nothing for a client bundle to do. Rendering on the server and selecting a
// case with an ordinary `<form method="get">` means the panel works with
// JavaScript disabled, is fully present in the initial HTML for a screen reader
// and for a crawler, and has no fetch/`response.json()` path that could
// misreport a failure as data.
//
// NOTHING HERE RESTATES THE CORPUS
// Every engineering string on this page — case title, operator narrative,
// object labels, safe-action guidance, provenance — is read from the sealed
// registry through `@/lib/industrial-knowledge/runtime/bridge` at render time.
// The translation catalogue holds only chrome: headings, column names and the
// state vocabulary. That split is what the copied-corpus contract test enforces.
//
// SAFETY PRESENTATION
// Safe actions are shown as verification steps for a qualified person, never as
// controls. There is no button, link or form on this panel that could acknowledge
// an alarm, write a tag or reach a device, and the human-validation gate is
// rendered before the actions rather than after them.

import { getTranslations } from "next-intl/server";

import {
  bridgeFingerprint,
  defaultPublicCaseId,
  listPublicReferenceCases,
  runPublicReferenceDiagnosis,
  isCorpusTextForeign,
  type BridgeLocale,
  type EvidenceCitation,
  type Hypothesis,
  type ReferenceCaseSummary,
} from "@/lib/industrial-knowledge/runtime/bridge";

/** The query parameter that selects a case. */
export const CASE_QUERY_PARAM = "case";

/**
 * Industrial identifiers are Latin-script, direction-sensitive strings — node
 * ids, source references, checksums, platform names, enum tokens. Inside a
 * Persian (RTL) paragraph a bare `DB1210.DBX4.0` reorders visually and stops
 * being the identifier an engineer can match against their project, so every
 * one of them is emitted through this element with an explicit `dir="ltr"`.
 */
function Identifier({ children, className }: { children: React.ReactNode; className?: string }) {
  // `break-all` is not cosmetic. A corpus node id such as
  // `TIA-01:FAULT_MODE:FM_HYDRAULIC_PERMISSIVE_NOT_MET` is one unbreakable
  // token; at 320 px it overruns its column and the surrounding card clips it,
  // so the engineer reads a truncated identifier and cannot match it against
  // their project. Breaking mid-token keeps the whole string on screen.
  return (
    <span dir="ltr" className={`font-mono break-all ${className ?? ""}`}>
      {children}
    </span>
  );
}

/** Section shell: a labelled region with a consistent heading rhythm. */
function Block({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-white/8 bg-white/2 p-4">
      <h3 id={id} className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-400 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * One cited engineering object.
 *
 * The observed state is carried by the WORD, not by the colour: the colour is
 * an additional cue for sighted users and removing it would lose nothing a
 * reader depends on. A citation without a state is a declared piece of evidence
 * that was never supplied, and says so through the caller heading.
 */
function Citation({ citation, stateLabel }: { citation: EvidenceCitation; stateLabel?: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[12px] text-slate-200">{citation.label}</span>
      <Identifier className="text-[10px] text-slate-500">{citation.nodeId}</Identifier>
      {stateLabel ? (
        <span className="text-[10px] font-semibold text-slate-300 rounded px-1.5 py-0.5 border border-white/10">
          {stateLabel}
        </span>
      ) : null}
      <Identifier className="text-[10px] text-slate-600">
        {citation.domain} · {citation.sourceId}
      </Identifier>
    </li>
  );
}

function CitationList({
  citations,
  emptyLabel,
  stateLabels,
}: {
  citations: EvidenceCitation[];
  emptyLabel: string;
  stateLabels: Record<string, string>;
}) {
  if (citations.length === 0) {
    return <p className="text-[11px] text-slate-500">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-0">
      {citations.map((citation) => (
        <Citation
          key={citation.nodeId}
          citation={citation}
          stateLabel={citation.state ? stateLabels[citation.state] : undefined}
        />
      ))}
    </ul>
  );
}

interface PanelProps {
  locale: BridgeLocale;
  /**
   * The RAW `?case=` value straight off `searchParams` — a string, an array
   * when the parameter was repeated, or absent. Passed through untouched: the
   * bridge owns the bound, and a component that pre-trimmed or pre-indexed it
   * would be making an authorization-shaped decision outside the one place
   * that is tested for it.
   */
  caseParam?: string | string[];
}

export async function ReferenceDiagnosticPanel({ locale, caseParam }: PanelProps) {
  const t = await getTranslations("industrialBrain.reference");

  const cases = listPublicReferenceCases(locale);
  const outcome = runPublicReferenceDiagnosis({ caseParam, locale });

  const stateLabels: Record<string, string> = {
    TRUE: t("state.TRUE"),
    FALSE: t("state.FALSE"),
    NORMAL: t("state.NORMAL"),
    ABNORMAL: t("state.ABNORMAL"),
    STALE: t("state.STALE"),
    ABSENT: t("state.ABSENT"),
  };

  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });

  return (
    <section
      aria-labelledby="phase101-reference-heading"
      className="mt-8 rounded-2xl border border-white/8 overflow-hidden"
      style={{ background: "rgba(7,16,26,0.85)" }}
    >
      <div className="px-5 py-5 border-b border-white/6">
        <h2
          id="phase101-reference-heading"
          className="text-lg font-bold"
          style={{ color: "#E8F4FF" }}
        >
          {t("heading")}
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{t("lede")}</p>
      </div>

      {/* ── Sample disclosure. Stated in words, before any result. ────────── */}
      <div className="px-5 py-4 border-b border-white/6 bg-amber-500/5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 border border-amber-500/40 rounded px-2 py-0.5">
            {t("disclosure.badge")}
          </span>
          <span className="text-[12px] font-semibold text-amber-200">{t("disclosure.title")}</span>
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{t("disclosure.body")}</p>
      </div>

      {/* ── What this panel is, next to the analyser above it ─────────────
          Two capabilities share this page and they are NOT one engine. The
          workspace above takes a free-text fault report and runs the existing
          deterministic analyser; this panel replays a sealed reference case
          through the Phase 101 structural engine. Saying so here — rather than
          leaving a reader to infer it from two similar-looking cards — is the
          difference between a demonstration and a misleading one. */}
      <div className="px-5 py-4 border-b border-white/6">
        <p className="text-[11px] font-semibold text-slate-300">{t("relationship.heading")}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {t("relationship.body")}
        </p>
      </div>

      {/* ── Case selector. No JavaScript: an ordinary GET form. ───────────── */}
      <form method="get" className="px-5 py-4 border-b border-white/6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label
            htmlFor="phase101-case"
            className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1.5"
          >
            {t("selector.label")}
          </label>
          <select
            id="phase101-case"
            name={CASE_QUERY_PARAM}
            defaultValue={outcome.status === "OK" ? outcome.case.caseId : defaultPublicCaseId()}
            className="w-full min-h-[44px] rounded-lg border border-white/12 bg-[#04080F] px-3 text-[12px] text-slate-200"
          >
            {/* The option label is the localised case TITLE only. An `<option>`
                cannot carry a child element, so a Latin-script case id inside a
                Persian label would reorder with no way to pin its direction;
                the id is shown — with an explicit direction — in the result. */}
            {cases.map((entry: ReferenceCaseSummary) => (
              <option key={entry.caseId} value={entry.caseId}>
                {entry.title}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-[44px] rounded-lg px-5 text-[12px] font-mono font-semibold uppercase tracking-wider"
          style={{ background: "rgba(30,200,164,0.9)", color: "#04080F" }}
        >
          {t("selector.submit")}
        </button>
        <p className="w-full text-[10px] text-slate-600">{t("selector.hint")}</p>
      </form>

      {outcome.status !== "OK" ? (
        /* ONE fail-closed state, whatever the reason.
           An unknown id, an unpublished id, an oversized string and a repeated
           parameter all land here and render identically, so the response says
           nothing about which scenarios the corpus contains. The panel also
           never falls back to the default case behind the reader: silently
           answering a different question than the one asked is worse still. */
        <div role="status" className="px-5 py-6">
          <p className="text-[13px] font-semibold text-rose-300">{t("error.heading")}</p>
          <p className="mt-2 text-[12px] text-slate-400">{t("error.body")}</p>
        </div>
      ) : (
        <div className="px-5 py-5 space-y-4">
          {/* ── The case, with the provenance of the system it belongs to ─── */}
          <Block id="phase101-case-heading" title={t("case.heading")}>
            <p className="text-[13px] font-semibold text-slate-100">{outcome.case.title}</p>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-600">
              {t("case.narrative")}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
              {outcome.case.narrative}
            </p>
            {isCorpusTextForeign(locale) ? (
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500 border-s-2 border-white/10 ps-2">
                {t("case.textLocaleNotice")}
              </p>
            ) : null}
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {[
                [t("case.system"), `${outcome.case.system.id} — ${outcome.case.system.name}`],
                [t("case.platform"), outcome.case.system.platform],
                [
                  t("case.version"),
                  `${outcome.case.system.version} · r${outcome.case.system.revision}`,
                ],
                [t("case.checksum"), outcome.case.system.checksum.slice(0, 16)],
                [t("case.observations"), String(outcome.case.observationCount)],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-baseline gap-2">
                  <dt className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
                    {label}
                  </dt>
                  <dd className="text-[11px] text-slate-300">
                    <Identifier>{value}</Identifier>
                  </dd>
                </div>
              ))}
            </dl>
          </Block>

          {/* ── What was actually observed ─────────────────────────────────── */}
          <Block id="phase101-observed-heading" title={t("observed.heading")}>
            {outcome.diagnosis.observedFacts.length === 0 ? (
              <p className="text-[11px] text-slate-500">{t("observed.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      {[
                        t("observed.columnNode"),
                        t("observed.columnState"),
                        t("observed.columnLayer"),
                        t("observed.columnSource"),
                      ].map((heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="py-2 pe-4 text-start text-[10px] font-mono uppercase tracking-wider text-slate-600 whitespace-nowrap"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.diagnosis.observedFacts.map((fact) => (
                      <tr key={fact.nodeId} className="border-b border-white/5 last:border-0">
                        <td className="py-2 pe-4 text-[12px] text-slate-200">
                          {fact.label}
                          <Identifier className="block text-[10px] text-slate-600">
                            {fact.nodeId}
                          </Identifier>
                        </td>
                        <td className="py-2 pe-4 text-[11px] font-semibold text-slate-300 whitespace-nowrap">
                          {fact.state ? stateLabels[fact.state] : "—"}
                        </td>
                        <td className="py-2 pe-4 text-[11px] text-slate-400">
                          <Identifier>{fact.domain}</Identifier>
                        </td>
                        <td className="py-2 text-[11px] text-slate-500">
                          <Identifier>{fact.sourceId}</Identifier>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Block>

          {/* ── Ranked hypotheses, each with its evidence split ────────────── */}
          <Block id="phase101-hypotheses-heading" title={t("hypotheses.heading")}>
            {outcome.diagnosis.hypotheses.length === 0 ? (
              <p className="text-[11px] text-slate-500">{t("hypotheses.empty")}</p>
            ) : (
              <ol className="space-y-3">
                {outcome.diagnosis.hypotheses.map((hypothesis: Hypothesis, position: number) => (
                  <li
                    key={hypothesis.faultModeId}
                    className="rounded-lg border border-white/8 bg-black/20 p-3"
                  >
                    <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
                      {t("hypotheses.rank", { rank: position + 1 })}
                    </p>
                    <h4 className="mt-1 text-[13px] font-semibold text-slate-100">
                      {hypothesis.label}
                    </h4>
                    <Identifier className="block text-[10px] text-slate-600">
                      {hypothesis.faultModeId}
                    </Identifier>

                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                      {[
                        [t("hypotheses.confidence"), percent.format(hypothesis.confidence)],
                        [t("hypotheses.score"), String(hypothesis.score)],
                        [t("hypotheses.faultClass"), hypothesis.faultClass],
                        [t("hypotheses.subsystem"), hypothesis.subsystem],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-baseline gap-1.5">
                          <dt className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
                            {label}
                          </dt>
                          <dd className="text-[11px] font-semibold text-slate-300">
                            <Identifier>{value}</Identifier>
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {hypothesis.reviewOnly ? (
                      <p className="mt-2 text-[10px] font-semibold text-amber-300 border border-amber-500/30 rounded px-2 py-1 inline-block">
                        {t("hypotheses.reviewOnly")}
                      </p>
                    ) : null}

                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 mb-1">
                          {t("evidence.supporting")}
                        </p>
                        <CitationList
                          citations={hypothesis.supporting}
                          emptyLabel={t("evidence.noneSupporting")}
                          stateLabels={stateLabels}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-1">
                          {t("evidence.contradicting")}
                        </p>
                        <CitationList
                          citations={hypothesis.contradicting}
                          emptyLabel={t("evidence.noneContradicting")}
                          stateLabels={stateLabels}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                          {t("evidence.missing")}
                        </p>
                        <CitationList
                          citations={hypothesis.missing}
                          emptyLabel={t("evidence.noneMissing")}
                          stateLabels={stateLabels}
                        />
                      </div>
                    </div>

                    {hypothesis.chains.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600 mb-1">
                          {t("hypotheses.chain")}
                        </p>
                        <ul className="space-y-0.5">
                          {hypothesis.chains.map((chain) => (
                            <li key={chain.nodeId} className="text-[10px] text-slate-500">
                              <Identifier>
                                {chain.nodeId} → {chain.edgeIds.join(" → ")}
                              </Identifier>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Block>

          {/* ── The human gate, deliberately BEFORE the actions ────────────── */}
          <Block id="phase101-validation-heading" title={t("validation.heading")}>
            <p className="text-[12px] leading-relaxed text-amber-200">{t("validation.body")}</p>
            {outcome.diagnosis.escalationConditions.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">{t("validation.none")}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {outcome.diagnosis.escalationConditions.map((condition) => (
                  <li key={condition} className="flex gap-2 text-[11px] text-slate-400">
                    <span aria-hidden="true" className="text-amber-500 shrink-0">
                      ▸
                    </span>
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {/* ── Advisory verification steps. Never controls. ───────────────── */}
          <Block id="phase101-actions-heading" title={t("actions.heading")}>
            <p className="text-[11px] text-slate-500 mb-2">{t("actions.lede")}</p>
            {outcome.diagnosis.safeVerificationActions.length === 0 ? (
              <p className="text-[11px] text-slate-500">{t("actions.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {outcome.diagnosis.safeVerificationActions.map((action) => (
                  <li
                    key={action.nodeId}
                    className="rounded-lg border border-white/8 bg-black/20 p-3"
                  >
                    <p className="text-[12px] text-slate-200">{action.label}</p>
                    <Identifier className="block text-[10px] text-slate-600">
                      {action.nodeId}
                    </Identifier>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {t("actions.verifies")}:{" "}
                      <Identifier>{action.verifies.join(", ")}</Identifier>
                    </p>
                    {action.reviewOnly ? (
                      <p className="mt-1 text-[10px] font-semibold text-amber-300">
                        {t("actions.reviewOnly")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {/* ── Provenance of the knowledge and the engine ─────────────────── */}
          <Block id="phase101-provenance-heading" title={t("provenance.heading")}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {[
                [t("provenance.engine"), outcome.fingerprint.engineVersion],
                [t("provenance.corpus"), outcome.fingerprint.corpusChecksum.slice(0, 16)],
                [t("provenance.citations"), String(outcome.diagnosis.citations.length)],
                [
                  t("provenance.systems"),
                  `${outcome.fingerprint.systems} / ${outcome.fingerprint.nodes} / ${outcome.fingerprint.edges}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-baseline gap-2">
                  <dt className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
                    {label}
                  </dt>
                  <dd className="text-[11px] text-slate-300">
                    <Identifier>{value}</Identifier>
                  </dd>
                </div>
              ))}
            </dl>
          </Block>
        </div>
      )}
    </section>
  );
}

/** Re-exported so a route can prove it renders the same corpus it cites. */
export { bridgeFingerprint };
