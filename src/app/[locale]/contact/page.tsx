// PHASE 104-I1 — THE HERMES ENGINEERING ENGAGEMENT PROTOCOL.
//
// The composition this replaces was a template: a PageIntro, three EQUAL cards
// each led by an emoji, then two flag-emoji lists and the form — all in
// pre-104 legacy tokens (`text-ink`, `border-line`, `bg-surface`).
//
// An enquiry to an engineering company is not three interchangeable boxes: it
// is TRIAGED. So the page is drawn as the routing path an enquiry actually
// travels, read top to bottom:
//
//   1  PROTOCOL PLATE     what this page is, on the Company rail
//   2  ROUTING MAP        one spine; Sales / Technical / General branch off it
//                         as numbered channels, each stating what it handles
//                         and its own verified address — a triage path, not a
//                         card deck
//   3  CONTACT REGISTRY   the verified phone numbers and sites as a ruled
//                         register with ISO country marks (no flag emoji)
//   4  COMMAND SURFACE    the existing form, framed as the submit instrument
//   5  NETWORK PATHS      the verified external profiles
//
// Truthfulness: every address, number, location and URL is the existing
// `contact` catalogue value (39 keys, already at en/de/fa parity). This
// increment adds NO key and invents no address, phone, capability or response
// time — there is no SLA claim anywhere on the page, because the catalogue
// does not contain one. `<ContactForm />` is imported UNCHANGED: its fields,
// validation, submit handler, API call and error/success states are untouched.
//
// Every rule and node is aria-hidden; the channels and registry are real
// lists; exactly one H1; all spacing and borders are logical so RTL mirrors.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { ContactForm } from "./ContactForm";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/contact",
    title:       p.contact.title,
    description: p.contact.description,
    keywords:    p.contact.keywords,
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");

  /* The three triage channels. Ordinals are structure; every label,
     description and address is a catalogue value. */
  const channels = [
    { ord: "01", title: t("salesTitle"),   desc: t("salesDesc"),   email: t("salesEmail") },
    { ord: "02", title: t("supportTitle"), desc: t("supportDesc"), email: t("supportEmail") },
    { ord: "03", title: t("generalTitle"), desc: t("generalDesc"), email: t("generalEmail") },
  ];

  /* Verified contact points. `mark` is the ISO 3166 alpha-2 code set in the
     mono face — a country mark that renders identically everywhere, unlike the
     flag emoji the previous page used. `tel:` targets are the shipped numbers. */
  const phones = [
    { mark: "IR", label: t("phoneIran"), href: "tel:+989134116492" },
    { mark: "GB", label: t("phoneUK"),   href: "tel:+447960545833" },
  ];
  const sites = [
    { mark: "IR", label: t("locationIran") },
    { mark: "GB", label: t("locationUK") },
  ];
  const profiles = [
    { label: t("linkedinLabel"), url: t("linkedinUrl") },
    { label: t("githubLabel"),   url: t("githubUrl") },
    { label: t("websiteLabel"),  url: t("websiteUrl") },
  ];

  return (
    <PublicPageShell visualMode="company">
      {/* ── 1 · PROTOCOL PLATE ───────────────────────────────────────────── */}
      <section className="he-plate">
        <div className="mx-auto w-full max-w-[78rem] px-5 pb-12 pt-10 md:px-10 md:pb-14 md:pt-14">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-text-metadata">
            {t("eyebrow")}
          </p>
          {/* the approved fluid pattern: role-h1 at mobile, display only from md */}
          <h1 className="mt-4 max-w-[44rem] text-role-h1 font-extrabold leading-[1.05] tracking-tight text-text-primary md:text-display">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[38rem] text-body-lg text-text-secondary">{t("lede")}</p>
        </div>
      </section>

      {/* ── 2 · ROUTING MAP ──────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[78rem] px-5 py-12 md:px-10 md:py-16">
        <ul className="he-route">
          {channels.map((c) => (
            <li key={c.ord} className="he-channel">
              <span aria-hidden="true" className="he-node" />
              <div className="min-w-0">
                <span className="he-ord" dir="ltr">{c.ord}</span>
                <h2 className="mt-1 text-body-lg font-semibold text-text-primary">{c.title}</h2>
              </div>
              <p className="min-w-0 text-body text-text-secondary">{c.desc}</p>
              <a
                href={"mailto:" + c.email}
                className="ds-focus inline-flex min-h-11 items-center rounded-sm font-mono text-[0.8125rem] text-brand-primary transition-colors duration-fast hover:text-text-primary motion-reduce:transition-none"
                dir="ltr"
              >
                {c.email}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 3 · CONTACT REGISTRY  +  4 · COMMAND SURFACE ─────────────────── */}
      <section className="he-plate">
        <div className="mx-auto grid w-full max-w-[78rem] gap-10 px-5 py-12 md:px-10 md:py-16 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <div>
              <h2 className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-metadata">
                {t("phoneTitle")}
              </h2>
              <ul className="he-registry mt-3">
                {phones.map((ph) => (
                  <li key={ph.mark} className="he-row">
                    <span aria-hidden="true" className="he-mark">{ph.mark}</span>
                    <a
                      href={ph.href}
                      className="ds-focus inline-flex min-h-11 items-center rounded-sm font-mono text-[0.8125rem] text-text-secondary transition-colors duration-fast hover:text-text-primary motion-reduce:transition-none"
                      dir="ltr"
                    >
                      {ph.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-metadata">
                {t("locationTitle")}
              </h2>
              <ul className="he-registry mt-3">
                {sites.map((s) => (
                  <li key={s.mark} className="he-row">
                    <span aria-hidden="true" className="he-mark">{s.mark}</span>
                    <span className="text-body text-text-secondary">{s.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── 5 · NETWORK PATHS ──────────────────────────────────────── */}
            <div>
              <h2 className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-metadata">
                {t("socialTitle")}
              </h2>
              <ul className="he-registry mt-3">
                {profiles.map((pr) => (
                  <li key={pr.label} className="he-row">
                    <span aria-hidden="true" className="he-mark">EXT</span>
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ds-focus inline-flex min-h-11 items-center rounded-sm text-body text-text-secondary transition-colors duration-fast hover:text-text-primary motion-reduce:transition-none"
                    >
                      {pr.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* The submit instrument. ContactForm is imported unchanged: fields,
              validation, submit behaviour, API call and error/success states
              are exactly as shipped. */}
          <div className="he-command min-w-0">
            <p className="he-command-head">{t("formTitle")}</p>
            <ContactForm />
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
