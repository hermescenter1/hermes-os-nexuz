// PHASE 104-E — Chapters 2-8 of the Observatory homepage (round 3).
//
// Round 2's defect: visual power lived in the hero; after the fold the page
// was text, hairlines, columns and lists. Round 3 keeps the eight-chapter
// architecture and gives EVERY chapter a real drawing of its own:
//
//   2 case      — an incident rail: waveform, evidence timeline, contradiction
//                 and missing-spectrum markers, ranked hypothesis, risk window,
//                 gate, result — plus a Glass evidence inspector (Glass #2)
//   3 planes    — four connected planes on one signal spine, each with input /
//                 process / output / limit cells
//   4 backbone  — a plant-to-platform system map in four tiers
//   5 core      — ONE intelligence drawing shared by Brain / Copilot / Ops
//   6 gate      — the validation gate as actor / evidence / state / block
//   7 editorial — an editorial spread with a cover geometry, issue mark and
//                 metadata line
//   8 close     — signal convergence into a gate, on a Glass elevated surface
//                 (Glass #3), with the ecosystem index folded in
//
// The semantic reasoning tokens (evidence / contradiction / missing /
// hypothesis / decision) appear ONLY where those meanings occur. Shared
// primitives (`SectionHeader`, `CapabilityGrid`, `TrustSection`, `PublicCta`)
// are neither used nor modified — `/platform` consumes them.
//
// Content integrity: every string is existing `publicSite` catalog copy. No
// metric, customer, logo, plant state or operational number is invented, and
// every depiction of the case is captioned illustrative.

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
import { buttonVariants } from "@/components/ds/logic";
import { PublicPageContainer } from "../PublicPageContainer";

/* ── chapter opening ─────────────────────────────────────────────────────── */
function ChapterMark({
  id, ordinal, title, lede, className,
}: { id: string; ordinal: string; title: string; lede?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p aria-hidden="true" className="hh-mono-label">{ordinal}</p>
      <h2 id={id} dir="auto" className="mt-3 max-w-3xl text-role-h2 font-bold tracking-tight text-text-primary">
        {title}
      </h2>
      {lede ? (
        <p dir="auto" className="mt-4 max-w-2xl text-body-lg text-text-secondary">{lede}</p>
      ) : null}
      <div aria-hidden="true" className="hh-rule mt-7 w-full" />
    </div>
  );
}

/* ═══ CHAPTER 2 — ONE INDUSTRIAL CASE, as an incident rail ═══════════════════
   Not a text spine. The rail carries drawn readings — an illustrative vibration
   waveform, an evidence timeline with contradiction and missing-spectrum
   markers, the ranked hypothesis, the risk window, the gate and the result —
   and beside it a Glass EVIDENCE INSPECTOR (Glass #2 of three). */
