import { setRequestLocale, getTranslations } from "next-intl/server";
import { ManageCookiePreferencesButton } from "@/components/compliance/ManageCookiePreferencesButton";
import { PublicPageShell } from "@/components/public-site";
import { Link }           from "@/i18n/navigation";
import { buildMetadata }  from "@/lib/seo/metadata";
import { ORG_NAME, SITE_NAME, CONTACT_EMAIL } from "@/lib/seo/config";
import {
  CATEGORY_ORDER,
  COOKIE_POLICY_VERSION,
  THIRD_PARTY_INVENTORY,
  storageForCategory,
  type ConsentCategory,
  type StorageEntry,
} from "@/lib/compliance/cookie-inventory";

/**
 * PHASE 113 — the Cookie Policy.
 *
 * ── WHY THE CONTENT IS BUILT THIS WAY (113 original) ────────────────────────
 * The page this replaced was 52 lines of hard-coded English inside a
 * locale-parameterised route, and its facts were wrong in ways that matter for
 * a legal document: it named `marketing_consent` and `ui_prefs` (neither exists
 * in this repository) and `access_token` (the real cookie is `hermes_at`), it
 * claimed CSRF cookies the platform does not set, it never mentioned Microsoft
 * Clarity, Google Analytics/GTM, ProvenExpert or the `localStorage` mirror, and
 * it told readers to reopen a banner that could never reappear.
 *
 * So no cookie name, retention period or consent gate is prose here. Names and
 * lifetimes come from `lib/compliance/cookie-inventory`, which imports the
 * constants the platform actually sets; the company name comes from
 * `lib/seo/config`; the category vocabulary is the SAME catalog the consent
 * dialog renders, so the policy and the dialog cannot name the categories
 * differently. Only sentences live in `messages/*.json`.
 *
 * ── WHY THE PRESENTATION WAS REBUILT (113-A) ────────────────────────────────
 * The first implementation was rejected on design: every category and every
 * third party sat in its own rounded card, the controls were large pills, and
 * fourteen sections of legal text arrived as a dozen separate bubbles — a SaaS
 * dashboard, not a legal instrument.
 *
 * This is a DOCUMENT. One reading column at a measured width, a numbered
 * section index, hairline rules instead of containers, and a real table for the
 * inventory. The visual system lives in `globals.css` under the `hz-` prefix,
 * scoped entirely to `.hz-legal`: its palette, its 8px corner ceiling and its
 * contrast law are read from the owner's own ZHARFA corporate repository, and
 * the provenance plus what was deliberately NOT carried over is recorded there
 * and in `docs/release/phase113-cookie-visual-system.md`.
 *
 * The LEGAL CONTENT and the CONSENT LOGIC are unchanged by the redesign. The
 * only additions are an explicit "changes to this policy" section, a contents
 * index, and two table columns (category, who sets it) — each backed by data
 * that already existed.
 *
 * The withdrawal control is not a second consent dialog — see
 * `components/compliance/cookie-preferences.ts`.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/cookies", title: p.cookies.title, description: p.cookies.description, keywords: p.cookies.keywords });
}

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY  = 60 * 60 * 24;

/**
 * The fourteen sections, in reading order, as ONE list.
 *
 * The contents index and the document body both render from this array, so a
 * section can never appear in the index without existing, or exist without
 * being indexed. `kind` selects the body renderer; `category` carries which of
 * the four consent categories a category section is about.
 */
type SectionKind =
  | "intro" | "controller" | "category" | "basis" | "storage"
  | "thirdParty" | "withdrawal" | "browserControls" | "contact"
  | "updates" | "privacyPolicy";

interface DocSection {
  id: string;
  kind: SectionKind;
  /** Heading key under `cookiePolicy`, or absent when the heading is a category label. */
  headingKey?: string;
  category?: ConsentCategory;
}

