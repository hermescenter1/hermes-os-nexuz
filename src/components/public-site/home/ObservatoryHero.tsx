// PHASE 104-E — Chapter 1, the Observatory hero (round 3).
//
// Round 2 established the scene: no photograph, the deep field as the space,
// the signature as its floor. Round 3 fixes what the review named —
//
//   - the gap between copy and diagram was dead space: the copy is now a
//     tighter column and the signature rises to meet it;
//   - the diagram was faint: it now carries a real stroke hierarchy and a
//     Glass INSTRUMENTATION OVERLAY (Glass surface #1 of the three permitted
//     on this page) reading the case's five semantic states — evidence,
//     contradiction, missing, hypothesis, decision — off the drawing;
//   - the mobile fold ended in empty space: it now closes with the COMPACT
//     signature directly under the primary CTA, so a phone shows the product's
//     argument before the first scroll. The secondary CTA is de-emphasised on
//     mobile as the brief allows.
//
// Every readout label is existing `publicSite.evidence.*` catalog copy, and
// the whole panel is captioned illustrative. Nothing here claims live data.
// Server component: no client island, no animation library, no fetch.

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
// Server-safe deep import — see PublicHeader.tsx for the rationale.
import { buttonVariants } from "@/components/ds/logic";
import { PublicPageContainer } from "../PublicPageContainer";
import { ObservatorySignature, type ObservatoryNodes } from "./ObservatorySignature";

/** The five semantic readouts, each bound to an existing catalog key. */
const READOUTS = [
  { state: "evidence",      key: "evidence1" },
  { state: "contradiction", key: "evidence2" },
  { state: "missing",       key: "evidence3" },
  { state: "hypothesis",    key: "hyp1Meta" },
  { state: "decision",      key: "sapNote" },
] as const;

export function ObservatoryHero({ nodes }: { nodes: ObservatoryNodes }) {
  const t = useTranslations("publicSite.hero");
  const e = useTranslations("publicSite.evidence");

  return (
    <section
      id="observatory"
      aria-labelledby="observatory-title"
      className="hh-plate relative isolate overflow-hidden"
      data-ticks="true"
    >
      {/* the observatory air + a CSS grain so the navy never reads as flat fill */}
      <div aria-hidden="true" className="hh-deepfield" />
      <div aria-hidden="true" className="hh-grain" />

      <PublicPageContainer className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-between py-8 md:min-h-0 md:justify-start md:py-12 lg:py-14">
        <div className="min-w-0">
          {/* ── the proposition ── */}
          <div className="min-w-0 max-w-3xl">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-px w-8 shrink-0" style={{ background: "var(--beacon-core)" }} />
              <p dir="auto" className="text-label-compact font-semibold uppercase tracking-[0.16em] text-brand-primary">
                {t("eyebrow")}
              </p>
            </div>

            <h1
              id="observatory-title"
              dir="auto"
              className="mt-5 text-role-h1 font-extrabold leading-[1.04] tracking-tight text-text-primary md:text-display"
            >
              {t("headlineA")}
              <br />
              <span className="text-brand-primary">{t("headlineB")}</span>
            </h1>

            <p dir="auto" className="mt-5 max-w-xl text-body-lg text-text-secondary">
              {t("lede")}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className={cn(buttonVariants("primary", "lg"), "sm:min-w-44")}>
                {t("requestDemo")}
              </Link>
              {/* Secondary CTA: full weight on md+, a quiet link on mobile so
                  the fold has room for the signature. Same destination. */}
              <Link
                href="/platform"
                className={cn(
                  buttonVariants("secondary", "lg"),
                  "hidden sm:inline-flex sm:min-w-44",
                )}
              >
                {t("explorePlatform")}
              </Link>
              <Link
                href="/platform"
                className="ds-focus inline-flex min-h-11 items-center gap-2 self-start text-body-compact font-semibold text-brand-primary hover:underline sm:hidden"
              >
                {t("explorePlatform")}
                <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
              </Link>
            </div>

            <p dir="auto" className="mt-6 hidden text-caption text-text-secondary md:block">
              {t("trustLine")}
            </p>
          </div>
        </div>

        {/* ── mobile fold: the compact signature closes the first viewport ── */}
        <div className="mt-8 md:hidden">
          <ObservatorySignature nodes={nodes} variant="compact" />
        </div>

        {/* ── desktop scene: signature + Glass instrumentation overlay ── */}
        <div className="mt-10 hidden min-w-0 md:block">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
            <ObservatorySignature nodes={nodes} />

            {/* Glass #1 — the instrumentation panel. `ds-glass-elevated`
                because it is a genuine foreground over the deep field, not
                decoration; the readouts are the five semantic states the
                drawing encodes, in the same order the case will follow. */}
            <aside
              aria-label={e("railTitle")}
              className="ds-glass-elevated hh-instrument self-start p-5"
              data-hermes-signature="glass-elevated"
            >
              <div className="flex items-center justify-between gap-3">
                <p dir="auto" className="hh-mono-label">{e("railTitle")}</p>
                <p dir="auto" className="font-mono text-caption text-brand-primary">{e("header")}</p>
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {READOUTS.map(({ state, key }) => (
                  <li key={key} className="hh-instrument-readout min-w-0" data-state={state}>
                    <span dir="auto" className="block text-body-compact text-text-secondary">
                      {e(key)}
                    </span>
                  </li>
                ))}
              </ul>
              <p dir="auto" className="mt-4 text-caption text-text-muted">{e("caption")}</p>
            </aside>
          </div>
        </div>
      </PublicPageContainer>
    </section>
  );
}
