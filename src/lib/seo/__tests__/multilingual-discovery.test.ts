import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import robots from "../../../app/robots";
import { GET as indexnowKey } from "../../../app/indexnow-key.txt/route";
import { GET as llmsTxt } from "../../../app/llms.txt/route";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 87L.6 — German catalog quality, AI-crawler policy, IndexNow key file
 * and llms.txt. German ACTIVATION stays gated (ACTIVE_LOCALES untouched);
 * these tests prove the infrastructure extends automatically at flip time.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("German catalog — publicSite and authExperience are genuinely German", () => {
  const paths = (o: Record<string, unknown>, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`]));

  it("keeps exact key parity with en for both namespaces", () => {
    for (const ns of ["publicSite", "authExperience"] as const) {
      expect(paths((de as never)[ns]), ns).toEqual(paths((en as never)[ns]));
    }
  });

  it("carries no accidental English sentence — long-form values differ from en", () => {
    // product-name/protocol lines that stay identical BY DESIGN (§3)
    const IDENTICAL_BY_DESIGN = new Set([
      "publicSite.trustStrip.protocols",
      "publicSite.engineering.cards.knowledge.name",
      "publicSite.modules.groups.intelligence.items",
      "publicSite.modules.groups.business.items",
      "publicSite.platform.layers.intelligence.modules",
      "publicSite.platform.layers.business.modules",
    ]);
    const get = (o: unknown, p: string) => p.split(".").slice(1).reduce((x: unknown, k) => (x as Record<string, unknown>)[k], o);
    for (const ns of ["publicSite", "authExperience"] as const) {
      for (const p of paths((en as never)[ns])) {
        const ev = String(get((en as never)[ns], p));
        const dv = String(get((de as never)[ns], p));
        expect(dv.trim(), `${ns}${p} empty`).not.toBe("");
        if (ev.split(" ").length >= 4 && !IDENTICAL_BY_DESIGN.has(ns + p)) {
          expect(dv, `${ns}${p} still English`).not.toBe(ev);
        }
      }
    }
  });

  it("uses glossary terminology and no Persian text inside German values", () => {
    const dePub = (de as never as typeof en).publicSite;
    expect(dePub.flow.stages.safeAction).toBe("Sicherer Maßnahmenpfad");
    expect(dePub.operations.cards.predictive.name).toBe("Prädiktive Instandhaltung");
    expect(dePub.hero.trustLine).toContain("Mandantenfähige");
    expect(JSON.stringify(dePub)).not.toMatch(/[؀-ۿ]/);
    expect(JSON.stringify((de as never as typeof en).authExperience)).not.toMatch(/[؀-ۿ]/);
  });

  it("preserves protocol names verbatim inside German sentences", () => {
    const s = (de as never as typeof en).publicSite.story.factory.body1;
    for (const proto of ["PLC", "SCADA", "OPC UA", "MQTT"]) expect(s).toContain(proto);
  });
});

describe("robots — search/retrieval vs training crawler policy", () => {
  const cfg = robots();
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [cfg.rules];
  const byAgent = (ua: string) => rules.find((r) => r.userAgent === ua);

  it("AI SEARCH crawlers get full public access, private/API denied", () => {
    for (const ua of ["OAI-SearchBot", "Claude-SearchBot", "Claude-User", "PerplexityBot"]) {
      const r = byAgent(ua);
      expect(r, ua).toBeTruthy();
      expect(r!.allow, ua).toContain("/fa/");
      expect(r!.allow, ua).toContain("/en/");
      expect(r!.disallow, ua).toContain("/api/");
      expect(r!.disallow, ua).toContain("/fa/dashboard/");
    }
  });

  it("TRAINING crawlers are scoped to the owner-approved knowledge surfaces only", () => {
    for (const ua of ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"]) {
      const r = byAgent(ua);
      expect(r, ua).toBeTruthy();
      expect(r!.allow, ua).toContain("/fa/library/");
      expect(r!.allow, ua).not.toContain("/fa/");
      expect(r!.disallow, ua).toContain("/api/");
    }
  });

  it("search and training policies for the same vendor are distinct rules", () => {
    expect(byAgent("Claude-SearchBot")!.allow).not.toEqual(byAgent("ClaudeBot")!.allow);
    expect(byAgent("OAI-SearchBot")!.allow).not.toEqual(byAgent("GPTBot")!.allow);
  });

  it("no accidental global block, and the sitemap is declared", () => {
    for (const r of rules) {
      const dis = Array.isArray(r.disallow) ? r.disallow : [r.disallow];
      if (dis.includes("/")) {
        // only the explicitly blocked SEO-scraper bots may block root
        expect(["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot"]).toContain(r.userAgent);
      }
    }
    expect(String(cfg.sitemap)).toMatch(/\/sitemap\.xml$/);
  });
});

describe("IndexNow key file — /indexnow-key.txt", () => {
  it("404s when the key is not configured (feature never leaks)", () => {
    delete process.env.INDEXNOW_KEY;
    expect(indexnowKey().status).toBe(404);
  });

  it("serves exactly the configured key as plain text when set", async () => {
    process.env.INDEXNOW_KEY = "test-key-abc123";
    const res = indexnowKey();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("test-key-abc123");
    delete process.env.INDEXNOW_KEY;
  });

  it("the submission route points keyLocation at this fixed route", () => {
    const src = read("src/app/api/seo/indexnow/route.ts");
    expect(src).toContain("`${BASE_URL}/indexnow-key.txt`");
    expect(src).not.toContain("${INDEXNOW_KEY}.txt");
  });
});

describe("llms.txt — supplemental discovery document", () => {
  it("lists only stable public canonical resources, no private routes or secrets", async () => {
    const body = await llmsTxt().text();
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("/robots.txt");
    expect(body).toContain("/fa/industrial-brain");
    expect(body).toContain("/en/library");
    // never a private/auth/api URL, never an env value
    expect(body).not.toMatch(/\/dashboard|\/admin|\/api\/|\/auth\//);
    expect(body).not.toMatch(/INDEXNOW|SECRET|password/i);
    // honest positioning: human approval, no fabricated claims
    expect(body).toContain("human approval");
    expect(body).not.toMatch(/world.?leader|number one|guarantee[sd]?\b/i);
  });
});

describe("activation readiness — everything derives from ACTIVE_LOCALES", () => {
  it("routing, sitemap, robots and SEO config all import the central registry", () => {
    for (const rel of [
      "src/i18n/routing.ts",
      "src/app/robots.ts",
      "src/lib/seo/config.ts",
    ]) {
      expect(read(rel), rel).toMatch(/ACTIVE_LOCALES/);
    }
    // sitemap consumes LOCALES which is re-exported from ACTIVE_LOCALES
    expect(read("src/lib/seo/config.ts")).toContain("export const LOCALES        = ACTIVE_LOCALES");
    expect(read("src/app/sitemap.ts")).toMatch(/LOCALES/);
  });

  it("German is ACTIVE — the catalog gate passed (87L.6 final amendment)", () => {
    const locales = read("src/i18n/locales.ts");
    expect(locales).toContain('export const ACTIVE_LOCALES = ["fa", "en", "de"] as const');
    expect(locales).toContain('export const SUPPORTED_LOCALES = ["fa", "en", "de"] as const');
    expect(locales).toContain('de: "ltr"');
    expect(locales).toContain('de: "de-DE"');
  });
});
