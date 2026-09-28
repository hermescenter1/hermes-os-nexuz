import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  organizationSchema,
  founderSchema,
  webSiteSchema,
  softwareApplicationSchema,
  jobPostingSchema,
  siteEntityGraph,
} from "../schemas";
import {
  ORG_NAME,
  ORG_SHORT_NAME,
  SITE_NAME,
  BASE_URL,
  ORG_URL,
  CONTACT_EMAIL,
  ORG_SAME_AS,
  PRODUCT_SAME_AS,
  ORG_ID,
  PRODUCT_ID,
  WEBSITE_ID,
  FOUNDER_ID,
} from "../config";
import {
  PUBLIC_NAV_GROUPS,
  PUBLIC_FOOTER_COLUMNS,
  allPublicShellHrefs,
} from "@/components/public-site/nav";
import {
  isProtectedPath,
  PROTECTED_ROUTE_PREFIXES,
  PROTECTED_ROUTE_PUBLIC_CHILDREN,
} from "@/lib/auth/rbac";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 113 — public identity, entity separation and public-navigation
 * boundaries.
 *
 * These assertions exist because the failures they catch are silent. A retired
 * company name on a public page, a product name smuggled into the company's
 * alternate names, or an authenticated route added to the anonymous header all
 * render perfectly; nothing breaks, and the damage is to the entity graph, to
 * legal accuracy, or to the authorization boundary.
 *
 * They are written against BEHAVIOUR and STRUCTURE — what the schema builders
 * return, what the navigation registry resolves to, what the authorization layer
 * says about each href — not against formatting. The one source-text check is
 * the "retired identity" sweep, which is a text question by nature.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/**
 * Source with comments removed.
 *
 * The invariant is that the retired identity is never PUBLISHED, not that it is
 * never mentioned. `config.ts` documents which name was retired and why, which
 * is exactly the note a future reader needs; failing the gate on it would
 * pressure someone into deleting the explanation. JSON catalogs have no
 * comments and are scanned raw.
 */
const activeSrc = (rel: string) =>
  rel.endsWith(".json")
    ? read(rel)
    : read(rel)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * Every retired form of the company identity, Latin and Persian.
 *
 * SPACE-INSENSITIVE ON PURPOSE — this is the defect the list now exists to
 * catch. The original Phase 113 sweep looked only for the spaced forms, and a
 * public surface slipped through: `contact.generalEmail` published
 * "hermesnovinmehriric@gmail.com" on the public /contact page in all three
 * locales — the retired legal name, spelled as an email local-part. The gate
 * reported "published nowhere" while the name was on the page, which is worse
 * than having no gate at all.
 *
 * So the sweep also runs against a lower-cased, separator-stripped view of each
 * surface. That catches the concatenated form, a hyphenated one, and a domain or
 * handle assembled out of the retired name.
 */
const RETIRED_IDENTITIES = [
  "Hermes Novin Mehr IRIC",
  "Hermes Novin Mehr",
  "Hermes Novin",
  "هرمس نوین مهر آیریک",
  "هرمس نوین مهر",
  "هرمس نوین",
] as const;

/**
 * The production hostname, derived from BASE_URL so it can never drift.
 *
 * THE CARVE-OUT, AND WHY IT IS NARROW
 * The canonical host is `hermesnovin.com`. Collapsed, that contains
 * "hermesnovin" — so a separator-stripped sweep would flag the domain itself,
 * on every surface, forever. The domain is NOT an identity claim: it is
 * infrastructure, it is the apex this phase's baseline pins as canonical, and
 * changing it is a DNS and deliverability decision far outside a naming phase.
 *
 * So the host is removed from a surface BEFORE the collapsed comparison, and
 * nothing else is. That keeps the distinction that actually matters:
 *
 *   hermesnovin.com                  — a hostname. Kept.
 *   hermesnovinmehriric@gmail.com    — a retired LEGAL NAME as a local-part,
 *                                      on a third-party mailbox. Caught.
 *
 * If the host is ever migrated, this constant follows BASE_URL automatically and
 * the carve-out narrows on its own.
 */
const CANONICAL_HOST = new URL(BASE_URL).hostname.toLowerCase();

/**
 * Lower-cased, canonical host removed, then every separator removed — so
 * "Hermes-Novin", "hermes.novin" and "hermesnovinmehriric" all collapse onto
 * the same needle while the production domain does not.
 */
const collapse = (value: string) =>
  value
    .toLowerCase()
    .split(CANONICAL_HOST)
    .join(" ")
    .replace(/[\s._\-]/g, "");

