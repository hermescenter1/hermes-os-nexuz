// PHASE 87D — premium public homepage on the public-site foundation.
// Server-rendered throughout; copy comes from the `publicSite` catalogs
// (en + de + fa). Content integrity: no certifications, statistics,
// testimonials or partner claims, and every product depiction is explicitly
// captioned as illustrative. Conversion routes are the approved pair:
// /demo (primary), /platform (secondary).
//
// ══ PHASE 104-E — HERMES INDUSTRIAL INTELLIGENCE OBSERVATORY (round 3) ══
//
// Round 1 (rejected): a re-layout of the old card-grid page.
// Round 2 (conditionally accepted): the Observatory direction, the bespoke
//   signature, eight chapters, no photograph — but visual power lived only in
//   the hero; after the fold the page fell back to text and hairlines.
// Round 3 (this): the SAME architecture, carried through. Every chapter now
//   owns a real drawing; the signature is stronger, instrumented, and present
//   in the mobile fold; three Glass surfaces mark genuine depth; the semantic
//   reasoning tokens appear only at their meaning; the header and footer opt
//   into the Observatory shell without changing their defaults.
//
//   CH 01 hero      deep field + signature + Glass instrumentation (Glass #1)
//   CH 02 case      incident rail + waveform + Glass evidence inspector (#2)
//   CH 03 planes    four connected planes on one spine (in/process/out/limit)
//   CH 04 backbone  plant-to-platform system map, four tiers
//   CH 05 core      ONE intelligence drawing shared by Brain/Copilot/Ops
//   CH 06 gate      validation gate: actor / evidence / state / block
//   CH 07 editorial editorial spread with cover geometry + issue mark
//   CH 08 close     signal convergence on a Glass decision surface (#3)
//
// NO photograph, NO card grid, NO hardcoded text inside any SVG, NO
// ember/Horizon token. The two retired round-1 hero/story components are
// unreferenced and deliberately kept on disk until final visual approval.
//
// ── CONTENT PRESERVED, NOT DROPPED ──
// Every `publicSite` group the old page rendered still renders. Every URL,
// CTA destination, metadata field and canonical behaviour is unchanged.
//
// ── ORDER CONTRACT ──
// `homepage-104e-narrative.test.ts` asserts the eight chapters in order,
// exactly once, plus routes and content groups, with a mutation harness.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";
import { PublicHeader, PublicFooter } from "@/components/public-site";
import {
  ObservatoryHero,
  ObservatorySignature,
  CaseChapter,
  PlanesChapter,
  BackboneChapter,
  CoreChapter,
  GateChapter,
  EditorialChapter,
  ClosingChapter,
  type ObservatoryNodes,
} from "@/components/public-site/home";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const meta = buildMetadata({
    locale,
    path:        "",
    title:       t("title"),
    description: t("description"),
    keywords:    t.raw("keywords") as string | undefined,
  });
  // The locale layout applies the `%s | Hermes OS` title template to child
  // segments; meta.title already carries the brand, so the homepage opts out
  // with an absolute document title.
  return { ...meta, title: { absolute: t("title") } };
}

/**
 * CH04 — the engineering backbone tiers, plant floor to Hermes.
 * `tags` are locale-INVARIANT protocol / standard identifiers the catalogs
 * already keep verbatim inside translated sentences (the de-catalog test
 * asserts exactly that for "OPC UA"); they render `dir="ltr"` in RTL.
 */
const BACKBONE_TIERS = [
  { key: "plant",   tags: ["Instrumentation", "Electrical", "Asset"] },
  { key: "control", tags: ["PLC", "OT Edge", "OPC UA", "MQTT"] },
  { key: "super",   tags: ["SCADA/HMI", "Historian", "Time Series"] },
  { key: "models",  tags: ["Digital Twin", "Knowledge Graph", "EDMS"] },
  { key: "hermes",  tags: ["Industrial Brain", "Copilot"], live: true },
] as const;

