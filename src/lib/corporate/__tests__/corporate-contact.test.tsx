/**
 * Corporate contact + legal identity — regression gate.
 *
 * Renders the REAL Contact and About pages in fa/en/de (shell and form stubbed)
 * and asserts the published truth: mailboxes, the two telephone lines, the one
 * registered address, both websites, both LinkedIn identities, the legal
 * block, and the absence of every retired value. Also pins the JSON-LD graph
 * to the same canonical source.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import {
  CORPORATE_EMAIL,
  CORPORATE_IDENTIFIERS,
  CORPORATE_PHONES,
  CORPORATE_PROFILES,
  CORPORATE_WEBSITES,
} from "../contact";
import { organizationSchema, founderSchema } from "@/lib/seo/schemas";
import { ORG_NAME, ORG_SAME_AS, FOUNDER_SAME_AS } from "@/lib/seo/config";

type Locale = "en" | "fa" | "de";
const CAT = { en, fa, de } as unknown as Record<Locale, Record<string, unknown>>;
const LOCALES: Locale[] = ["fa", "en", "de"];

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (arg: string | { locale: Locale; namespace: string }) => {
    const locale = (typeof arg === "string" ? currentLocale : arg.locale) as Locale;
    const namespace = typeof arg === "string" ? arg : arg.namespace;
    return createTranslator({ locale, messages: CAT[locale] as never, namespace: namespace as never });
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/components/public-site", () => ({
  PublicPageShell: ({ children }: { children?: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../../app/[locale]/contact/ContactForm", () => ({ ContactForm: () => <form data-stub="contact-form" /> }));

import React from "react";
import ContactPage from "../../../app/[locale]/contact/page";
import AboutPage from "../../../app/[locale]/about/page";

let currentLocale: Locale = "en";

/**
 * Expands (possibly async) function components into plain elements so the
 * synchronous static renderer can serialise the whole page. Only the page's own
 * hook-free server components reach this; host elements are cloned as they are.
 */
async function expand(node: React.ReactNode): Promise<React.ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(expand));
  if (!React.isValidElement(node)) return node;
  const el = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof el.type === "function") {
    const out = await (el.type as (p: unknown) => unknown)(el.props);
    return expand(out as React.ReactNode);
  }
  // host elements and fragments: expand their children in place
  const kids = el.props.children;
  if (kids === undefined) return el;
  const expanded = await expand(kids);
  return React.cloneElement(el, undefined, ...(Array.isArray(expanded) ? expanded : [expanded]));
}

async function render(page: typeof ContactPage, locale: Locale): Promise<string> {
  currentLocale = locale;
  const el = await page({ params: Promise.resolve({ locale }) });
  return renderToStaticMarkup((await expand(el)) as React.ReactElement);
}
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("canonical source", () => {
  it("routes each channel to exactly the required mailbox", () => {
    expect(CORPORATE_EMAIL).toEqual({
      sales: "sales@hermesnovin.com",
      support: "info@hermesnovin.com",
      general: "info@zharfavira.com",
    });
  });

  it("holds exactly the two required telephone lines, E.164 and per-locale display", () => {
    expect(CORPORATE_PHONES.map((p) => p.e164)).toEqual(["+982191096003", "+982191096005"]);
    expect(CORPORATE_PHONES.map((p) => p.display.fa)).toEqual(["۰۲۱ ۹۱۰۹ ۶۰۰۳", "۰۲۱ ۹۱۰۹ ۶۰۰۵"]);
    expect(CORPORATE_PHONES.map((p) => p.display.en)).toEqual(["021 9109 6003", "021 9109 6005"]);
    expect(CORPORATE_PHONES.map((p) => p.display.de)).toEqual(["021 9109 6003", "021 9109 6005"]);
  });

  it("holds the owner-supplied ZHARFA LinkedIn URL and publishes it as sameAs", () => {
    expect(CORPORATE_PROFILES.zharfaLinkedIn).toBe("https://www.linkedin.com/company/zharfa-vira/");
    expect(ORG_SAME_AS).toEqual(["https://www.linkedin.com/company/zharfa-vira/"]);
  });
});

