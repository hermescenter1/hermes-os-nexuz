// Corporate contact and identity blocks — shared by the Contact and About pages.
//
// Every value rendered here comes from `lib/corporate/contact` (machine and
// locale-specific identity data) or the `contact` message catalogue (labels).
// The two pages therefore cannot print different numbers, addresses or links.
//
// Telephone numbers are isolated LTR runs (`.he-num`: dir=ltr, unicode-bidi
// isolate, tabular figures) so a Persian page never reorders the digit groups.

import { getTranslations } from "next-intl/server";
import {
  CORPORATE_ADDRESS_LINES,
  CORPORATE_ADDRESS_NAME,
  CORPORATE_EMAIL,
  CORPORATE_LEGAL_NAME,
  CORPORATE_LEGAL_NAME_EN,
  CORPORATE_PHONES,
  CORPORATE_PROFILES,
  CORPORATE_REGISTRY_PLACE,
  CORPORATE_WEBSITES,
  formatIdentifier,
  type CorporateChannel,
} from "@/lib/corporate/contact";
import { DEFAULT_LOCALE, isActiveLocale, type ActiveLocale } from "@/i18n/locales";

const GROUP_HEADING =
  "font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-metadata";

const LINK_FOCUS =
  "ds-focus rounded-sm transition-colors duration-fast motion-reduce:transition-none";

function resolveLocale(locale: string): ActiveLocale {
  return isActiveLocale(locale) ? locale : DEFAULT_LOCALE;
}

/* ── Icons: decorative, aria-hidden, currentColor ───────────────────────── */

function GlobeIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11.5H3V9.75zm6.5 0h3.8v1.6h.06c.53-.95 1.84-1.95 3.78-1.95 4.04 0 4.86 2.56 4.86 5.9v5.95h-4v-5.28c0-1.26-.02-2.88-1.82-2.88-1.82 0-2.1 1.37-2.1 2.79v5.37h-4V9.75z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.9.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
    </svg>
  );
}

/* ── External link row ──────────────────────────────────────────────────── */

interface ExternalRowProps {
  href: string;
  label: string;
  ariaLabel: string;
  detail?: string;
  icon: "globe" | "linkedin" | "github";
}