/** CH04 — the three capability routes the backbone links to. */
const ENGINEERING_CARDS = [
  { key: "edge",      accent: "success", href: "/services/ot-edge" },
  { key: "twin",      accent: "violet",  href: "/services/digital-twin" },
  { key: "knowledge", accent: "azure",   href: "/library" },
] as const;

/** CH05 — operational intelligence links (real capability routes). */
const OPERATIONS_CARDS = [
  { key: "asset",      accent: "success", href: "/platform" },
  { key: "predictive", accent: "brand",   href: "/services/predictive-maintenance" },
  { key: "multisite",  accent: "azure",   href: "/services/multi-site" },
] as const;

/** CH08 — the eight ecosystem doors. Every href is a live public route. */
const ECOSYSTEM_CARDS = [
  { key: "industrialBrain", href: "/industrial-brain" },
  { key: "copilot",         href: "/copilot"          },
  { key: "services",        href: "/services"         },
  { key: "academy",         href: "/academy"          },
  { key: "library",         href: "/library"          },
  { key: "articles",        href: "/articles"         },
  { key: "vendors",         href: "/vendors"          },
  { key: "careers",         href: "/careers"          },
] as const;

const GUARANTEE_KEYS = ["isolation", "rbac", "protocols", "deterministic"] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("publicSite");
  const split = (s: string) => s.split("·").map((x) => x.trim()).filter(Boolean);

  // The Observatory signature's labels — all existing catalog keys.
  const nodes: ObservatoryNodes = {
    asset:      t("evidence.header"),
    signals:    t("flow.stages.data"),
    evidence:   t("flow.stages.evidence"),
    brain:      t("intelligence.brain.name"),
    hypotheses: t("flow.stages.hypotheses"),
    risk:       t("flow.stages.risk"),
    gate:       t("safeAction.gates.approval"),
    action:     t("flow.stages.safeAction"),
    quality:    [t("evidence.evidence1"), t("evidence.evidence2"), t("evidence.evidence3")],
    disclosure: t("evidence.caption"),
    ariaLabel:  t("evidence.ariaLabel"),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background-base">
      {/* The full entity graph is emitted globally by the locale layout, so
          the homepage adds no structured data of its own. */}
      <PublicHeader visualMode="observatory" />

      <main id="public-content" tabIndex={-1} className="flex-1 outline-none">
        {/* ══ CH 01 ══ */}
        <ObservatoryHero nodes={nodes} />

        {/* ══ CH 02 — one industrial case, as an incident rail ══ */}
        <CaseChapter
          id="case-title"
          title={t("challenge.title")}
          lede={t("challenge.lede")}
          asset={t("evidence.header")}
          status={t("evidence.status")}
          disclosure={t("evidence.caption")}
          signature={<ObservatorySignature nodes={nodes} />}
          steps={[
            { key: "evidence",      state: "evidence",      label: t("evidence.evidence1") },
            { key: "contradiction", state: "contradiction", label: t("evidence.evidence2") },
            { key: "missing",       state: "missing",       label: t("evidence.evidence3") },
            { key: "hyp1",          state: "hypothesis",    label: t("evidence.hyp1Title"), body: t("evidence.hyp1Meta") },
            { key: "risk",          state: "risk",          label: t("evidence.riskLabel"), body: t("evidence.riskNote") },
            { key: "gate",          state: "decision",      label: t("safeAction.gates.approval"), body: t("evidence.sapNote") },
            { key: "action",        state: "action",        label: t("flow.stages.safeAction") },
          ]}
          inspector={{
            title: t("evidence.railTitle"),
            rows: [
              { key: "e1", state: "evidence",      label: t("evidence.evidence1") },
              { key: "e2", state: "contradiction", label: t("evidence.evidence2") },
              { key: "e3", state: "missing",       label: t("evidence.evidence3") },
            ],
            hypTitle: t("evidence.hypothesesTitle"),
            hyps: [
              { label: t("evidence.hyp1Title"), meta: t("evidence.hyp1Meta") },
              { label: t("evidence.hyp2Title"), meta: t("evidence.hyp2Meta") },
            ],
          }}
        />

        {/* ══ CH 03 — four connected planes ══
            Codex fix: the round-3 cells borrowed pipeline-stage names as
            column heads and the pillar `desc` as "process", which produced
            heads that did not describe their cells. The planes now read
            DEDICATED, exact copy from `publicSite.observatory` — INPUT /
            PROCESS / OUTPUT / CONSTRAINT with a per-plane cell for each — in
            en/de/fa. The chapter also gets its own lede instead of reusing
            the Chapter 5 line. */}
        <PlanesChapter
          id="planes-title"
          title={t("pillars.title")}
          lede={t("observatory.planesLede")}
          cellHeads={{
            input:      t("observatory.planeHeads.input"),
            process:    t("observatory.planeHeads.process"),
            output:     t("observatory.planeHeads.output"),
            constraint: t("observatory.planeHeads.constraint"),
          }}
          planes={(["evidence", "reasoning", "model", "safety"] as const).map((key) => ({
            key,
            name:       t(`pillars.${key}.name`),
            input:      t(`observatory.planes.${key}.input`),
            process:    t(`observatory.planes.${key}.process`),
            output:     t(`observatory.planes.${key}.output`),
            constraint: t(`observatory.planes.${key}.constraint`),
          }))}
        />

        {/* ══ CH 04 — the engineering backbone ══ */}
        <BackboneChapter
          id="backbone-title"
          title={t("engineering.title")}
          lede={t("modules.title")}
          tiers={BACKBONE_TIERS.map((tier) => ({
            key:  tier.key,
            tags: tier.tags,
            live: "live" in tier ? tier.live : undefined,
            name:
              tier.key === "plant"   ? t("modules.groups.operations.name") :
              tier.key === "control" ? t("engineering.cards.edge.name") :
              tier.key === "super"   ? t("engineering.cards.twin.name") :
              tier.key === "models"  ? t("engineering.cards.knowledge.name") :
                                       t("modules.groups.intelligence.name"),
          }))}
          links={ENGINEERING_CARDS.map(({ key, href }) => ({
            key,
            href,
            name: t(`engineering.cards.${key}.name`),
            desc: t(`engineering.cards.${key}.desc`),
            ctaLabel: t(`engineering.cards.${key}.cta`),
          }))}
        />

        {/* ══ CH 05 — the intelligence core, one drawing ══
            Own lede (Codex fix): "one evidence-bound reasoning core, with
            assistance kept outside the decision gate" — distinct from CH03. */}
        <CoreChapter
          id="core-title"
          title={t("intelligence.title")}
          lede={t("observatory.coreLede")}
          surfaces={[
            {
              key: "brain", role: "core",
              name: t("intelligence.brain.name"), desc: t("intelligence.brain.desc"),
              items: split(t("intelligence.brain.items")).map((label) => ({ label })),
              href: "/industrial-brain", ctaLabel: t("intelligence.brain.cta"),
            },
            {
              key: "copilot", role: "assistant",
              name: t("intelligence.copilot.name"), desc: t("intelligence.copilot.desc"),
              items: split(t("intelligence.copilot.items")).map((label) => ({ label })),
              href: "/copilot", ctaLabel: t("intelligence.copilot.cta"),
            },
            {
              // Each operations entry is a REAL link, so /platform,
              // predictive-maintenance and multi-site keep inbound links.
              key: "operations", role: "operations",
              name: t("operations.title"), desc: t("operations.cards.asset.desc"),
              // Forwards href AND ctaLabel — the F3 discovery invariant. The
              // rail renders each entry as an anchor whose accessible name is
              // the card's own cta copy, so every capability route keeps a
              // real, uniquely-labelled inbound link from the homepage.
              items: OPERATIONS_CARDS.map(({ key, href }) => ({
                href,
                label: t(`operations.cards.${key}.name`),
                ctaLabel: t(`operations.cards.${key}.cta`),
              })),
              href: "/platform", ctaLabel: t("operations.cards.asset.cta"),
            },
          ]}
        />

        {/* ══ CH 06 — the validation gate ══
            Codex fix: every column and cell now reads DEDICATED copy from
            `publicSite.observatory` — GATE / ACTOR / EVIDENCE REQUIREMENT /
            BLOCKING CONDITION / STATE — so each row answers exactly what the
            gate is, who owns it, what evidence it needs, what blocks it and
            where it stands. Rendered as a semantic <table> on md+ and as an
            accessible <details> accordion below md (G3 open by default). */}
        <GateChapter
          id="gate-title"
          title={t("safeAction.title")}
          lede={t("safeAction.lede")}
          heads={{
            gate:     t("observatory.gateHeads.gate"),
            actor:    t("observatory.gateHeads.actor"),
            evidence: t("observatory.gateHeads.evidence"),
            block:    t("observatory.gateHeads.block"),
            state:    t("observatory.gateHeads.state"),
          }}
          states={{
            pending:   t("observatory.gateStates.pending"),
            validated: t("observatory.gateStates.validated"),
            decision:  t("observatory.gateStates.decision"),
            released:  t("observatory.gateStates.released"),
          }}
          stages={(
            [
              { key: "proposed",  state: "pending"   },
              { key: "validated", state: "validated" },
              { key: "approval",  state: "decision", beacon: true },
              { key: "executed",  state: "released"  },
            ] as const
          ).map((g) => ({
            key:      g.key,
            state:    g.state,
            beacon:   "beacon" in g ? g.beacon : undefined,
            label:    t(`safeAction.gates.${g.key}`),
            actor:    t(`observatory.gates.${g.key}.actor`),
            evidence: t(`observatory.gates.${g.key}.evidence`),
            block:    t(`observatory.gates.${g.key}.block`),
          }))}
          guarantees={GUARANTEE_KEYS.map((key) => ({ key, label: t(`trustStrip.${key}`) }))}
        />

        {/* ══ CH 07 — the editorial spread ══ */}
        <EditorialChapter
          id="editorial-title"
          title={t("learning.title")}
          feature={{
            kicker:   t("learning.cards.articles.name"),
            issue:    t("header.nav.articles"),
            name:     t("ecosystem.cards.articles.desc"),
            desc:     t("learning.cards.articles.desc"),
            meta:     t("trustStrip.deterministic"),
            ctaLabel: t("learning.cards.articles.cta"),
            href:     "/articles",
          }}
          rail={(["academy", "library"] as const).map((key) => ({
            key,
            name:     t(`learning.cards.${key}.name`),
            desc:     t(`learning.cards.${key}.desc`),
            ctaLabel: t(`learning.cards.${key}.cta`),
            href:     key === "academy" ? "/academy" : "/library",
          }))}
        />

        {/* ══ CH 08 — the closing scene ══ */}
        <ClosingChapter
          id="close-title"
          title={t("demoCta.title")}
          ctaLabel={t("demoCta.requestDemo")}
          href="/demo"
          secondary={{ label: t("hero.explorePlatform"), href: "/platform" }}
          closeLines={[
            t("flow.stages.data"),
            t("flow.stages.evidence"),
            t("safeAction.gates.approval"),
            t("flow.stages.safeAction"),
          ]}
          ecosystem={ECOSYSTEM_CARDS.map(({ key, href }) => ({
            key, href,
            name:     t(`ecosystem.cards.${key}.name`),
            ctaLabel: t(`ecosystem.cards.${key}.cta`),
          }))}
        />
      </main>

      <PublicFooter visualMode="observatory" />
    </div>
  );
}
