/**
 * ATS — the candidate privacy notice (legal draft), rendered for real.
 *
 *   - the three catalogs carry the same notice: identical keys, identical
 *     placeholders and rich tags, German genuinely German, Persian in Persian
 *     script with Persian ی/ک;
 *   - every one of the nine required sections is rendered in every locale,
 *     with the five named rights;
 *   - it is visibly marked as a legal DRAFT, is `noindex`, and claims no legal
 *     compliance;
 *   - its concrete claims are tied to the code: the version shown is the
 *     consent version intake records, the contact is the published
 *     organisation contact, and every right it names is a request type the
 *     Data Request Center accepts;
 *   - the application form and the general privacy policy link to it.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import en from "../../../../../../messages/en.json";
import fa from "../../../../../../messages/fa.json";
import de from "../../../../../../messages/de.json";
import { CONTACT_EMAIL, ORG_NAME } from "@/lib/seo/config";
import { RECRUITMENT_CONSENT_VERSION } from "@/lib/ats/policy";

type Locale = "en" | "fa" | "de";
const CAT = { en, fa, de } as unknown as Record<Locale, Record<string, unknown>>;

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
    createTranslator({ locale, messages: CAT[locale] as never, namespace: namespace as never }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
import React from "react";
import CandidatePrivacyPage, { generateMetadata } from "../page";

const REPO = process.cwd();
const LOCALES: Locale[] = ["en", "fa", "de"];

function flat(o: unknown, p = ""): Array<[string, string]> {
  if (typeof o === "string") return [[p, o]];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k));
}
const notice = (l: Locale) => new Map(flat((CAT[l] as { careers: { privacy: unknown } }).careers.privacy));
const placeholders = (s: string) => [...s.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");
const tags = (s: string) => [...s.matchAll(/<\/?([a-z]+)>/g)].map((m) => m[0]).sort().join("|");

async function render(locale: Locale): Promise<string> {
  const el = await CandidatePrivacyPage({ params: Promise.resolve({ locale }) });
  return renderToStaticMarkup(el);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the three catalogs carry the same notice", () => {
  it("identical keys, placeholders and rich tags in en, fa and de", () => {
    const e = notice("en");
    for (const l of ["fa", "de"] as const) {
      const other = notice(l);
      expect([...other.keys()].sort(), l).toEqual([...e.keys()].sort());
      for (const [k, v] of e) {
        expect(placeholders(other.get(k)!), `${l}:${k}`).toBe(placeholders(v));
        expect(tags(other.get(k)!), `${l}:${k}`).toBe(tags(v));
      }
    }
    expect(e.size).toBeGreaterThanOrEqual(60);
  });

  it("German is genuinely German — no leaf equals its English source", () => {
    const e = notice("en");
    const d = notice("de");
    expect([...e].filter(([k, v]) => d.get(k) === v).map(([k]) => k)).toEqual([]);
  });

  it("Persian is in Persian script with Persian ی and ک, never Arabic ي or ك", () => {
    for (const [k, v] of notice("fa")) {
      expect(v, k).toMatch(/[؀-ۿ]/);
      expect(v, k).not.toMatch(/[يك]/);
    }
  });
});

describe.each(LOCALES)("the rendered notice (%s)", (locale) => {
  it("renders all nine required sections and the five named rights", async () => {
    const html = await render(locale);
    const n = notice(locale);
    for (let i = 1; i <= 9; i++) expect(html, `s${i}`).toContain(n.get(`s${i}.title`)!);
    const body = text(html);
    for (const right of ["access", "correction", "deletion", "objection", "withdraw"]) {
      expect(body, right).toContain(n.get(`s6.${right}`)!);
    }
    // AI screening that never decides, and the human decision
    expect(body).toContain(n.get("s2.p4")!);
    expect(body).toContain(n.get("s3.p1")!);
  });

  it("is visibly marked as a legal DRAFT", async () => {
    const html = await render(locale);
    const n = notice(locale);
    expect(html).toContain('data-legal-status="draft"');
    expect(html).toMatch(/role="note"/);
    expect(html).toContain(n.get("draftBadge")!);
    expect(html).toContain(n.get("draftNotice")!);
  });

  it("shows the consent version intake records, the published contact and the real request route", async () => {
    const html = await render(locale);
    expect(html).toContain(RECRUITMENT_CONSENT_VERSION);
    expect(html).toContain(ORG_NAME);
    expect(html).toContain(`href="mailto:${CONTACT_EMAIL}"`);
    expect(html).toContain(CONTACT_EMAIL);
    expect(html.match(/href="\/data-request"/g) ?? []).toHaveLength(2);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/careers"');
  });

  it("is noindex while it is a draft", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    const robots = meta.robots as { index?: boolean; follow?: boolean };
    expect(robots.index).toBe(false);
    expect(String(meta.title ?? "")).toContain(notice(locale).get("metaTitle")!);
  });
});

describe("no claim of legal compliance", () => {
  it("the English notice never says it complies, only that it is not a statement of compliance", () => {
    const all = [...notice("en").values()].join(" ");
    expect(all).not.toMatch(/\bcompl(ies|iant)\b|in compliance with|fully (meets|satisfies)|certified/i);
    expect(notice("en").get("draftNotice")).toMatch(/not a statement or guarantee of compliance/);
  });

  it("the page source hard-codes neither a legal claim nor the contact details", () => {
    const src = readFileSync(join(REPO, "src/app/[locale]/careers/privacy/page.tsx"), "utf8");
    expect(src).not.toMatch(/GDPR|compliant|@hermesnovin\.com|Novin Mehr/);
    expect(src).toContain("noIndex: true");
  });
});

describe("every right it names is a request type the Data Request Center accepts", () => {
  it("access, correction, deletion, objection and consent withdrawal are all valid types", () => {
    const route = readFileSync(join(REPO, "src/app/api/compliance/privacy-requests/route.ts"), "utf8");
    for (const type of ["ACCESS_REQUEST", "CORRECTION_REQUEST", "DATA_DELETION", "OBJECTION", "CONSENT_WITHDRAWAL", "RESTRICTION", "DATA_EXPORT"]) {
      expect(route, type).toContain(`"${type}"`);
    }
  });
});

describe("the notice is reachable from where applicants decide", () => {
  it("the application form's acknowledgement links to it", () => {
    const form = readFileSync(join(REPO, "src/components/careers/Stage1ApplicationForm.tsx"), "utf8");
    expect(form).toContain('href="/careers/privacy"');
    expect(form).not.toMatch(/href="\/privacy"/);
  });

  it("the general privacy policy points candidates to it", () => {
    const general = readFileSync(join(REPO, "src/app/[locale]/privacy/page.tsx"), "utf8");
    expect(general).toContain('href="/careers/privacy"');
  });
});