function ExternalRow({ href, label, ariaLabel, detail, icon }: ExternalRowProps) {
  return (
    <li className="he-row he-row-flat">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={`he-ext ${LINK_FOCUS} text-text-secondary hover:text-text-primary`}
      >
        <span className="he-ext-icon">
          {icon === "globe" ? <GlobeIcon /> : icon === "linkedin" ? <LinkedInIcon /> : <GitHubIcon />}
        </span>
        <span className="min-w-0">
          <span className="block text-body">{label}</span>
          {detail ? (
            <span className="block font-mono text-[0.75rem] text-text-metadata" dir="ltr">
              {detail}
            </span>
          ) : null}
        </span>
      </a>
    </li>
  );
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

/** The three enquiry channels, as data for the routing map. */
export async function getCorporateChannels(locale: string) {
  const t = await getTranslations({ locale, namespace: "contact" });
  const rows: ReadonlyArray<{ ord: string; key: CorporateChannel; title: string; desc: string }> = [
    { ord: "01", key: "sales", title: t("salesTitle"), desc: t("salesDesc") },
    { ord: "02", key: "support", title: t("supportTitle"), desc: t("supportDesc") },
    { ord: "03", key: "general", title: t("generalTitle"), desc: t("generalDesc") },
  ];
  return rows.map((r) => ({
    ...r,
    email: CORPORATE_EMAIL[r.key],
    ariaLabel: t("channelEmailAria", { channel: r.title, email: CORPORATE_EMAIL[r.key] }),
  }));
}

export async function CorporatePhones({ locale }: { locale: string }) {
  const loc = resolveLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  return (
    <div>
      <h2 className={GROUP_HEADING}>{t("phoneTitle")}</h2>
      <ul className="he-registry mt-3">
        {CORPORATE_PHONES.map((phone) => (
          <li key={phone.key} className="he-row he-row-flat">
            <a
              href={`tel:${phone.e164}`}
              aria-label={t("phoneAria", { number: phone.display[loc] })}
              className={`inline-flex min-h-11 items-center font-mono text-[0.9375rem] text-text-secondary hover:text-text-primary ${LINK_FOCUS}`}
            >
              <bdi dir="ltr" className="he-num">{phone.display[loc]}</bdi>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function CorporateAddress({ locale }: { locale: string }) {
  const loc = resolveLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  const postal = formatIdentifier("postalCode", loc);
  return (
    <div>
      <h2 className={GROUP_HEADING}>{t("locationTitle")}</h2>
      <address className="mt-3 grid gap-1 text-body not-italic text-text-secondary">
        <span className="font-semibold text-text-primary">{CORPORATE_ADDRESS_NAME[loc]}</span>
        {CORPORATE_ADDRESS_LINES[loc].map((line) => (
          <span key={line}>{line}</span>
        ))}
        <span>
          {t("postalCodeLabel")}:{" "}
          <bdi dir="ltr" className="he-num">{postal}</bdi>
        </span>
      </address>
    </div>
  );
}

export async function CorporateWebsites({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "contact" });
  const sites = [
    { key: "hermes", name: t("hermesWebsiteLabel"), ...CORPORATE_WEBSITES.hermes },
    { key: "zharfa", name: t("zharfaWebsiteLabel"), ...CORPORATE_WEBSITES.zharfa },
  ];
  return (
    <div>
      <h2 className={GROUP_HEADING}>{t("websitesTitle")}</h2>
      <ul className="he-registry mt-3">
        {sites.map((s) => (
          <ExternalRow
            key={s.key}
            href={s.url}
            label={s.name}
            detail={s.host}
            icon="globe"
            ariaLabel={t("websiteAria", { name: s.name })}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Founder and company LinkedIn profiles, grouped, plus the GitHub account that
 * already appeared on this page. A profile the owner has not supplied
 * (`null`) is omitted rather than invented.
 */
export async function CorporateProfiles({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "contact" });
  const founder = t("founderLinkedInLabel");
  const company = t("zharfaLinkedInLabel");
  const github = t("githubLabel");
  const rows: ExternalRowProps[] = [
    { href: CORPORATE_PROFILES.founderLinkedIn, label: founder, icon: "linkedin", ariaLabel: t("externalAria", { label: founder }) },
    ...(CORPORATE_PROFILES.zharfaLinkedIn
      ? [{ href: CORPORATE_PROFILES.zharfaLinkedIn, label: company, icon: "linkedin" as const, ariaLabel: t("externalAria", { label: company }) }]
      : []),
    { href: CORPORATE_PROFILES.github, label: github, icon: "github", ariaLabel: t("externalAria", { label: github }) },
  ];
  return (
    <div>
      <h2 className={GROUP_HEADING}>{t("socialTitle")}</h2>
      <ul className="he-registry mt-3">
        {rows.map((r) => (
          <ExternalRow key={r.href} {...r} />
        ))}
      </ul>
    </div>
  );
}

export async function CorporateLegal({ locale }: { locale: string }) {
  const loc = resolveLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  const rows: ReadonlyArray<{ key: string; label: string; value: string; ltr: boolean }> = [
    { key: "name", label: t("legalNameLabel"), value: CORPORATE_LEGAL_NAME[loc], ltr: false },
    { key: "nameEn", label: t("legalNameEnLabel"), value: CORPORATE_LEGAL_NAME_EN, ltr: true },
    { key: "nid", label: t("nationalIdLabel"), value: formatIdentifier("nationalId", loc), ltr: true },
    { key: "reg", label: t("registrationNumberLabel"), value: formatIdentifier("registrationNumber", loc), ltr: true },
    { key: "place", label: t("registryPlaceLabel"), value: CORPORATE_REGISTRY_PLACE[loc], ltr: false },
    { key: "postal", label: t("postalCodeLabel"), value: formatIdentifier("postalCode", loc), ltr: true },
  ];
  return (
    <section aria-labelledby="corporate-legal-heading" className="min-w-0">
      <h2 id="corporate-legal-heading" className={GROUP_HEADING}>{t("legalTitle")}</h2>
      <dl className="he-legal mt-3">
        {rows.map((r) => (
          <div key={r.key} className="he-legal-row">
            <dt className="text-body-compact text-text-metadata">{r.label}</dt>
            <dd className="text-body text-text-primary">
              {r.ltr ? <bdi dir="ltr" className="he-num">{r.value}</bdi> : r.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 max-w-[34rem] text-body-compact text-text-secondary">{t("brandRelation")}</p>
    </section>
  );
}