/** The retired identities in collapsed form, longest first. */
const RETIRED_COLLAPSED = [...RETIRED_IDENTITIES]
  .map(collapse)
  .sort((a, b) => b.length - a.length);

/** Assert one surface publishes no retired identity, spaced OR collapsed. */
function expectNoRetiredIdentity(label: string, published: string): void {
  for (const retired of RETIRED_IDENTITIES) {
    expect(published, `${label} still contains "${retired}"`).not.toContain(retired);
  }
  const collapsed = collapse(published);
  for (const retired of RETIRED_COLLAPSED) {
    expect(collapsed, `${label} still contains "${retired}" (separator-stripped)`).not.toContain(retired);
  }
}

const CATALOGS = [
  ["en", en],
  ["fa", fa as unknown as typeof en],
  ["de", de as unknown as typeof en],
] as const;

/* ── Company identity ────────────────────────────────────────────────────── */

describe("ZHARFA is the company identity", () => {
  it("the canonical constants name the company and its short brand", () => {
    expect(ORG_NAME).toBe("ZHARFA Vira Pouyesh Fanavari");
    expect(ORG_SHORT_NAME).toBe("ZHARFA");
  });

  it("the Organization entity publishes that identity as both name and legalName", () => {
    const org = organizationSchema();
    expect(org.name).toBe(ORG_NAME);
    expect(org.legalName).toBe(ORG_NAME);
  });
});

describe("Hermes OS is the product identity", () => {
  it("the product name is unchanged", () => {
    expect(SITE_NAME).toBe("Hermes OS");
    expect(softwareApplicationSchema().name).toBe("Hermes OS");
  });
});

/* ── The separation itself ───────────────────────────────────────────────── */

describe("company and product are two entities", () => {
  it("neither name contains the other", () => {
    expect(ORG_NAME).not.toContain(SITE_NAME);
    expect(SITE_NAME).not.toContain(ORG_NAME);
    expect(ORG_NAME).not.toBe(SITE_NAME);
  });

  it("the product name is NOT an alternate name of the company", () => {
    const alternates = organizationSchema().alternateName;
    expect(alternates).toEqual([ORG_SHORT_NAME]);
    expect(alternates).not.toContain(SITE_NAME);
  });

  it("company and product hold distinct @id values, each defined once", () => {
    const graph = siteEntityGraph()["@graph"] as Record<string, unknown>[];
    const ids = graph.map((node) => node["@id"] as string);
    expect(new Set(ids)).toEqual(new Set([ORG_ID, FOUNDER_ID, WEBSITE_ID, PRODUCT_ID]));
    expect(ids.length).toBe(new Set(ids).size);
    expect(ORG_ID).not.toBe(PRODUCT_ID);
  });

  it("the product points at the company in all three directions the vocabulary supports", () => {
    const app = softwareApplicationSchema();
    expect(app.creator).toEqual({ "@id": ORG_ID });
    expect(app.publisher).toEqual({ "@id": ORG_ID });
    expect(app.provider).toEqual({ "@id": ORG_ID });
  });

  it("the website publishes as the company, and the founder works for it", () => {
    expect(webSiteSchema().publisher).toEqual({ "@id": ORG_ID });
    expect(founderSchema().worksFor).toEqual({ "@id": ORG_ID });
  });

  it("the product entity never re-declares the company as a nested Organization", () => {
    // A nested `{"@type":"Organization", name: …}` beside an `@id` reference is
    // how a duplicate competing organisation gets into a graph. The company is
    // referenced by `@id` only.
    const app = softwareApplicationSchema() as Record<string, unknown>;
    expect(JSON.stringify(app)).not.toContain("\"@type\":\"Organization\"");
    for (const relation of ["creator", "publisher", "provider"]) {
      expect(Object.keys(app[relation] as object), `${relation} must be an @id reference only`)
        .toEqual(["@id"]);
    }
    // The human-readable `description` DOES name the developer, and should:
    // that sentence is the company/product relationship stated in prose for a
    // retrieval system that reads descriptions rather than graph edges.
    expect(app.description).toContain(ORG_NAME);
  });

  it("exactly one Organization node exists in the whole graph", () => {
    const serialised = JSON.stringify(siteEntityGraph());
    expect([...serialised.matchAll(/"@type":"Organization"/g)]).toHaveLength(1);
  });
});

/* ── sameAs belongs to the entity it actually identifies ─────────────────── */