export function CaseChapter({
  id, title, lede, asset, status, steps, disclosure, signature, inspector,
}: {
  id: string;
  title: string;
  lede: string;
  asset: string;
  status: string;
  steps: readonly { key: string; state: string; label: string; body?: string }[];
  disclosure: string;
  /** Mobile-only: the full Observatory signature opens the case on phones. */
  signature: ReactNode;
  inspector: { title: string; rows: readonly { key: string; state: string; label: string }[]; hypTitle: string; hyps: readonly { label: string; meta: string }[] };
}) {
  return (
    <section aria-labelledby={id} className="hh-plate relative py-14 md:py-20" data-ticks="true">
      <div aria-hidden="true" className="hh-deepfield" data-tone="mid" />
      <PublicPageContainer className="relative">
        <ChapterMark id={id} ordinal="CH 02" title={title} lede={lede} />

        <div className="mt-8 md:hidden">{signature}</div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
          {/* ── the incident rail ── */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p dir="auto" className="font-mono text-label tracking-wide text-brand-primary">{asset}</p>
              <p dir="auto" className="hh-mono-label flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-reasoning-evidence)" }} />
                {status}
              </p>
            </div>

            {/* illustrative vibration mini-waveform: pure SVG, no data, no
                animation, captioned illustrative below. The rise at the end is
                the "+18% / 14d" the copy already states. */}
            <svg aria-hidden="true" viewBox="0 0 600 90" preserveAspectRatio="none" className="mt-4 h-20 w-full" role="presentation">
              <g className="hh-sig-dim" opacity="0.7">
                {[0, 1, 2, 3].map((i) => <line key={i} x1="0" y1={12 + i * 22} x2="600" y2={12 + i * 22} />)}
                {[0, 1, 2, 3, 4, 5, 6].map((i) => <line key={i} x1={i * 100} y1="0" x2={i * 100} y2="90" />)}
              </g>
              <polyline className="hh-sig-track" points="0,60 40,58 80,61 120,57 160,60 200,58 240,62 280,57 320,60 360,56 400,58 440,52 480,50 520,44 560,40 600,34" />
              <polyline className="hh-sig-scan" points="0,60 40,58 80,61 120,57 160,60 200,58 240,62 280,57 320,60 360,56 400,58 440,52 480,50 520,44 560,40 600,34" />
              {/* contradiction marker (oil analysis clean) and missing marker (FFT) */}
              <line className="hh-sig-contradiction" x1="300" y1="6" x2="300" y2="84" strokeWidth="1.5" />
              <line className="hh-sig-missing" x1="470" y1="6" x2="470" y2="84" strokeWidth="1.5" />
              <circle className="hh-sig-mark" cx="600" cy="34" r="3.5" />
            </svg>

            <ol className="hh-incident mt-6">
              {steps.map((step, i) => (
                <li key={step.key} className={cn("hh-incident-step min-w-0", i > 0 && "mt-5")} data-state={step.state}>
                  <p dir="auto" className={cn("text-body font-semibold", step.state === "decision" ? "text-brand-primary" : "text-text-primary")}>
                    {step.label}
                  </p>
                  {step.body ? (
                    <p dir="auto" className="mt-1 max-w-xl text-body-compact text-text-secondary">{step.body}</p>
                  ) : null}
                </li>
              ))}
            </ol>
            <p dir="auto" className="mt-6 text-caption text-text-muted">{disclosure}</p>
          </div>

          {/* ── Glass #2 — the evidence inspector ── */}
          <aside
            aria-label={inspector.title}
            className="ds-glass-elevated self-start rounded-lg p-5 md:p-6"
            data-hermes-signature="glass-elevated"
          >
            <p dir="auto" className="hh-mono-label">{inspector.title}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {inspector.rows.map((r) => (
                <li key={r.key} className="hh-instrument-readout min-w-0 py-0.5" data-state={r.state}>
                  <span dir="auto" className="block text-body-compact text-text-primary">{r.label}</span>
                </li>
              ))}
            </ul>
            <div aria-hidden="true" className="hh-rule my-5 w-full" />
            <p dir="auto" className="hh-mono-label">{inspector.hypTitle}</p>
            <ul className="mt-3 flex flex-col gap-3">
              {inspector.hyps.map((h, i) => (
                <li key={h.label} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span dir="auto" className="text-body-compact font-semibold text-text-primary">{h.label}</span>
                    <span dir="auto" className="font-mono text-caption text-text-secondary">{h.meta}</span>
                  </div>
                  {/* confidence bar — hypothesis token, length = rank */}
                  <div className="mt-1.5 h-1.5 w-full rounded-full" style={{ background: "var(--color-surface-primary)" }}>
                    <div className="h-full rounded-full" style={{ width: i === 0 ? "86%" : "41%", background: "var(--color-reasoning-hypothesis)", opacity: i === 0 ? 0.9 : 0.55 }} />
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </PublicPageContainer>
    </section>
  );
}

/* ═══ CHAPTER 3 — FOUR CONNECTED PLANES ═════════════════════════════════════
   Evidence / Reasoning / Model-assistance / Safety on one signal spine, each
   with INPUT → PROCESS → OUTPUT → CONSTRAINT cells. Not a table:
   the spine threads every plane and each plane's diamond node sits on it. */
export function PlanesChapter({
  id, title, lede, cellHeads, planes,
}: {
  id: string;
  title: string;
  lede: string;
  cellHeads: { input: string; process: string; output: string; constraint: string };
  planes: readonly { key: string; name: string; input: string; process: string; output: string; constraint: string }[];
}) {
  return (
    <section aria-labelledby={id} className="relative py-14 md:py-20">
      <PublicPageContainer>
        <ChapterMark id={id} ordinal="CH 03" title={title} lede={lede} />
        <div className="hh-planes mt-10">
          {planes.map((p, i) => (
            <div key={p.key} className="hh-plane min-w-0" data-depth={i + 1}>
              <h3 dir="auto" className="text-role-h4 font-semibold text-text-primary">{p.name}</h3>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(["input", "process", "output", "constraint"] as const).map((k) => (
                  <div key={k} className="hh-plane-cell min-w-0" data-kind={k}>
                    <dt className="hh-mono-label">{cellHeads[k]}</dt>
                    <dd dir="auto" className="mt-1.5 text-body-compact text-text-secondary">{p[k]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </PublicPageContainer>
    </section>
  );
}

/* ═══ CHAPTER 4 — THE ENGINEERING BACKBONE ══════════════════════════════════
   A four-tier plant-to-platform system map: plant floor → control &
   instrumentation → supervision & history → engineering models → Hermes
   reasoning. Family resemblance to the hero signature, not a copy. Scrolls
   inside its own container on small screens; the DOCUMENT never overflows. */
export function BackboneChapter({
  id, title, lede, tiers, links,
}: {
  id: string;
  title: string;
  lede: string;
  tiers: readonly { key: string; name: string; tags: readonly string[]; live?: boolean }[];
  links: readonly { key: string; name: string; desc: string; href: string; ctaLabel: string }[];
}) {
  return (
    <section aria-labelledby={id} className="hh-plate relative py-14 md:py-20" data-ticks="true">
      <PublicPageContainer>
        <ChapterMark id={id} ordinal="CH 04" title={title} lede={lede} />
      </PublicPageContainer>

      <div className="hh-backbone-scroll mt-10">
        <PublicPageContainer>
          <div className="hh-backbone relative">
            {/* the vertical trunk that every tier feeds — drawn once */}
            <svg aria-hidden="true" viewBox="0 0 1200 40" preserveAspectRatio="none" className="h-8 w-full" role="presentation">
              <line className="hh-sig-bus" x1="0" y1="20" x2="1200" y2="20" />
              {[100, 340, 580, 820, 1060].map((x) => <circle key={x} className="hh-sig-mark" cx={x} cy="20" r="4" />)}
            </svg>
            <ol className="mt-3 grid grid-cols-5 gap-3">
              {tiers.map((tier, i) => (
                <li key={tier.key} className="hh-bb-tier min-w-0 p-4" data-tier={tier.key}>
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="hh-mono-label">{`T${i + 1}`}</span>
                    <span aria-hidden="true" className="hh-rule block h-px flex-1" />
                  </div>
                  <h3 dir="auto" className="mt-3 text-body font-semibold text-text-primary">{tier.name}</h3>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {tier.tags.map((tag) => (
                      <li key={tag} dir="ltr" className="hh-bb-tag" data-live={tier.live ? "true" : undefined}>{tag}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </PublicPageContainer>
      </div>

      {/* the three capability routes, as a rule-separated link rail */}
      <PublicPageContainer className="mt-8">
        <ul className="grid gap-x-10 md:grid-cols-3">
          {links.map((l) => (
            <li key={l.key} className="min-w-0 border-t py-4" style={{ borderColor: "var(--edge-structural)" }}>
              <h3 dir="auto" className="text-body font-semibold text-text-primary">{l.name}</h3>
              <p dir="auto" className="mt-1.5 text-body-compact text-text-secondary">{l.desc}</p>
              <Link href={l.href} className="ds-focus mt-2 inline-flex min-h-11 items-center gap-2 text-body-compact font-semibold text-brand-primary hover:underline">
                {l.ctaLabel}<span aria-hidden="true" className="rtl:-scale-x-100">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </PublicPageContainer>
    </section>
  );
}

/* ═══ CHAPTER 5 — THE INTELLIGENCE CORE, one drawing ════════════════════════
   Brain / Copilot / Operations are NOT three cards: they are parts of one
   system, drawn once. Evidence enters the core; hypotheses rank; the
   contradiction is separated; confidence calibrates; the human gate stands
   before action; the Copilot sits beside the core as an assistant, never on
   the decision path. The three surfaces are then named against that drawing. */
export function CoreChapter({
  id, title, lede, surfaces,
}: {
  id: string;
  title: string;
  lede: string;
  surfaces: readonly { key: string; role: "core" | "assistant" | "operations"; name: string; desc: string; href: string; ctaLabel: string; items: readonly { label: string; href?: string; ctaLabel?: string }[] }[];
}) {
  return (
    <section aria-labelledby={id} className="relative overflow-hidden py-14 md:py-20">
      <div aria-hidden="true" className="hh-deepfield" data-tone="mid" />
      <PublicPageContainer className="relative">
        <ChapterMark id={id} ordinal="CH 05" title={title} lede={lede} />

        <div className="hh-core-scroll mt-10">
          <svg aria-hidden="true" viewBox="0 0 1200 300" className="hh-sig-frame hh-core h-auto w-full" role="presentation" preserveAspectRatio="xMidYMid meet">
            {/* evidence entering the core */}
            {[70, 120, 170].map((y, i) => (
              <g key={y}>
                <path className="hh-sig-track" d={`M60 ${y} H300 Q340 ${y} 360 150`} />
                {i === 0 && <rect className="hh-sig-evidence" x="60" y={y - 8} width="34" height="16" rx="2" opacity="0.9" />}
                {i === 1 && (<g><rect className="hh-sig-plate-2" x="60" y={y - 8} width="34" height="16" rx="2" /><rect className="hh-sig-contradiction" x="62" y={y + 3} width="30" height="3" /></g>)}
                {i === 2 && <rect className="hh-sig-missing" x="60" y={y - 8} width="34" height="16" rx="2" strokeWidth="1.5" />}
              </g>
            ))}
            {/* contradiction separated onto its own branch */}
            <path className="hh-sig-track" d="M300 120 Q380 120 420 60 H520" strokeDasharray="4 4" />
            <rect className="hh-sig-plate-2" x="520" y="48" width="70" height="24" rx="2" />
            <rect className="hh-sig-contradiction" x="524" y="66" width="62" height="3" />

            {/* the core */}
            <path className="hh-sig-plate-3" d="M440 90 L500 120 L500 180 L440 210 L380 180 L380 120 Z" />
            <path className="hh-sig-core" d="M440 112 L480 132 L480 168 L440 188 L400 168 L400 132 Z" />
            <circle className="hh-sig-mark" cx="440" cy="150" r="7" />

            {/* ranked hypotheses + confidence calibration */}
            <path className="hh-sig-bus" d="M500 150 H620" />
            <rect className="hh-sig-plate-2" x="620" y="118" width="150" height="14" rx="1" />
            <rect className="hh-sig-hypothesis" x="620" y="118" width="128" height="14" rx="1" opacity="0.85" />
            <rect className="hh-sig-plate-2" x="620" y="140" width="150" height="14" rx="1" />
            <rect className="hh-sig-hypothesis" x="620" y="140" width="62" height="14" rx="1" opacity="0.5" />
            <rect className="hh-sig-plate-2" x="620" y="162" width="150" height="14" rx="1" />
            <rect className="hh-sig-hypothesis" x="620" y="162" width="30" height="14" rx="1" opacity="0.3" />
            {/* calibration curve */}
            <path className="hh-sig-scan" d="M620 214 C660 214 700 200 770 190" />
            <path className="hh-sig-dim" d="M620 218 H770 M620 190 V218" />

            {/* the human gate before action */}
            <path className="hh-sig-bus" d="M770 150 H880" />
            <path className="hh-sig-gate" d="M918 96 V124 M918 176 V204 M898 124 H938 M898 176 H938" />
            <circle className="hh-sig-core-2" cx="918" cy="150" r="20" />
            <circle className="hh-sig-gate" cx="918" cy="150" r="20" />
            <path className="hh-sig-decision" d="M909 150 l6 7 l14 -16 l3 3 l-17 20 l-9 -11 Z" />

            {/* safe action */}
            <path className="hh-sig-bus" d="M938 150 H1060" />
            <rect className="hh-sig-core" x="1060" y="128" width="80" height="44" rx="3" />
            <path className="hh-sig-ink" d="M1078 142 h44 v6 h-44 Z M1078 154 h30 v6 h-30 Z" />

            {/* the Copilot: beside the core, feeding it, NOT on the decision path */}
            <rect className="hh-sig-plate" x="392" y="238" width="96" height="36" rx="3" />
            <path className="hh-sig-track" d="M440 238 V210" strokeDasharray="3 4" />
            <path className="hh-sig-ink-2" d="M410 252 h60 v4 h-60 Z M410 260 h40 v4 h-40 Z" />
          </svg>
        </div>

        {/* the three surfaces, named against the drawing — one grid, unequal */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
          {surfaces.map((s) => (
            <article key={s.key} className="min-w-0 border-t pt-5" style={{ borderColor: s.role === "core" ? "var(--beacon-core)" : "var(--edge-structural)" }}>
              <p className="hh-mono-label">{s.role === "core" ? "CORE" : s.role === "assistant" ? "ASSISTANT" : "OPERATIONS"}</p>
              <h3 dir="auto" className={cn("mt-2 font-bold tracking-tight text-text-primary", s.role === "core" ? "text-role-h3" : "text-role-h4")}>{s.name}</h3>
              <p dir="auto" className="mt-3 text-body-compact text-text-secondary">{s.desc}</p>
              <ul className="mt-4 flex flex-col">
                {s.items.map((it) => (
                  <li key={it.label} className="min-w-0 border-t" style={{ borderColor: "var(--edge-structural)" }}>
                    {it.href ? (
                      <Link href={it.href} aria-label={it.ctaLabel} className="ds-focus flex min-h-11 items-center gap-2 py-2.5 text-body-compact text-text-secondary hover:text-brand-primary">
                        <span dir="auto" className="min-w-0">{it.label}</span><span aria-hidden="true" className="ms-auto rtl:-scale-x-100">→</span>
                      </Link>
                    ) : (
                      <span dir="auto" className="block py-2.5 text-body-compact text-text-secondary">{it.label}</span>
                    )}
                  </li>
                ))}
              </ul>
              <Link href={s.href} className={cn(buttonVariants(s.role === "core" ? "primary" : "secondary", "md"), "mt-5 inline-flex")}>{s.ctaLabel}</Link>
            </article>
          ))}
        </div>
      </PublicPageContainer>
    </section>
  );
}

/* ═══ CHAPTER 6 — THE VALIDATION GATE ═══════════════════════════════════════
   Proposed → Validated → Human Approved → Released. Every row answers exactly
   five questions — GATE / ACTOR / EVIDENCE REQUIREMENT / BLOCKING CONDITION /
   STATE — and Human Approved is the chapter's Beacon.

   TWO RENDERINGS, one DOM each (never both):
     · md+   a semantic <table> with <th scope>, so a screen reader announces
             column and row headers for every cell;
     · <md   an accessible accordion of native <details>/<summary>, G3 open by
             default, every cell still in the DOM. This is the owner-selected
             MOBILE_GATE_LAYOUT=ACCESSIBLE_ACCORDION, chosen to bring the phone
             page back toward the height target without dropping content.
   State is carried by a structural marker AND a text label in both — colour is
   never the only channel. Enterprise guarantees sit beside the table. */
export function GateChapter({
  id, title, lede, heads, states, stages, guarantees,
}: {
  id: string;
  title: string;
  lede: string;
  heads: { gate: string; actor: string; evidence: string; block: string; state: string };
  states: Record<"pending" | "validated" | "decision" | "released", string>;
  stages: readonly {
    key: string;
    label: string;
    actor: string;
    evidence: string;
    block: string;
    state: "pending" | "validated" | "decision" | "released";
    beacon?: boolean;
  }[];
  guarantees: readonly { key: string; label: string }[];
}) {
  const StateMark = ({ state }: { state: keyof typeof states }) => (
    <span className="hh-gate-state text-text-muted" data-state={state}>
      {states[state]}
    </span>
  );

  return (
    <section aria-labelledby={id} className="hh-plate relative py-14 md:py-20" data-ticks="true">
      <PublicPageContainer>
        <ChapterMark id={id} ordinal="CH 06" title={title} lede={lede} />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">

          {/* ── md+: the semantic table ── */}
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="hh-gate-table w-full min-w-[40rem] border-collapse text-start">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  {(["gate", "actor", "evidence", "block", "state"] as const).map((h) => (
                    <th key={h} scope="col" className="hh-mono-label pb-3 text-start font-normal">
                      {heads[h]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stages.map((s, i) => (
                  <tr key={s.key} className="hh-gate-tr" data-beacon={s.beacon ? "true" : undefined}>
                    <th scope="row" className="min-w-0 py-4 pe-4 text-start align-top font-normal">
                      <span aria-hidden="true" className="hh-mono-label">{`G${i + 1}`}</span>
                      <span dir="auto" className={cn("mt-1 block text-body font-semibold", s.beacon ? "text-brand-primary" : "text-text-primary")}>
                        {s.label}
                      </span>
                    </th>
                    <td dir="auto" className="py-4 pe-4 align-top text-body-compact text-text-secondary">{s.actor}</td>
                    <td dir="auto" className="py-4 pe-4 align-top text-body-compact text-text-secondary">{s.evidence}</td>
                    <td dir="auto" className="py-4 pe-4 align-top text-body-compact text-text-secondary">{s.block}</td>
                    <td className="py-4 align-top"><StateMark state={s.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── <md: the accessible accordion ── */}
          <div className="min-w-0 md:hidden">
            {stages.map((s, i) => (
              <details
                key={s.key}
                className="hh-gate-acc"
                data-beacon={s.beacon ? "true" : undefined}
                open={s.beacon ? true : undefined}
              >
                <summary className="ds-focus flex min-h-11 cursor-pointer list-none items-center gap-3 py-3">
                  <span aria-hidden="true" className="hh-mono-label shrink-0">{`G${i + 1}`}</span>
                  <span dir="auto" className={cn("min-w-0 flex-1 text-body font-semibold", s.beacon ? "text-brand-primary" : "text-text-primary")}>
                    {s.label}
                  </span>
                  <StateMark state={s.state} />
                  <span aria-hidden="true" className="hh-gate-chevron shrink-0 text-text-muted">▾</span>
                </summary>
                <dl className="grid gap-3 pb-4 ps-8">
                  {(["actor", "evidence", "block"] as const).map((k) => (
                    <div key={k} className="min-w-0">
                      <dt className="hh-mono-label">{heads[k]}</dt>
                      <dd dir="auto" className="mt-1 text-body-compact text-text-secondary">{s[k]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>

          <ul className="min-w-0 self-start">
            {guarantees.map((g) => (
              <li key={g.key} className="flex min-w-0 items-start gap-3 border-t py-4" style={{ borderColor: "var(--edge-structural)" }}>
                <span aria-hidden="true" className="mt-2 block h-px w-5 shrink-0" style={{ background: "var(--beacon-core)" }} />
                <span dir="auto" className="text-body-compact text-text-secondary">{g.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </PublicPageContainer>
    </section>
  );
}

/* ═══ CHAPTER 7 — THE EDITORIAL SPREAD ══════════════════════════════════════
   A cover geometry (abstract engineering diagram, no image), an issue mark,
   display title, standfirst, metadata line and the Journal CTA — with Academy
   and Library as a compact rail. Real editorial hierarchy, not a capability
   list. */
export function EditorialChapter({
  id, title, feature, rail,
}: {
  id: string;
  title: string;
  feature: { kicker: string; issue: string; name: string; desc: string; meta: string; ctaLabel: string; href: string };
  rail: readonly { key: string; name: string; desc: string; ctaLabel: string; href: string }[];
}) {
  return (
    <section aria-labelledby={id} className="relative py-14 md:py-20">
      <PublicPageContainer>
        <ChapterMark id={id} ordinal="CH 07" title={title} />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
          <article className="min-w-0">
            <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
              {/* cover geometry — abstract, no stock image */}
              <div className="hh-editorial-cover aspect-[3/4] w-full max-w-[13rem]">
                <svg aria-hidden="true" viewBox="0 0 208 277" className="h-full w-full" role="presentation">
                  <g className="hh-sig-dim" opacity="0.8">
                    {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1="0" y1={40 + i * 40} x2="208" y2={40 + i * 40} />)}
                    {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={20 + i * 42} y1="0" x2={20 + i * 42} y2="277" />)}
                  </g>
                  <circle className="hh-sig-core" cx="104" cy="118" r="42" />
                  <circle className="hh-sig-dim" cx="104" cy="118" r="26" />
                  <path className="hh-sig-bus" d="M20 200 H80 L104 160 L128 200 H188" />
                  <circle className="hh-sig-mark" cx="104" cy="118" r="5" />
                  <rect className="hh-sig-plate-2" x="20" y="232" width="60" height="6" rx="1" />
                  <rect className="hh-sig-plate-2" x="20" y="244" width="120" height="6" rx="1" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p dir="auto" className="text-label-compact font-semibold uppercase tracking-[0.16em] text-brand-primary">{feature.kicker}</p>
                  <p className="hh-editorial-issue text-caption text-text-muted">{feature.issue}</p>
                </div>
                <div aria-hidden="true" className="hh-editorial-rule mt-3 w-12" />
                <h3 dir="auto" className="mt-4 max-w-2xl text-role-h1 font-extrabold leading-[1.1] tracking-tight text-text-primary">{feature.name}</h3>
                <p dir="auto" className="mt-4 max-w-xl text-body-lg text-text-secondary">{feature.desc}</p>
                <p dir="auto" className="mt-4 font-mono text-caption text-text-muted">{feature.meta}</p>
                <Link href={feature.href} className={cn(buttonVariants("secondary", "md"), "mt-6 inline-flex")}>{feature.ctaLabel}</Link>
              </div>
            </div>
          </article>

          <div className="min-w-0 self-end">
            {rail.map((item) => (
              <article key={item.key} className="min-w-0 border-t py-5" style={{ borderColor: "var(--edge-structural)" }}>
                <h3 dir="auto" className="text-role-h4 font-semibold text-text-primary">{item.name}</h3>
                <p dir="auto" className="mt-2 text-body-compact text-text-secondary">{item.desc}</p>
                <Link href={item.href} className="ds-focus mt-2.5 inline-flex min-h-11 items-center gap-2 text-body-compact font-semibold text-brand-primary hover:underline">
                  {item.ctaLabel}<span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </PublicPageContainer>
    </section>
  );
}

/* ═══ CHAPTER 8 — THE CLOSING SCENE ═════════════════════════════════════════
   The whole observatory resolves: signals converge, evidence is validated,
   the human decision stays explicit, safe action becomes possible. The CTA
   stands on a Glass ELEVATED surface (Glass #3) inside the deep field. */
export function ClosingChapter({
  id, title, ctaLabel, href, secondary, ecosystem, closeLines,
}: {
  id: string;
  title: string;
  ctaLabel: string;
  href: string;
  secondary: { label: string; href: string };
  ecosystem: readonly { key: string; name: string; href: string; ctaLabel: string }[];
  /** The four convergence statements — existing pipeline stage labels. */
  closeLines: readonly string[];
}) {
  return (
    <section aria-labelledby={id} className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="hh-deepfield" />
      <div aria-hidden="true" className="hh-grain" />
      <PublicPageContainer className="relative py-16 md:py-24">
        <svg aria-hidden="true" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet" className="hh-sig-frame mx-auto h-auto w-full max-w-3xl" role="presentation">
          <g className="hh-sig-dim" opacity="0.5">
            <line x1="0" y1="20" x2="900" y2="20" /><line x1="0" y1="180" x2="900" y2="180" />
          </g>
          {[40, 100, 160].map((y) => (
            <path key={y} className="hh-sig-track" d={`M20 ${y} H360 Q420 ${y} 440 100`} />
          ))}
          <rect className="hh-sig-evidence" x="20" y="32" width="30" height="16" rx="2" opacity="0.9" />
          <g><rect className="hh-sig-plate-2" x="20" y="92" width="30" height="16" rx="2" /><rect className="hh-sig-contradiction" x="22" y="103" width="26" height="3" /></g>
          <rect className="hh-sig-missing" x="20" y="152" width="30" height="16" rx="2" strokeWidth="1.5" />
          <path className="hh-sig-bus" d="M440 100 H560" />
          <path className="hh-sig-flow" d="M20 100 H360 Q420 100 440 100 H560" />
          <path className="hh-sig-gate" d="M600 40 V72 M600 128 V160 M576 72 H624 M576 128 H624" />
          <circle className="hh-sig-core-2" cx="600" cy="100" r="24" />
          <circle className="hh-sig-gate" cx="600" cy="100" r="24" />
          <path className="hh-sig-decision" d="M589 100 l7 8 l17 -19 l3.5 3.5 l-20.5 24 l-10.5 -13 Z" />
          <path className="hh-sig-bus" d="M624 100 H780" />
          <rect className="hh-sig-core" x="780" y="76" width="90" height="48" rx="3" />
          <path className="hh-sig-ink" d="M800 91 h50 v6 h-50 Z M800 103 h34 v6 h-34 Z" />
        </svg>

        {/* Glass #3 — the decision surface */}
        <div className="ds-glass-elevated mx-auto mt-10 max-w-3xl rounded-lg p-7 text-center md:p-10" data-hermes-signature="glass-elevated">
          <ol className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {closeLines.map((line, i) => (
              <li key={line} className="flex items-center gap-3">
                {i > 0 ? <span aria-hidden="true" className="text-text-muted rtl:-scale-x-100">→</span> : null}
                <span dir="auto" className={cn("hh-mono-label", i === closeLines.length - 2 && "text-brand-primary")}>{line}</span>
              </li>
            ))}
          </ol>
          <h2 id={id} dir="auto" className="mx-auto mt-6 max-w-2xl text-role-h2 font-bold tracking-tight text-text-primary">{title}</h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={href} className={cn(buttonVariants("primary", "lg"), "min-w-44")}>{ctaLabel}</Link>
            <Link href={secondary.href} className={cn(buttonVariants("secondary", "lg"), "min-w-44")}>{secondary.label}</Link>
          </div>
        </div>

        <ul className="mx-auto mt-14 grid max-w-4xl gap-x-10 sm:grid-cols-2 md:grid-cols-4">
          {ecosystem.map((item) => (
            <li key={item.key} className="min-w-0 border-t" style={{ borderColor: "var(--edge-structural)" }}>
              <Link href={item.href} aria-label={item.ctaLabel} className="ds-focus flex min-h-11 items-center gap-2 py-3 text-body-compact text-text-secondary hover:text-brand-primary">
                <span dir="auto" className="min-w-0">{item.name}</span><span aria-hidden="true" className="ms-auto rtl:-scale-x-100">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </PublicPageContainer>
    </section>
  );
}