describe.each(LOCALES)("Contact page (%s)", (locale) => {
  it("links each channel by mailto: to the right mailbox", async () => {
    const h = hrefs(await render(ContactPage, locale));
    expect(h).toContain("mailto:sales@hermesnovin.com");
    expect(h).toContain("mailto:info@hermesnovin.com");
    expect(h).toContain("mailto:info@zharfavira.com");
  });

  it("publishes only the two new numbers, as tel: links and isolated LTR runs", async () => {
    const html = await render(ContactPage, locale);
    const tel = hrefs(html).filter((x) => x.startsWith("tel:"));
    expect(tel).toEqual(["tel:+982191096003", "tel:+982191096005"]);
    for (const p of CORPORATE_PHONES) {
      expect(html).toContain(`<bdi dir="ltr" class="he-num">${p.display[locale]}</bdi>`);
    }
    // every other digit run that looks like a phone number is absent
    expect(text(html)).not.toMatch(/\+\s?44|913\s?411|796\s?054|۹۱۳ ۴۱۱|۷۹۶ ۰۵۴/);
  });

  it("shows the single registered address and postal code, and no London office", async () => {
    const body = text(await render(ContactPage, locale));
    expect(body).toContain(locale === "fa" ? "کد پستی" : locale === "de" ? "Postleitzahl" : "Postal Code");
    expect(body).toContain(locale === "fa" ? "۸۱۷۹۶۷۹۴۹۵" : CORPORATE_IDENTIFIERS.postalCode);
    expect(body).toMatch(locale === "fa" ? /اصفهان، خیابان جانبازان/ : /Janbazan St\., Isfahan, Iran/);
    expect(body).not.toMatch(/London|لندن|Vereinigtes K|United Kingdom|انگلستان|\bGB\b/);
  });

  it("shows the legal block with the registered identifiers", async () => {
    const body = text(await render(ContactPage, locale));
    const L = CAT[locale].contact as Record<string, string>;
    for (const k of ["legalTitle", "legalNameLabel", "legalNameEnLabel", "nationalIdLabel", "registrationNumberLabel", "registryPlaceLabel", "brandRelation"]) {
      expect(body, k).toContain(L[k]);
    }
    expect(body).toContain(locale === "fa" ? "۱۴۰۰۴۶۰۱۶۸۴" : "14004601684");
    expect(body).toContain(locale === "fa" ? "۵۳۲۳۶" : "53236");
    expect(body).toContain("Zharfa Vira Pouyesh Fanavari");
  });

  it("links both websites and the founder LinkedIn safely, with a named accessible label", async () => {
    const html = await render(ContactPage, locale);
    for (const url of [CORPORATE_WEBSITES.hermes.url, CORPORATE_WEBSITES.zharfa.url, CORPORATE_PROFILES.founderLinkedIn]) {
      expect(html, url).toMatch(new RegExp(`<a href="${url.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}" target="_blank" rel="noopener noreferrer" aria-label="[^"]+"`));
    }
    const L = CAT[locale].contact as Record<string, string>;
    expect(text(html)).toContain(L.founderLinkedInLabel);
    expect(text(html)).not.toMatch(/\bEXT\b/);
    // both LinkedIn identities, side by side, and no other LinkedIn link
    expect(hrefs(html).filter((h) => h.includes("linkedin.com"))).toEqual([CORPORATE_PROFILES.founderLinkedIn, "https://www.linkedin.com/company/zharfa-vira/"]);
    expect(text(html)).toContain(L.zharfaLinkedInLabel);
  });

  it("never prints the retired personal mailbox", async () => {
    expect(await render(ContactPage, locale)).not.toMatch(/gmail\.com|hamidreza\.forozandeh1/);
  });
});

describe.each(LOCALES)("About page (%s)", (locale) => {
  it("names the company in the new legal form, with one office and both sites", async () => {
    const html = await render(AboutPage, locale);
    const body = text(html);
    const h = hrefs(html);
    expect(h).toContain(CORPORATE_WEBSITES.hermes.url);
    expect(h).toContain(CORPORATE_WEBSITES.zharfa.url);
    expect(h).toContain(CORPORATE_PROFILES.founderLinkedIn);
    expect(h).toContain("https://www.linkedin.com/company/zharfa-vira/");
    expect(body).toContain((CAT[locale].contact as Record<string, string>).brandRelation);
    expect(body).toContain((CAT[locale].about as Record<string, string>).founderName);
    expect(body).not.toMatch(/London|لندن|Vereinigtes K|United Kingdom|انگلستان/);
    // the duplicated bare domain label/value is gone
    expect(html).not.toContain('hc-tb-val font-mono text-[0.8125rem]" dir="ltr">hermesnovin.com');
  });
});

describe("structured data", () => {
  it("publishes the registered address, E.164 numbers and the three mailboxes", () => {
    const org = organizationSchema() as unknown as {
      name: string; legalName: string; address: Record<string, string>;
      contactPoint: Array<{ email: string; telephone?: string[] }>;
      identifier: Array<{ value: string }>; sameAs?: string[];
    };
    expect(org.legalName).toBe("Zharfa Vira Pouyesh Fanavari");
    expect(org.name).toBe(ORG_NAME);
    expect(org.address).toMatchObject({ "@type": "PostalAddress", postalCode: "8179679495", addressLocality: "Isfahan", addressCountry: "IR" });
    expect(org.contactPoint.map((c) => c.email)).toEqual(["sales@hermesnovin.com", "info@hermesnovin.com", "info@zharfavira.com"]);
    expect(org.contactPoint.flatMap((c) => c.telephone ?? [])).toEqual(["+982191096003", "+982191096005"]);
    expect(org.identifier.map((i) => i.value)).toEqual(["14004601684", "53236"]);
    expect(JSON.stringify(org)).not.toMatch(/London|\+44|gmail/);
    expect(org.sameAs).toEqual(["https://www.linkedin.com/company/zharfa-vira/"]);
    expect(() => JSON.parse(JSON.stringify(org))).not.toThrow();
  });

  it("founder sameAs carries the personal LinkedIn", () => {
    expect(FOUNDER_SAME_AS).toEqual([CORPORATE_PROFILES.founderLinkedIn]);
    expect((founderSchema() as { sameAs: string[] }).sameAs).toEqual([CORPORATE_PROFILES.founderLinkedIn]);
  });
});

describe("repository clean-up proof", () => {
  const RETIRED = [/hamidreza\.forozandeh1/i, /913\s?411\s?6492/, /796\s?054\s?5833/, /London,? (England|United Kingdom)/, /لندن، انگلستان/];
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === "__tests__" || e.startsWith(".")) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(tsx?|json)$/.test(e)) out.push(p);
    }
    return out;
  }
  it("no public source or catalogue still carries a retired value", () => {
    const files = [...walk(join(process.cwd(), "src")), ...["en", "fa", "de"].map((l) => join(process.cwd(), "messages", `${l}.json`))];
    const hits: string[] = [];
    for (const f of files) {
      const c = readFileSync(f, "utf8");
      for (const re of RETIRED) if (re.test(c)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});