describe("external profiles are attributed to the right entity", () => {
  it("the company asserts no unproven external identity", () => {
    expect(ORG_SAME_AS).toEqual([]);
    // Omitted, not emitted empty: an empty array is still a published claim
    // shape, and `sameAs` is optional on Organization.
    expect("sameAs" in organizationSchema()).toBe(false);
  });

  it("the ProvenExpert profile sits on the PRODUCT, never on the company", () => {
    expect(PRODUCT_SAME_AS).toEqual(["https://www.provenexpert.com/hermes-os/"]);
    expect(softwareApplicationSchema().sameAs).toEqual([...PRODUCT_SAME_AS]);
    expect(JSON.stringify(organizationSchema())).not.toContain("provenexpert");
  });

  it("no repository-hosting account is published as a corporate alias", () => {
    expect(JSON.stringify(siteEntityGraph())).not.toContain("github.com");
  });

  it("the product profile carries no rating, review, offer or price", () => {
    const app = softwareApplicationSchema() as Record<string, unknown>;
    for (const fabricated of ["aggregateRating", "review", "offers", "award"]) {
      expect(fabricated in app).toBe(false);
    }
  });
});

/* ── The retired identity is gone from every public surface ──────────────── */

describe("the retired company identity is published nowhere", () => {
  const PUBLIC_SURFACES = [
    "src/lib/seo/config.ts",
    "src/lib/seo/schemas.ts",
    "src/lib/seo/metadata.ts",
    "src/app/llms.txt/route.ts",
    "src/app/[locale]/layout.tsx",
    "src/components/public-site/PublicFooter.tsx",
    "src/components/trust/TrustBadgesSection.tsx",
    "content/journal/author.json",
  ] as const;

  it.each(PUBLIC_SURFACES)("%s publishes no retired identity", (file) => {
    expectNoRetiredIdentity(file, activeSrc(file));
  });

  it("no translation catalog carries a retired identity in any locale", () => {
    for (const [locale, catalog] of CATALOGS) {
      expectNoRetiredIdentity(`${locale}.json`, JSON.stringify(catalog));
    }
  });

  it("no public contact address is built out of the retired company name", () => {
    // The specific surface the original sweep missed. Every published address
    // is checked as a whole string AND collapsed, and each must be a real
    // owner-controlled mailbox rather than one spelling a retired legal name.
    for (const [locale, catalog] of CATALOGS) {
      const contact = (catalog as unknown as { contact: Record<string, string> }).contact;
      const addresses = Object.entries(contact).filter(([, v]) => typeof v === "string" && v.includes("@"));
      expect(addresses.length, `${locale}: the contact page must publish at least one address`).toBeGreaterThan(0);
      for (const [key, value] of addresses) {
        expectNoRetiredIdentity(`${locale}: contact.${key}`, value);
      }
    }
  });

  it("the public contact page names the canonical address", () => {
    // `CONTACT_EMAIL` is the address the entity graph publishes as the
    // organisation contact point, so the contact page must not drift from it.
    for (const [locale, catalog] of CATALOGS) {
      const contact = (catalog as unknown as { contact: Record<string, string> }).contact;
      const published = Object.values(contact).filter((v) => typeof v === "string" && v.includes("@"));
      expect(published, `${locale}: the canonical contact address must be published`).toContain(CONTACT_EMAIL);
    }
  });

  it("the rendered entity graph carries no retired identity", () => {
    expectNoRetiredIdentity("the entity graph", JSON.stringify(siteEntityGraph()));
  });
});

/* ── Footer identity, in every locale ───────────────────────────────────── */

describe("the public footer declares the company behind Hermes OS", () => {
  /** Both footer copyright keys: the public shell's and the legacy shell's. */
  const COPYRIGHT_KEYS = ["publicSite.footer.copyright", "footer.copyright"] as const;

  function leaf(catalog: typeof en, path: string): string {
    const value = path.split(".").reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      catalog,
    );
    expect(typeof value, `${path} must be a string`).toBe("string");
    return value as string;
  }

  it.each(CATALOGS)("%s names the company in every footer copyright line", (locale, catalog) => {
    // Persian renders the company in Persian script; English and German use the
    // Latin form. The invariant is that the line names the CURRENT company, not
    // that all three share one spelling.
    const expected = locale === "fa"
      ? "ژرفا ویرا پویش فناوری"
      : ORG_NAME;

    for (const key of COPYRIGHT_KEYS) {
      const value = leaf(catalog, key);
      expect(value, `${locale}: ${key}`).toContain(expected);
      for (const retired of RETIRED_IDENTITIES) {
        expect(value, `${locale}: ${key} still names "${retired}"`).not.toContain(retired);
      }
    }
  });

  it("the About page names the company, not the product, as the company", () => {
    for (const [locale, catalog] of CATALOGS) {
      const expected = locale === "fa"
        ? "ژرفا ویرا پویش فناوری"
        : ORG_NAME;
      expect(leaf(catalog, "about.companyTitle"), `${locale}`).toBe(expected);
    }
  });

  it("the eNAMAD seal's accessible name makes no company registration claim", () => {
    // The registrant of eNAMAD id 761266 is not evidenced in this repository, so
    // the accessible name is product-neutral. Naming ANY company here would be a
    // legal claim about who is certified.
    const src = read("src/components/trust/TrustBadgesSection.tsx");
    const label = /aria-label="eNAMAD Electronic Trust Seal — ([^"]+)"/.exec(src)?.[1];
    expect(label).toBe(SITE_NAME);
    expect(label).not.toBe(ORG_NAME);
    expect(label).not.toBe(ORG_SHORT_NAME);
  });
});

