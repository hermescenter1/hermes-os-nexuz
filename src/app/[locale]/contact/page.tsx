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
//   3  CONTACT REGISTRY   the verified phone numbers, the registered address,
//                         both websites — ruled rows, LTR-isolated numbers
//   4  COMMAND SURFACE    the existing form, framed as the submit instrument
//   5  NETWORK PATHS      the verified external profiles
//   6  LEGAL INFORMATION  registered identity, from lib/corporate/contact
//
// Truthfulness: every mailbox, number, address, identifier and URL is read from
// the canonical corporate source (`lib/corporate/contact`); labels are `contact`
// catalogue values. Nothing is invented — there is no SLA claim anywhere on the
// page, and a profile the owner has not supplied is omitted, never guessed. `<ContactForm />` is imported UNCHANGED: its fields,
// validation, submit handler, API call and error/success states are untouched.
//
// Every rule and node is aria-hidden; the channels and registry are real
// lists; exactly one H1; all spacing and borders are logical so RTL mirrors.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { ContactForm } from "./ContactForm";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  CorporateAddress,
  CorporateLegal,
  CorporatePhones,
  CorporateProfiles,
  CorporateWebsites,
  getCorporateChannels,
} from "@/components/corporate/CorporateBlocks";

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

  /* The three triage channels. Mailboxes come from the canonical corporate
     source (`lib/corporate/contact`); titles and descriptions are catalogue
     values. */
  const channels = await getCorporateChannels(locale);

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
                aria-label={c.ariaLabel}
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
            <CorporatePhones locale={locale} />
            <CorporateAddress locale={locale} />
            <CorporateWebsites locale={locale} />
            {/* ── 5 · NETWORK PATHS ──────────────────────────────────────── */}
            <CorporateProfiles locale={locale} />
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

      {/* ── 6 · LEGAL INFORMATION ────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[78rem] px-5 py-12 md:px-10 md:py-16">
        <CorporateLegal locale={locale} />
      </section>
    </PublicPageShell>
  );
}
