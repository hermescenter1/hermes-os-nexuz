// PHASE 104-F — the Journal landing: THE INDUSTRIAL EVIDENCE PRESSROOM.
//
// The rejected landing was a sidebar + a hero card + a 3-column card grid + a
// 2/3-1/3 grid of more cards and sidebar widgets, over a masthead that
// printed hardcoded marketing KPIs (thousands of articles, millions of views)
// from a static catalog string. None of that survives.
//
// This is a publication, composed with rules and measure rather than boxes:
//
//   01 masthead        the title as a masthead; the Evidence Folio signature;
//                      a real standfirst; NO invented metrics — the only number
//                      shown is `feed.totalArticles`, and only when > 0
//   02 lead dossier    the featured article, asymmetric, on the ONE Glass
//                      surface of the landing (Glass = "raised above the page")
//   03 dispatch ledger the latest articles as numbered ledger rows on one
//                      continuous rule — natural heights, no cards
//   04 discipline index real categories only, as a contents table with dotted
//                      leaders and counts; the selected discipline is the Beacon
//   05 provenance      the top authors, from real profile data, as a byline
//                      register — no fabricated credentials
//   06 publication paths the real discovery routes; write/submit appears ONLY
//                      when the caller proves the user may author
//
// Server component. All strings from `journal.*`. Nothing here is mock: an
// empty feed renders an honest empty state, never sample content.
//
// BEHAVIOUR PRESERVED elsewhere: search and the category filter still live in
// `ArticlesFeedClient`, which continues to serve /latest, /trending,
// /editors-picks, /case-studies, /category/*, /tag/*. The landing itself never
// had server-side search — the client filter only ever operated on the feed
// already in memory — so the landing links to /latest for the filterable list.

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ds";
import { buttonVariants } from "@/components/ds/logic";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import type { ArticleFeed, ArticleListItem, ArticleAuthorProfile } from "@/lib/articles/types";
import { EvidenceFolioSignature } from "./EvidenceFolioSignature";
import { getArticleDisplay } from "../article-display";

/** Title by locale — the SAME Persian display overlay the feed and detail
    clients apply (article-display.ts), so a Persian reader sees one title for
    one slug everywhere on the Journal. */
function displayTitle(a: ArticleListItem, isFa: boolean) {
  return getArticleDisplay(a, isFa).title;
}

/** Locale-INVARIANT protocol / platform tokens render LTR inside RTL. */
const LTR_TOKEN = /^(PLC|SCADA|HMI|OPC|MQTT|IEC|ISA|DCS|VFD|SIL|OT|IT|S7|TIA|WinCC|Modbus|Profinet|EtherNet)/i;

function Mark({ no, label }: { no: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span aria-hidden="true" className="hj-folio">{no}</span>
      <span aria-hidden="true" className="hj-rule-hair block h-px w-8" />
      <span dir="auto" className="hj-folio hj-folio-strong">{label}</span>
    </div>
  );
}

function Byline({ a, locale, t }: { a: ArticleListItem; locale: string; t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-text-secondary">
      <span dir="auto">
        <span className="text-text-muted">{t("pressroom.byAuthor")}</span>{" "}
        <Link href={`/${locale}/articles/author/${a.author.handle}`} className="ds-focus font-medium text-text-primary hover:text-brand-primary">
          {a.author.displayName}
        </Link>
        {a.author.verifiedExpert ? <span className="ms-1 text-brand-primary" title={t("detail.verifiedExpert")}>◆</span> : null}
      </span>
      {a.publishedAt ? (
        <>
          <span aria-hidden="true" className="text-text-muted">·</span>
          <time dateTime={a.publishedAt}>{formatDate(a.publishedAt, locale)}</time>
        </>
      ) : null}
      {a.readingTimeMinutes > 0 ? (
        <>
          <span aria-hidden="true" className="text-text-muted">·</span>
          <span dir="auto">{t("pressroom.readingTime", { minutes: a.readingTimeMinutes })}</span>
        </>
      ) : null}
    </p>
  );
}