/* ── Public navigation boundary ──────────────────────────────────────────── */

describe("public navigation exposes only anonymous-reachable routes", () => {
  it("no href rendered by the public shell is middleware-protected", () => {
    for (const href of allPublicShellHrefs()) {
      expect(isProtectedPath(`/en${href}`), `${href} is protected`).toBe(false);
      expect(isProtectedPath(`/fa${href}`), `${href} is protected`).toBe(false);
      expect(isProtectedPath(`/de${href}`), `${href} is protected`).toBe(false);
    }
  });

  it("no href sits under a protected route prefix", () => {
    const hrefs = allPublicShellHrefs();
    for (const prefix of PROTECTED_ROUTE_PREFIXES) {
      for (const href of hrefs) {
        const path = href.replace(/^\//, "");
        if (PROTECTED_ROUTE_PUBLIC_CHILDREN.includes(path)) continue;
        expect(
          path === prefix || path.startsWith(`${prefix}/`),
          `${href} is inside the protected prefix "${prefix}"`,
        ).toBe(false);
      }
    }
  });

  it("the four operational surfaces named in the brief are absent from the public shell", () => {
    // Each of these is an authenticated surface with no separate anonymous
    // landing page. They must never appear in anonymous navigation, and the
    // authorization layer must still be the one protecting them.
    const OPERATIONAL = ["/live-operations", "/dashboard", "/engineering", "/compliance"] as const;
    const hrefs = allPublicShellHrefs();
    for (const route of OPERATIONAL) {
      expect(hrefs, `${route} must not be in the public shell`).not.toContain(route);
      expect(isProtectedPath(`/en${route}`), `${route} must be protected`).toBe(true);
    }
  });

  it("no tenant, factory, ATS-management, reasoning-run or administrative surface is linked", () => {
    const FORBIDDEN_SEGMENTS = [
      "admin", "dashboard", "engineering", "compliance", "live-operations",
      "cmms", "assets", "documents", "automation", "erp", "crm",
      "candidate", "vendor/", "customer", "privacy-center",
      "knowledge/studio", "knowledge/case-studio", "intelligence/unknown",
    ] as const;
    for (const href of allPublicShellHrefs()) {
      for (const segment of FORBIDDEN_SEGMENTS) {
        expect(
          href === `/${segment}` || href.startsWith(`/${segment}/`),
          `${href} exposes "${segment}" anonymously`,
        ).toBe(false);
      }
    }
  });
});

describe("the public capabilities the brief requires stay reachable", () => {
  /**
   * The public capability set. This is a REQUIRED-PRESENT list: the header
   * decision for Phase 113 was NO_HEADER_CHANGE_REQUIRED, so the risk this
   * guards is silent removal, not silent addition.
   */
  const REQUIRED_HEADER_HREFS = [
    "/platform",
    "/architecture",
    "/services",
    "/services/digital-twin",
    "/services/predictive-maintenance",
    "/services/cmms",
    "/services/multi-site",
    "/services/edms",
    "/services/erp",
    "/services/ot-edge",
    "/services/crm",
    "/industrial-brain",
    "/brain",
    "/copilot",
    "/library",
    "/academy",
    "/articles",
    "/demo",
    "/vendors",
    "/about",
    "/careers",
    "/contact",
  ] as const;

  it("every required capability is reachable from the public header", () => {
    const headerHrefs = PUBLIC_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    for (const href of REQUIRED_HEADER_HREFS) {
      expect(headerHrefs, `${href} is missing from the public header`).toContain(href);
    }
  });

  it("the OT Edge public capability page is a header entry, not an operational link", () => {
    const headerHrefs = PUBLIC_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(headerHrefs).toContain("/services/ot-edge");
    // The OT Edge WORKSPACE is a different, protected thing.
    expect(headerHrefs).not.toContain("/otedge");
    expect(isProtectedPath("/en/live-operations")).toBe(true);
  });

  it("the three legal pages stay linked from the footer", () => {
    const footerHrefs = PUBLIC_FOOTER_COLUMNS.flatMap((column) => column.links.map((link) => link.href));
    for (const href of ["/privacy", "/terms", "/cookies"]) {
      expect(footerHrefs, `${href} must stay linked`).toContain(href);
    }
  });
});

/* ── The owner-confirmed corporate URL (2026-09-28) ──────────────────── */

describe("the organisation publishes its own verified website", () => {
  it("Organization.url is the HTTP-verified canonical apex", () => {
    // Measured 2026-09-28: www.zharfavira.com 301s to the apex, and the apex's
    // own Organization node publishes exactly this value while its per-page
    // canonical is the /fa locale variant. So the entity URL is the apex root:
    // no `www`, no locale path, no trailing slash.
    expect(ORG_URL).toBe("https://zharfavira.com");
    expect(ORG_URL).not.toMatch(/^https:\/\/www\./);
    expect(ORG_URL).not.toMatch(/\/(fa|en|de)(\/|$)/);
    expect(ORG_URL.endsWith("/")).toBe(false);
    expect(organizationSchema().url).toBe(ORG_URL);
  });

  it("the company website is NOT smuggled into sameAs", () => {
    // An organisation's own principal website belongs in `url`. Repeating it in
    // `sameAs` would assert that the company and its website are two identities
    // to be merged — the same sloppy claim this phase removed elsewhere.
    expect(ORG_SAME_AS).toEqual([]);
    expect("sameAs" in organizationSchema()).toBe(false);
  });

  it("the ZHARFA domain never appears on the PRODUCT entity", () => {
    // Hermes OS is published BY ZHARFA; it does not live at ZHARFA's domain, and
    // the product must not claim that domain as one of its own identities.
    const app = softwareApplicationSchema() as Record<string, unknown>;
    const host = new URL(ORG_URL).hostname;
    expect(JSON.stringify(app.sameAs ?? [])).not.toContain(host);
    expect(app.url).toBe(BASE_URL);
    expect(String(app.url)).not.toContain(host);
  });

  it("the product entity still resolves its publisher to the one Organization", () => {
    const app = softwareApplicationSchema();
    expect(app.publisher).toEqual({ "@id": ORG_ID });
    expect(app.creator).toEqual({ "@id": ORG_ID });
    expect(app.provider).toEqual({ "@id": ORG_ID });
    // …and the graph still defines that Organization exactly once.
    const serialised = JSON.stringify(siteEntityGraph());
    expect([...serialised.matchAll(/"@type":"Organization"/g)]).toHaveLength(1);
  });

  it("company and product remain two entities after the URL change", () => {
    expect(ORG_ID).not.toBe(PRODUCT_ID);
    expect(organizationSchema().url).not.toBe(softwareApplicationSchema().url);
    expect(organizationSchema().alternateName).not.toContain(SITE_NAME);
  });

  it("neither GitHub nor ProvenExpert re-enters the company identity", () => {
    // The two entries Phase 113 removed. The arrival of a real corporate URL is
    // not a reason to let them back in: one is code hosting, the other reviews
    // the product.
    const org = JSON.stringify(organizationSchema());
    expect(org).not.toContain("github.com");
    expect(org).not.toContain("provenexpert");
  });

  it("every organisation reference in the schema layer uses the corporate URL", () => {
    // JobPosting.hiringOrganization, Course.provider and Vendor.memberOf all
    // describe the SAME company. Before this change they pointed at the product
    // domain, which said the organisation is the Hermes OS site.
    const job = jobPostingSchema({
      requisitionKey: "ZVP-TEST-001", title: "t", description: "d",
      addressLocality: "Isfahan", addressRegion: "Isfahan Province", addressCountry: "IR",
      datePosted: "2026-01-01", skills: ["PLC"],
    }) as Record<string, unknown>;
    const hiring = job.hiringOrganization as Record<string, unknown>;
    expect(hiring.url).toBe(ORG_URL);
    expect("sameAs" in hiring, "an organisation's own site is its url, not a sameAs").toBe(false);
    expect(hiring["@id"]).toBe(ORG_ID);
  });
});