const SECTIONS: readonly DocSection[] = [
  { id: "what-are-cookies",  kind: "intro",           headingKey: "intro.heading" },
  { id: "responsible",       kind: "controller",      headingKey: "controller.heading" },
  ...CATEGORY_ORDER.map((category): DocSection => ({
    id: `category-${category}`,
    kind: "category",
    category,
  })),
  { id: "legal-basis",       kind: "basis",           headingKey: "basis.heading" },
  { id: "retention",         kind: "storage",         headingKey: "storage.heading" },
  { id: "third-parties",     kind: "thirdParty",      headingKey: "thirdParty.heading" },
  { id: "withdrawal",        kind: "withdrawal",      headingKey: "withdrawal.heading" },
  { id: "browser-controls",  kind: "browserControls", headingKey: "browserControls.heading" },
  { id: "contact",           kind: "contact",         headingKey: "contact.heading" },
  { id: "updates",           kind: "updates",         headingKey: "updates.heading" },
  { id: "privacy-policy",    kind: "privacyPolicy",   headingKey: "privacyPolicy.heading" },
];

/** Two-digit ordinal, locale-independent so it reads as a document number. */
const ordinal = (i: number) => String(i + 1).padStart(2, "0");

export default async function CookiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "cookiePolicy" });
  // The category names and descriptions the CONSENT DIALOG uses. Read from that
  // namespace on purpose: a reader comparing the policy with the dialog must see
  // the same four names, and a second copy here would be a second thing to keep
  // in step. (`adminGovernance` is a historical namespace name; these particular
  // leaves are the public consent vocabulary.)
  const tc = await getTranslations({ locale, namespace: "adminGovernance.cookieConsent" });

  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });

  const headingFor = (s: DocSection) =>
    s.category ? tc(`categories.${s.category}.label`) : t(s.headingKey as string);

  /**
   * Retention, rendered from the value the platform actually sets. Hours below a
   * day, days above it, and "no expiry" for storage that genuinely has none —
   * never an estimate, and never a duration invented to fill the column.
   */
  function retention(entry: StorageEntry): string {
    if (entry.maxAgeSeconds === null) return t("storage.retentionUntilCleared");

    const base =
      entry.maxAgeSeconds < SECONDS_PER_DAY
        ? t("storage.retentionHours", { count: entry.maxAgeSeconds / SECONDS_PER_HOUR })
        : t("storage.retentionDays",  { count: entry.maxAgeSeconds / SECONDS_PER_DAY });

    if (entry.extendedMaxAgeSeconds === undefined) return base;

    return `${base} — ${t("storage.retentionExtended", {
      count: entry.extendedMaxAgeSeconds / SECONDS_PER_DAY,
    })}`;
  }

  /* ── Inventory table ─────────────────────────────────────────────────────
     One table shape for both inventories. Every cell carries `data-label`, so
     below 768px the same markup re-flows into labelled stacked rows: nothing is
     hidden, and there is no horizontal scroll to trap a thumb. */
  const COLS = {
    name:      t("table.colName"),
    purpose:   t("table.colPurpose"),
    category:  t("table.colCategory"),
    retention: t("table.colRetention"),
    provider:  t("table.colProvider"),
    scope:     t("table.colScope"),
  };

  function StorageTable({ entries, caption }: { entries: readonly StorageEntry[]; caption: string }) {
    return (
      <div className="hz-table-wrap">
        <table className="hz-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{COLS.name}</th>
              <th scope="col">{COLS.purpose}</th>
              <th scope="col">{COLS.retention}</th>
              <th scope="col">{COLS.provider}</th>
              <th scope="col">{COLS.scope}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.name}>
                <th scope="row" data-label={COLS.name}>
                  <span>
                    <code className="hz-code">{entry.name}</code>
                    <span className="hz-medium">
                      {entry.medium === "cookie" ? t("storage.mediumCookie") : t("storage.mediumLocalStorage")}
                    </span>
                  </span>
                </th>
                <td data-label={COLS.purpose}><span>{t(`storage.${entry.purposeKey}`)}</span></td>
                <td data-label={COLS.retention}><span>{retention(entry)}</span></td>
                {/* First-party storage: the platform sets it. Read from the
                    canonical product constant, never retyped per row. */}
                <td data-label={COLS.provider}><span>{SITE_NAME}</span></td>
                <td data-label={COLS.scope}>
                  <span>{entry.authenticatedOnly ? t("storage.scopeAuthenticated") : t("storage.scopeAll")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <PublicPageShell ambient={1}>
      <div className="mx-auto w-full max-w-[86rem] px-4 py-8 sm:px-6 sm:py-12">
        <article className="hz-legal" lang={locale}>
          {/* ── MASTHEAD ── title, lede, version stamp, one control. No oval. */}
          <header className="hz-masthead">
            <p className="hz-eyebrow">{t("eyebrow")}</p>
            <h1 className="hz-title">{t("title")}</h1>
            <p className="hz-lede">{t("intro.body")}</p>

            <div className="hz-masthead-foot">
              <dl className="hz-stamp">
                <div>
                  <dt>{t("versionLabel")}</dt>
                  <dd>{COOKIE_POLICY_VERSION}</dd>
                </div>
                <div>
                  <dt>{t("effectiveLabel")}</dt>
                  <dd>{t("effective")}</dd>
                </div>
              </dl>
              <ManageCookiePreferencesButton className="hz-btn hz-btn-primary" />
            </div>
          </header>

          <div className="hz-body">
            {/* ── CONTENTS ── sticky margin index above 1024px; a native
                <details> disclosure below it, so it is keyboard- and
                screen-reader-operable with no JavaScript and no ARIA. */}
            <nav aria-labelledby="hz-toc-heading">
              <details className="hz-toc" open>
                <summary id="hz-toc-heading">
                  <span className="lg:hidden">{t("toc.mobileLabel")}</span>
                  <span className="hidden lg:inline">{t("toc.heading")}</span>
                </summary>
                <ol>
                  {SECTIONS.map((section) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`}>{headingFor(section)}</a>
                    </li>
                  ))}
                </ol>
              </details>
            </nav>

            <div className="hz-doc">
              {SECTIONS.map((section, index) => (
                <section key={section.id} id={section.id} className="hz-section">
                  <h2>
                    <span className="hz-ord" aria-hidden="true">{ordinal(index)}</span>
                    <span>{headingFor(section)}</span>
                  </h2>

                  {/* 01 — what cookies and browser storage are, and how the rest
                      of this document is organised. `categories.intro` lives here
                      rather than over a "Categories" umbrella heading: the four
                      categories are now four numbered sections of their own, so
                      the sentence that explains the structure belongs with the
                      other orientation copy. */}
                  {section.kind === "intro" ? (
                    <>
                      <p>{t("intro.storageBody")}</p>
                      <p>{t("categories.intro")}</p>
                    </>
                  ) : null}

                  {/* 02 — the responsible company, and how it relates to the product */}
                  {section.kind === "controller" ? (
                    <>
                      <p>{t("controller.body")}</p>
                      <dl className="hz-facts">
                        <div>
                          <dt>{t("controller.companyLabel")}</dt>
                          <dd>{ORG_NAME}</dd>
                        </div>
                        <div>
                          <dt>{t("controller.productLabel")}</dt>
                          <dd>{SITE_NAME}</dd>
                        </div>
                        <div>
                          <dt>{t("controller.contactLabel")}</dt>
                          <dd>
                            <a dir="ltr" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : null}

                  {/* 03-06 — one section per consent category, with what it stores */}
                  {section.kind === "category" && section.category ? (
                    <CategoryBody category={section.category} />
                  ) : null}

                  {/* 07 — legal / consent basis, split by whether consent applies */}
                  {section.kind === "basis" ? (
                    <>
                      <h3>{t("basis.necessaryTitle")}</h3>
                      <p>{t("basis.necessaryBody")}</p>
                      <h3>{t("basis.optionalTitle")}</h3>
                      <p>{t("basis.optionalBody")}</p>
                    </>
                  ) : null}

                  {/* 08 — storage and retention, as one complete table */}
                  {section.kind === "storage" ? (
                    <>
                      <p>{t("storage.body")}</p>
                      <StorageTable
                        entries={CATEGORY_ORDER.flatMap((c) => storageForCategory(c))}
                        caption={t("table.caption")}
                      />
                    </>
                  ) : null}

                  {/* 09 — third parties, each with the consent gate the CODE enforces */}
                  {section.kind === "thirdParty" ? (
                    <>
                      <p>{t("thirdParty.body")}</p>
                      <div className="hz-table-wrap">
                        <table className="hz-table">
                          <caption>{t("thirdParty.heading")}</caption>
                          <thead>
                            <tr>
                              <th scope="col">{COLS.name}</th>
                              <th scope="col">{COLS.purpose}</th>
                              <th scope="col">{COLS.category}</th>
                              <th scope="col">{COLS.retention}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THIRD_PARTY_INVENTORY.map((service) => (
                              <tr key={service.key}>
                                <th scope="row" data-label={COLS.name}>
                                  <span>
                                    {t(`thirdParty.${service.key}.name`)}
                                    <span className="hz-medium">
                                      <a href={service.privacyUrl} target="_blank" rel="noopener noreferrer">
                                        {t("thirdParty.privacyLinkLabel")}
                                      </a>
                                    </span>
                                  </span>
                                </th>
                                <td data-label={COLS.purpose}>
                                  <span>
                                    {t(`thirdParty.${service.key}.purpose`)}
                                    {service.requiresConfiguration ? (
                                      <span className="hz-medium">{t("thirdParty.configurationNote")}</span>
                                    ) : null}
                                  </span>
                                </td>
                                <td data-label={COLS.category}>
                                  <span>
                                    {t("thirdParty.gateLabel", {
                                      categories: list.format(
                                        service.gatedBy.map((c) => tc(`categories.${c}.label`)),
                                      ),
                                    })}
                                  </span>
                                </td>
                                {/* We do not know, and therefore do not state, a
                                    third party's own cookie lifetimes. */}
                                <td data-label={COLS.retention}>
                                  <span>{t("storage.retentionProviderDefined")}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p>{t("thirdParty.badgeNote")}</p>
                    </>
                  ) : null}

                  {/* 10 — withdrawal: the control that makes the instruction true */}
                  {section.kind === "withdrawal" ? (
                    <>
                      <p>{t("withdrawal.body")}</p>
                      <p>
                        <ManageCookiePreferencesButton className="hz-btn hz-btn-secondary" />
                      </p>
                      <p>{t("withdrawal.effectNote")}</p>
                      <p>{t("withdrawal.repeatNote")}</p>
                    </>
                  ) : null}

                  {/* 11 — the controls that exist outside this site */}
                  {section.kind === "browserControls" ? (
                    <>
                      <p>{t("browserControls.body")}</p>
                      <p>{t("browserControls.resetNote")}</p>
                    </>
                  ) : null}

                  {/* 12 — contact channel */}
                  {section.kind === "contact" ? (
                    <>
                      <p>{t("contact.body")}</p>
                      <p>
                        <a dir="ltr" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                      </p>
                    </>
                  ) : null}

                  {/* 13 — how this policy changes, and what that means for consent */}
                  {section.kind === "updates" ? <p>{t("updates.body")}</p> : null}

                  {/* 14 — the related policy, linked in the reader's own locale */}
                  {section.kind === "privacyPolicy" ? (
                    <>
                      <p>{t("privacyPolicy.body")}</p>
                      <p>
                        <Link href="/privacy">{t("privacyPolicy.cta")}</Link>
                      </p>
                    </>
                  ) : null}
                </section>
              ))}

              {/* Localized closing links. The shared legal shell prints this row
                  in English on every locale; this page carries its own. */}
              <div className="hz-related">
                <Link href="/privacy">{t("privacyPolicy.cta")}</Link>
                <a dir="ltr" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>
            </div>
          </div>
        </article>
      </div>
    </PublicPageShell>
  );

  /** One consent category: its description, its status, and what it stores. */
  function CategoryBody({ category }: { category: ConsentCategory }) {
    const entries = storageForCategory(category);
    const necessary = category === "necessary";
    return (
      <>
        <p>
          <span className="hz-chip" data-locked={necessary ? "true" : "false"}>
            {necessary ? t("categories.alwaysOn") : t("categories.optIn")}
          </span>
        </p>
        <p>{tc(`categories.${category}.desc`)}</p>
        {entries.length > 0 ? (
          <StorageTable entries={entries} caption={t("table.caption")} />
        ) : (
          <p>{t("categories.noneStored")}</p>
        )}
      </>
    );
  }
}