export async function JournalLanding({
  feed,
  locale,
  canWrite,
}: {
  feed: ArticleFeed;
  locale: string;
  /** Proven by the caller from the session — never assumed. */
  canWrite: boolean;
}) {
  const t = await getTranslations("journal");
  const isFa = locale === "fa";

  const lead = feed.featured ?? feed.editorsPicks[0] ?? feed.latest[0] ?? null;
  const dispatch = feed.latest.filter((a) => a.id !== lead?.id).slice(0, 12);
  const disciplines = feed.categories.filter((c) => (c.articleCount ?? 0) > 0);
  const authors = feed.topAuthors.slice(0, 6);
  const empty = !lead && dispatch.length === 0;

  const folio = {
    signal: t("pressroom.folio.signal"),
    fragment: t("pressroom.folio.fragment"),
    annotation: t("pressroom.folio.annotation"),
    folio: t("pressroom.folio.folio"),
    knowledge: t("pressroom.folio.knowledge"),
    ariaLabel: t("pressroom.folio.ariaLabel"),
  };

  const catName = (c: { name: string; nameFa: string | null }) => (isFa && c.nameFa ? c.nameFa : c.name);

  return (
    <div className="hj-page">
      <div className="mx-auto w-full max-w-[78rem] px-5 md:px-10">

        {/* ═══ 01 · MASTHEAD ═══ */}
        <section aria-labelledby="journal-masthead-title" className="pt-10 md:pt-14">
          <Mark no="01" label={t("journalEyebrow")} />
          <div className="hj-rule-heavy mt-3 w-full" aria-hidden="true" />
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <span dir="auto" className="hj-folio">{t("brandUpper")}</span>
            {feed.totalArticles > 0 ? (
              <span dir="auto" className="hj-folio">
                {formatNumber(feed.totalArticles, locale)} {t("articlesUnit")}
              </span>
            ) : null}
          </div>
          <div className="hj-rule mt-2 w-full" aria-hidden="true" />

          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div className="min-w-0">
              <h1 id="journal-masthead-title" dir="auto" className="font-display text-role-h1 font-extrabold leading-[1.05] tracking-tight text-text-primary md:text-display">
                {t("brandTitle")}
              </h1>
              <p dir="auto" className="mt-5 max-w-xl text-body-lg text-text-secondary">
                {t("pressroom.standfirst")}
              </p>
              <p dir="auto" className="mt-3 max-w-xl text-body text-text-muted">
                {t("pressroom.mastheadNote")}
              </p>
            </div>
            <div className="min-w-0 self-end">
              <EvidenceFolioSignature labels={folio} />
            </div>
          </div>
        </section>

        {empty ? (
          /* ═══ honest empty state — never sample content ═══ */
          <section aria-labelledby="journal-empty-title" className="hj-rail mt-16 py-10">
            <h2 id="journal-empty-title" dir="auto" className="text-role-h3 font-bold text-text-primary">{t("pressroom.marks.empty")}</h2>
            <p dir="auto" className="mt-3 max-w-xl text-body text-text-secondary">{t("pressroom.marks.emptyBody")}</p>
          </section>
        ) : (
          <>
            {/* ═══ 02 · LEAD DOSSIER — the ONE Glass surface of the landing ═══ */}
            {lead ? (
              <section aria-labelledby="journal-lead-title" className="mt-14 md:mt-20">
                <Mark no="02" label={t("pressroom.marks.lead")} />
                <article
                  className="ds-glass-elevated mt-5 grid gap-8 rounded-lg p-6 md:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12"
                  data-hermes-signature="glass-elevated"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span dir="auto" className="hj-folio hj-folio-strong">{t(`contentType.${lead.contentType}`)}</span>
                      {lead.category ? (
                        <>
                          <span aria-hidden="true" className="text-text-muted">·</span>
                          <span dir="auto" className="hj-folio">{catName(lead.category)}</span>
                        </>
                      ) : null}
                      {lead.knowledgeMetadata?.safetyCritical ? (
                        <span className="hj-state hj-folio" data-state="safety">{t("badge.safetyCritical")}</span>
                      ) : null}
                    </div>
                    <h2 id="journal-lead-title" dir="auto" className="mt-4 font-display text-role-h2 font-bold leading-[1.12] tracking-tight text-text-primary md:text-role-h1">
                      <Link href={`/${locale}/articles/${lead.slug}`} className="ds-focus hover:text-brand-primary">
                        {displayTitle(lead, isFa)}
                      </Link>
                    </h2>
                    {(() => { const d = getArticleDisplay(lead, isFa); const s = d.subtitle ?? d.excerpt; return s ? <p dir="auto" className="mt-3 max-w-2xl text-body-lg text-text-secondary">{s}</p> : null; })()}
                    <div className="mt-5"><Byline a={lead} locale={locale} t={t} /></div>
                    <Link href={`/${locale}/articles/${lead.slug}`} className={cn(buttonVariants("primary", "lg"), "mt-6 inline-flex")}>
                      {t("readArticle")}
                    </Link>
                  </div>

                  {/* dossier margin: real provenance, or nothing */}
                  <dl className="hj-rail hj-provenance min-w-0 self-start">
                    {lead.knowledgeMetadata?.industrialDomain ? (
                      <div className="hj-provenance-row"><dt>{t("pressroom.domainLabel")}</dt><dd dir="auto" className="text-body-compact text-text-primary">{lead.knowledgeMetadata.industrialDomain}</dd></div>
                    ) : null}
                    {lead.knowledgeMetadata?.linkedTechnology ? (
                      <div className="hj-provenance-row"><dt>{t("pressroom.technologyLabel")}</dt><dd dir={LTR_TOKEN.test(lead.knowledgeMetadata.linkedTechnology) ? "ltr" : "auto"} className="text-body-compact text-text-primary">{lead.knowledgeMetadata.linkedTechnology}</dd></div>
                    ) : null}
                    {lead.knowledgeMetadata?.evidenceLevel ? (
                      <div className="hj-provenance-row"><dt>{t("pressroom.evidenceLabel")}</dt><dd className="hj-state text-body-compact text-text-primary" data-state="evidence"><span dir="auto">{lead.knowledgeMetadata.evidenceLevel}</span></dd></div>
                    ) : null}
                    {lead.knowledgeMetadata ? (
                      <div className="hj-provenance-row"><dt>{t("pressroom.reviewLabel")}</dt><dd className="hj-state text-body-compact text-text-primary" data-state={lead.knowledgeMetadata.humanReviewed ? "reviewed" : undefined}><span dir="auto">{lead.knowledgeMetadata.humanReviewed ? t("pressroom.reviewedByHuman") : t("pressroom.notReviewed")}</span></dd></div>
                    ) : null}
                    {lead.tags.length ? (
                      <div className="hj-provenance-row"><dt>{t("pressroom.filedUnder")}</dt><dd className="flex flex-wrap gap-x-3 gap-y-1">{lead.tags.slice(0, 5).map((tg) => (
                        <Link key={tg.id} href={`/${locale}/articles/tag/${tg.slug}`} dir={LTR_TOKEN.test(tg.name) ? "ltr" : "auto"} className="ds-focus text-body-compact text-text-secondary hover:text-brand-primary">{isFa && tg.nameFa ? tg.nameFa : tg.name}</Link>
                      ))}</dd></div>
                    ) : null}
                  </dl>
                </article>
              </section>
            ) : null}

            {/* ═══ 03 · DISPATCH LEDGER + 04 · DISCIPLINE INDEX ═══ */}
            <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-16 md:mt-20">
              <section aria-labelledby="journal-dispatch-title" className="min-w-0">
                <Mark no="03" label={t("pressroom.marks.dispatch")} />
                <h2 id="journal-dispatch-title" dir="auto" className="mt-3 text-role-h3 font-bold text-text-primary">{t("sections.latestArticles")}</h2>
                <p dir="auto" className="mt-1 text-body-compact text-text-muted">{t("pressroom.dispatchIntro")}</p>
                <ol className="hj-ledger mt-6">
                  {dispatch.map((a, i) => (
                    <li key={a.id} className="hj-entry" data-lead={i === 0 ? "true" : undefined}>
                      <span aria-hidden="true" className="hj-entry-no">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span dir="auto" className="hj-folio">{t(`contentType.${a.contentType}`)}</span>
                          {a.category ? <><span aria-hidden="true" className="text-text-muted">·</span><span dir="auto" className="hj-folio">{catName(a.category)}</span></> : null}
                        </div>
                        <h3 dir="auto" className={cn("mt-1.5 font-semibold leading-snug text-text-primary", i === 0 ? "text-role-h4 md:text-role-h3" : "text-title-lg")}>
                          <Link href={`/${locale}/articles/${a.slug}`} className="ds-focus hover:text-brand-primary">{displayTitle(a, isFa)}</Link>
                        </h3>
                        {a.excerpt && i < 4 ? <p dir="auto" className="mt-1.5 max-w-2xl text-body-compact text-text-secondary">{a.excerpt}</p> : null}
                        <div className="mt-2 md:hidden"><Byline a={a} locale={locale} t={t} /></div>
                      </div>
                      <div className="hidden min-w-0 md:block"><Byline a={a} locale={locale} t={t} /></div>
                    </li>
                  ))}
                </ol>
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                  <Link href={`/${locale}/articles/latest`} className="ds-focus inline-flex min-h-11 items-center gap-2 text-body-compact font-semibold text-brand-primary hover:underline">
                    {t("seeAll")}<span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                  </Link>
                </div>
              </section>

              <aside aria-labelledby="journal-disciplines-title" className="min-w-0 lg:pt-1">
                <Mark no="04" label={t("pressroom.marks.disciplines")} />
                <h2 id="journal-disciplines-title" dir="auto" className="mt-3 text-role-h4 font-bold text-text-primary">{t("sections.categories")}</h2>
                <p dir="auto" className="mt-1 text-body-compact text-text-muted">{t("pressroom.disciplinesIntro")}</p>
                {disciplines.length ? (
                  <ul className="mt-5">
                    {disciplines.map((c) => (
                      <li key={c.id} className="hj-index-row min-w-0">
                        <Link href={`/${locale}/articles/category/${c.slug}`} dir="auto" className="ds-focus min-w-0 truncate text-body text-text-primary hover:text-brand-primary">
                          {catName(c)}
                        </Link>
                        <span aria-hidden="true" className="hj-leader" />
                        <span className="hj-folio shrink-0">{formatNumber(c.articleCount ?? 0, locale)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link href={`/${locale}/articles/tags`} className="ds-focus mt-4 inline-flex min-h-11 items-center gap-2 text-body-compact font-semibold text-brand-primary hover:underline">
                  {t("nav.tags")}<span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                </Link>
              </aside>
            </div>

            {/* ═══ 05 · AUTHORITY AND PROVENANCE — a byline register ═══ */}
            {authors.length ? (
              <section aria-labelledby="journal-provenance-title" className="mt-16 md:mt-20">
                <Mark no="05" label={t("pressroom.marks.provenance")} />
                <h2 id="journal-provenance-title" dir="auto" className="mt-3 text-role-h3 font-bold text-text-primary">{t("sections.topExperts")}</h2>
                <p dir="auto" className="mt-1 max-w-2xl text-body-compact text-text-muted">{t("pressroom.provenanceIntro")}</p>
                <ul className="mt-6 grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">
                  {authors.map((au: ArticleAuthorProfile) => (
                    <li key={au.id} className="min-w-0 border-t py-4" style={{ borderColor: "var(--color-border-default)" }}>
                      <Link href={`/${locale}/articles/author/${au.handle}`} className="ds-focus group block min-w-0">
                        <span className="flex items-baseline gap-2">
                          <span dir="auto" className="text-body font-semibold text-text-primary group-hover:text-brand-primary">{au.displayName}</span>
                          {au.verifiedExpert ? <span aria-hidden="true" className="text-brand-primary">◆</span> : null}
                        </span>
                        {au.roleTitle || au.company ? (
                          <span dir="auto" className="mt-0.5 block text-body-compact text-text-secondary">
                            {[au.roleTitle, au.company].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                        {au.expertiseAreas.length ? (
                          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            {au.expertiseAreas.slice(0, 3).map((x) => (
                              <span key={x} dir={LTR_TOKEN.test(x) ? "ltr" : "auto"} className="hj-folio">{x}</span>
                            ))}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={`/${locale}/articles/authors`} className="ds-focus mt-4 inline-flex min-h-11 items-center gap-2 text-body-compact font-semibold text-brand-primary hover:underline">
                  {t("seeAll")}<span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                </Link>
              </section>
            ) : null}
          </>
        )}

        {/* ═══ 06 · PUBLICATION PATHS ═══ */}
        <section aria-labelledby="journal-paths-title" className="mt-16 pb-16 md:mt-20 md:pb-24">
          <Mark no="06" label={t("pressroom.marks.paths")} />
          <h2 id="journal-paths-title" dir="auto" className="mt-3 text-role-h4 font-bold text-text-primary">{t("pressroom.pathsIntro")}</h2>
          <ul className="mt-5 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
            {([
              { href: `/${locale}/articles/discover`, label: t("nav.discover") },
              { href: `/${locale}/articles/latest`,   label: t("nav.latest") },
              { href: `/${locale}/articles/tags`,     label: t("nav.tags") },
              ...(canWrite ? [{ href: `/${locale}/articles/write`, label: t("write") }] : []),
            ] as const).map((p) => (
              <li key={p.href} className="min-w-0 border-t" style={{ borderColor: "var(--color-border-default)" }}>
                <Link href={p.href} className="ds-focus flex min-h-11 items-center gap-2 py-3 text-body-compact font-medium text-text-secondary hover:text-brand-primary">
                  <span dir="auto" className="min-w-0">{p.label}</span>
                  <span aria-hidden="true" className="ms-auto rtl:-scale-x-100">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hj-rule-heavy mt-10 w-full" aria-hidden="true" />
        </section>
      </div>
    </div>
  );
}
