import { describe, it, expect } from "vitest";
import {
  organizationSchema,
  founderSchema,
  webSiteSchema,
  softwareApplicationSchema,
  siteEntityGraph,
  articleSchema,
  jobPostingSchema,
} from "../schemas";
import {
  BASE_URL,
  ORG_ID,
  WEBSITE_ID,
  PRODUCT_ID,
  FOUNDER_ID,
  ORG_NAME,
  ORG_SHORT_NAME,
  SITE_NAME,
  PRODUCT_CATEGORY,
} from "../config";

/**
 * PHASE 105 — canonical entity-graph contract.
 *
 * These assertions exist so the public knowledge graph cannot silently drift:
 * the `@id` values are a published contract, the company↔product relationship
 * is the entire point of the phase, and the "no fabricated authority" rules are
 * the ones most likely to be undone by a well-meaning future edit.
 */

/** Collect every string value anywhere in a nested structure. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => allStrings(v, out));
  }
  return out;
}

describe("entity IDs are stable and absolute", () => {
  it("every canonical @id is an absolute URL on the production origin", () => {
    for (const id of [ORG_ID, WEBSITE_ID, PRODUCT_ID, FOUNDER_ID]) {
      expect(id.startsWith(`${BASE_URL}/#`)).toBe(true);
      expect(() => new URL(id)).not.toThrow();
    }
  });

  it("the four canonical IDs are distinct", () => {
    const ids = [ORG_ID, WEBSITE_ID, PRODUCT_ID, FOUNDER_ID];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each builder emits its own canonical @id", () => {
    expect(organizationSchema()["@id"]).toBe(ORG_ID);
    expect(founderSchema()["@id"]).toBe(FOUNDER_ID);
    expect(webSiteSchema()["@id"]).toBe(WEBSITE_ID);
    expect(softwareApplicationSchema()["@id"]).toBe(PRODUCT_ID);
  });
});

describe("canonical identity", () => {
  it("the organisation publishes its full legal name, not the short brand", () => {
    const org = organizationSchema();
    expect(org.name).toBe("Hermes Novin Mehr IRIC");
    expect(org.legalName).toBe(ORG_NAME);
  });

  it("the short brand and the product name resolve to the same organisation", () => {
    expect(organizationSchema().alternateName).toEqual([ORG_SHORT_NAME, SITE_NAME]);
  });

  it("the product declares the canonical category", () => {
    const app = softwareApplicationSchema();
    expect(app.name).toBe("Hermes OS");
    expect(app.applicationSubCategory).toBe(PRODUCT_CATEGORY);
    expect(app.description).toContain(ORG_NAME);
  });
});

describe("graph relationships resolve", () => {
  it("website, product and founder all reference the organisation by @id", () => {
    expect(webSiteSchema().publisher).toEqual({ "@id": ORG_ID });
    expect(founderSchema().worksFor).toEqual({ "@id": ORG_ID });
    const app = softwareApplicationSchema();
    expect(app.creator).toEqual({ "@id": ORG_ID });
    expect(app.publisher).toEqual({ "@id": ORG_ID });
    expect(app.provider).toEqual({ "@id": ORG_ID });
  });

  it("the organisation references its founder by @id", () => {
    expect(organizationSchema().founder).toEqual({ "@id": FOUNDER_ID });
  });

  it("articles attribute author and publisher to the one organisation entity", () => {
    const a = articleSchema({ headline: "h", description: "d", url: "https://x/a", locale: "en" });
    expect(a.author).toEqual({ "@id": ORG_ID });
    expect(a.publisher).toEqual({ "@id": ORG_ID });
  });

  it("every @id referenced inside the graph is also defined inside it", () => {
    const graph = siteEntityGraph()["@graph"] as Record<string, unknown>[];
    const defined = new Set(graph.map((n) => n["@id"] as string));
    const referenced = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const keys = Object.keys(o);
        // A bare {"@id": …} object is a reference, not a definition.
        if (keys.length === 1 && keys[0] === "@id") referenced.add(o["@id"] as string);
        else Object.values(o).forEach(walk);
      }
    };
    graph.forEach(walk);
    expect(referenced.size).toBeGreaterThan(0);
    for (const id of referenced) expect(defined).toContain(id);
  });

  it("the graph defines each entity exactly once", () => {
    const graph = siteEntityGraph()["@graph"] as Record<string, unknown>[];
    const ids = graph.map((n) => n["@id"] as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([ORG_ID, FOUNDER_ID, WEBSITE_ID, PRODUCT_ID]));
  });

  it("nodes inside @graph carry no per-node @context", () => {
    const graph = siteEntityGraph()["@graph"] as Record<string, unknown>[];
    for (const node of graph) expect("@context" in node).toBe(false);
    expect(siteEntityGraph()["@context"]).toBe("https://schema.org");
  });
});

describe("no fabricated authority signals", () => {
  it("the product advertises no price, offer, rating or review", () => {
    const app = softwareApplicationSchema() as Record<string, unknown>;
    for (const banned of ["offers", "aggregateRating", "review", "award"]) {
      expect(banned in app).toBe(false);
    }
  });

  it("articles never invent a publication date", () => {
    const a = articleSchema({ headline: "h", description: "d", url: "https://x/a", locale: "en" }) as Record<string, unknown>;
    expect("datePublished" in a).toBe(false);
    expect("dateModified" in a).toBe(false);
    const dated = articleSchema({
      headline: "h", description: "d", url: "https://x/a", locale: "en",
      datePublished: "2026-03-04T00:00:00.000Z",
    }) as Record<string, unknown>;
    expect(dated.datePublished).toBe("2026-03-04T00:00:00.000Z");
  });

  it("sameAs contains only URLs proven to belong to the entity", () => {
    // Guards against a plausible-looking handle being added without evidence.
    expect(organizationSchema().sameAs).toEqual([
      "https://www.provenexpert.com/hermes-os/",
      "https://github.com/hermescenter1",
    ]);
    expect(founderSchema().sameAs).toEqual([
      "https://www.linkedin.com/in/hamid-reza-forozandeh",
    ]);
  });

  it("no sameAs URL carries tracking parameters", () => {
    for (const url of [...organizationSchema().sameAs, ...founderSchema().sameAs]) {
      expect(url).not.toContain("utm_");
      expect(url).not.toContain("?");
    }
  });
});

describe("Organization.logo is intentionally omitted", () => {
  it("no schema asserts the favicon as the corporate logo", () => {
    const json = JSON.stringify(siteEntityGraph());
    expect(json).not.toContain("favicon");
    expect("logo" in organizationSchema()).toBe(false);
  });

  it("the JobPosting hiring organisation also omits it", () => {
    const job = jobPostingSchema({
      id: "j1", title: "t", description: "d", location: "Tehran",
      currency: "USD", salaryMin: 1, salaryMax: 2, contractType: "full-time",
      datePosted: "2026-01-01", skills: ["PLC"],
    }) as Record<string, unknown>;
    const hiring = job.hiringOrganization as Record<string, unknown>;
    expect("logo" in hiring).toBe(false);
    // …and it resolves to the one canonical organisation entity.
    expect(hiring["@id"]).toBe(ORG_ID);
  });
});

describe("no non-production URLs leak into structured data", () => {
  it("every URL in the graph is absolute and on the canonical origin or a verified profile", () => {
    const strings = allStrings(siteEntityGraph());
    const urls = strings.filter((s) => s.startsWith("http"));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("https://")).toBe(true);
      expect(url).not.toMatch(/localhost|127\.0\.0\.1|staging|\.local|vercel\.app/i);
    }
  });

  it("the graph serialises to valid JSON with no undefined or null holes", () => {
    const json = JSON.stringify(siteEntityGraph());
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).not.toContain("undefined");
    expect(json).not.toContain(":null");
  });
});
