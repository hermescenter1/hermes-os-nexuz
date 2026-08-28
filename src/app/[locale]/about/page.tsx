// PHASE 104-I1 — THE HERMES ENGINEERING CHARTER & PROVENANCE LEDGER.
//
// The 87D composition this replaces was a template: a PageIntro, two rounded
// "company / mission" cards, a founder portrait beside three bio paragraphs,
// a 2×2 grid of four interchangeable pillar cards and a centred CTA row — all
// in pre-104 legacy tokens (`text-ink`, `border-line`, `bg-surface`).
//
// It is rebuilt as a controlled engineering document, because that is what the
// company actually is: an automation practice that turns plant evidence into
// safe action. The composition is a drawing sheet, read top to bottom:
//
//   1  CHARTER PLATE      the claim, stamped, over a measured tick band
//   2  TITLE BLOCK        the real title block of an engineering sheet:
//                         entity · practice · sites · domain (verified data)
//   3  MEMORY SPINE       the mission as a four-step reasoning run, with the
//                         one human-decision node carrying Beacon
//   4  DISCIPLINE REGISTER the four capability entries as a measured ledger
//                         with ordinals and depth bars — a register, not cards
//   5  PROVENANCE RECORD  the founder as a signed provenance block plus a
//                         monospaced specimen strip of the verified stack
//   6  OPERATING NETWORK  the two verified sites drawn in code
//   7  CLOSURE            the two existing paths onward
//
// Truthfulness: every string still comes from the `about` catalogue, which is
// already at full en/de/fa parity — this increment adds NO new key and invents
// no date, headcount, customer, award or metric. The 2×2 pillar grid becomes a
// register whose depth bars encode each entry's ORDINAL position in the
// register (documented in the CSS), never a fabricated measurement.
// The founder photograph is removed in favour of a code-native signature block:
// the charter is about engineering provenance, not portraiture.
//
// Every decorative rule, tick band and node is `aria-hidden`; the register and
// the spine are real lists; the page keeps exactly one H1; all spacing,
// borders and bars are logical properties so RTL mirrors without a second rule.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PublicPageShell } from "@/components/public-site";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/about", title: p.about.title, description: p.about.description, keywords: p.about.keywords });
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  /* The mission, read as the reasoning run it describes. The first three steps
     restate the mission's own sentence structure; the fourth is the decision
     step, and it is the only one that carries Beacon. Labels are catalogue
     values — the step ordinals are structure, not content. */
  const spine = [
    { key: "problem",  label: t("missionEyebrow"),  body: t("missionDesc"),  decision: false },
    { key: "charter",  label: t("companyEyebrow"),  body: t("companyDesc"),  decision: false },
    { key: "decision", label: t("missionTitle"),    body: t("lede"),         decision: true  },
  ] as const;

  /* Four verified capability entries. `depth` is the entry's own position in
     the register expressed as a proportion — a reading aid for the ledger, not
     a measurement of anything in the world. */
  const register = [
    { ord: "01", title: t("pillar1Title"), desc: t("pillar1Desc") },
    { ord: "02", title: t("pillar2Title"), desc: t("pillar2Desc") },
    { ord: "03", title: t("pillar3Title"), desc: t("pillar3Desc") },
    { ord: "04", title: t("pillar4Title"), desc: t("pillar4Desc") },
  ];

  const provenance = [t("founderBio1"), t("founderBio2"), t("founderBio3")];

  return (
    <PublicPageShell visualMode="company">
      {/* ── 1 · CHARTER PLATE ───────────────────────────────────────────── */}
      <section className="hc-sheet">
        <div aria-hidden="true" className="hc-ticks" />
        <div className="mx-auto w-full max-w-[78rem] px-5 pb-12 pt-10 md:px-10 md:pb-16 md:pt-14">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-text-metadata">
            {t("eyebrow")}
          </p>
          {/* the approved Observatory hero's fluid pattern: role-h1 at mobile,
              display only from md — a fixed 3.5rem would put the German
              "industriellen" past a 320px column (the 104-H heading trap) */}
          <h1 className="mt-4 max-w-[46rem] text-role-h1 font-extrabold leading-[1.05] tracking-tight text-text-primary md:text-display">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[38rem] text-body-lg text-text-secondary">{t("lede")}</p>

          {/* ── 2 · TITLE BLOCK ──────────────────────────────────────────── */}
          <div className="hc-titleblock mt-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="hc-tb-cell">
              <span className="hc-tb-key">{t("companyEyebrow")}</span>
              <span className="hc-tb-val font-semibold">{t("companyTitle")}</span>
            </div>
            <div className="hc-tb-cell">
              <span className="hc-tb-key">{t("pillarsEyebrow")}</span>
              <span className="hc-tb-val">{t("pillarsTitle")}</span>
            </div>
            <div className="hc-tb-cell">
              <span className="hc-tb-key">{t("founderEyebrow")}</span>
              <span className="hc-tb-val">{t("founderName")}</span>
            </div>
            <div className="hc-tb-cell">
              <span className="hc-tb-key">{t("website")}</span>
              {/* a domain is a locale-invariant identifier: kept LTR inside RTL */}
              <span className="hc-tb-val font-mono text-[0.8125rem]" dir="ltr">{t("website")}</span>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="hc-ticks hc-ticks-fine" />
      </section>

      {/* ── 3 · MEMORY SPINE ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[78rem] px-5 py-14 md:px-10 md:py-20">
        <h2 className="text-title-lg font-bold text-text-primary">{t("missionTitle")}</h2>
        <ol className="hc-spine mt-8 max-w-[52rem]">
          {spine.map((s) => (
            <li key={s.key} className="hc-spine-step" data-decision={s.decision ? "true" : "false"}>
              <span aria-hidden="true" className="hc-spine-node" />
              <div className="min-w-0">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-text-metadata">
                  {s.label}
                  {/* the decision step is named in TEXT as well as marked with
                      Beacon, so the state never depends on colour */}
                  {s.decision && (
                    <span className="ms-2 text-brand-primary">· {t("missionEyebrow")}</span>
                  )}
                </p>
                <p className="mt-2 text-body text-text-secondary">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 4 · DISCIPLINE REGISTER ──────────────────────────────────────── */}
      <section className="hc-sheet">
        <div className="mx-auto w-full max-w-[78rem] px-5 py-14 md:px-10 md:py-20">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-text-metadata">
            {t("pillarsEyebrow")}
          </p>
          <h2 className="mt-3 max-w-[34rem] text-title-lg font-bold text-text-primary">
            {t("pillarsTitle")}
          </h2>
          <ul className="hc-register mt-8">
            {register.map((r, i) => (
              <li key={r.ord} className="hc-reg-row">
                <span className="hc-reg-ord" dir="ltr">{r.ord}</span>
                <div className="min-w-0">
                  <h3 className="text-body-lg font-semibold text-text-primary">{r.title}</h3>
                  {/* ordinal position in this register, stated in the markup as
                      a proportion of four entries — a reading aid, not data */}
                  <span
                    aria-hidden="true"
                    className="hc-reg-depth"
                    style={{ ["--hc-depth" as string]: `${((i + 1) / register.length) * 100}%` }}
                  >
                    <span />
                  </span>
                </div>
                <p className="min-w-0 text-body text-text-secondary">{r.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 5 · PROVENANCE RECORD ────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[78rem] px-5 py-14 md:px-10 md:py-20">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-text-metadata">
          {t("founderEyebrow")}
        </p>
        <div className="hc-prov mt-6 max-w-[58rem]">
          <div className="hc-prov-head">
            <p className="text-title font-bold text-text-primary">{t("founderName")}</p>
            <p className="text-body-compact text-text-secondary">{t("founderRole")}</p>
          </div>
          <div className="hc-prov-body">
            {provenance.map((p, i) => (
              <div key={i} className="hc-prov-item">
                <span aria-hidden="true" className="hc-prov-no" dir="ltr">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="min-w-0 text-body text-text-secondary">{p}</p>
              </div>
            ))}
          </div>
          {/* Protocol and product identifiers are locale-invariant: the whole
              specimen strip is an LTR island even under `dir="rtl"`. */}
          <p className="hc-specimen" dir="ltr">{t("founderExpertise")}</p>
        </div>
      </section>

      {/* ── 6 · OPERATING NETWORK ────────────────────────────────────────── */}
      <section className="hc-sheet">
        <div className="mx-auto w-full max-w-[78rem] px-5 py-14 md:px-10 md:py-20">
          <h2 className="text-title-lg font-bold text-text-primary">{t("companyTitle")}</h2>
          <div className="hc-network mt-6 max-w-[58rem]">
            <div className="hc-site">
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-text-metadata">
                {t("companyEyebrow")}
              </span>
              <span className="text-body-lg text-text-primary">{t("locationIran")}</span>
            </div>
            <div className="hc-site">
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-text-metadata">
                {t("companyEyebrow")}
              </span>
              <span className="text-body-lg text-text-primary">{t("locationUK")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7 · CLOSURE ──────────────────────────────────────────────────── */}
      <section className="hc-closure">
        <div className="mx-auto flex w-full max-w-[78rem] flex-wrap items-center gap-3 px-5 py-12 md:px-10">
          <Link
            href="/contact"
            className="ds-focus inline-flex min-h-11 items-center rounded-sm border border-brand-primary px-5 text-label font-semibold text-brand-primary transition-colors duration-fast hover:bg-brand-primary/10 motion-reduce:transition-none"
          >
            {t("ctaContact")}
          </Link>
          <Link
            href="/platform"
            className="ds-focus inline-flex min-h-11 items-center rounded-sm border border-border-default px-5 text-label text-text-secondary transition-colors duration-fast hover:text-text-primary motion-reduce:transition-none"
          >
            {t("ctaPlatform")}
          </Link>
        </div>
      </section>
    </PublicPageShell>
  );
}
