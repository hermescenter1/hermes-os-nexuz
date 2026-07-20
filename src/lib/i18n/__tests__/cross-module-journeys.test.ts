import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import type { Role } from "@/lib/auth/roles";

/**
 * PHASE 87L.5 AMENDMENT — journeys 11–15 and the remaining raw-enum inventory.
 *
 * Journeys 11 and 12 have a real product contract. Journeys 13, 14 and 15 do
 * NOT: the underlying records carry no navigable cross-module relationship, so
 * no link was fabricated. These tests pin both facts so a future change has to
 * be deliberate.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("journey 11 — Industrial Brain analysis → Case Studio", () => {
  const brain = "src/components/industrial-brain/IndustrialBrainWorkspace.tsx";

  it("links to a route that exists, with a locale-aware helper and no manual prefix", () => {
    const src = read(brain);
    expect(src).toContain('href="/knowledge/case-studio"');
    expect(existsSync(join(root, "src/app/[locale]/knowledge/case-studio/page.tsx"))).toBe(true);
    // the i18n Link adds the locale itself — a manual /${locale} would double it
    expect(src).toContain('import { Link } from "@/i18n/navigation"');
    expect(src).not.toMatch(/href=\{`\/\$\{locale\}\/knowledge/);
  });

  it("only offers the link once a case actually exists, so it can never dead-end", () => {
    const src = read(brain);
    // rendered under canSaveCase && saveState === "saved"
    const gate = src.slice(src.indexOf("{canSaveCase ?"), src.indexOf('href="/knowledge/case-studio"'));
    expect(gate).toContain('saveState === "saved"');
  });

  it("Case Studio is reachable by the roles 87L.4 authorized for it", () => {
    const page = read("src/app/[locale]/knowledge/case-studio/page.tsx");
    // `authoring` admits engineer as well as admin/superadmin
    expect(page).toContain('capability="authoring"');
    expect(page).toContain("RequireCapability");
  });

  it("a failed save reports a localized state, never a raw error", () => {
    const src = read(brain);
    expect(src).toContain('setSaveState("error")');
    // the catch never forwards the thrown value to the UI
    expect(src).not.toMatch(/setSaveState\((?:e|err|error)\)/);
    expect(src).not.toMatch(/JSON\.stringify\((?:e|err)\)/);
  });
});

describe("journeys 12–15 — what the product contract actually supports", () => {
  it("journey 12 (Brain → supporting knowledge): NOT IMPLEMENTED — no link is fabricated", () => {
    const src = read("src/components/industrial-brain/IndustrialBrainWorkspace.tsx");
    const knowledgeLinks = [...src.matchAll(/href="\/knowledge\/[^"]*"/g)].map((m) => m[0]);
    // the only knowledge destination is Case Studio (journey 11)
    expect(knowledgeLinks).toEqual(['href="/knowledge/case-studio"']);
  });

  it("journey 13 (Case Studio → asset/evidence): NOT IMPLEMENTED — surface renders no href", () => {
    expect(read("src/components/knowledge/CaseStudioClient.tsx")).not.toMatch(/href=/);
  });

  it("journeys 14–15: CRM/ERP surfaces link only within their own module", () => {
    for (const [rel, own] of [
      ["src/components/crm-experience/CrmCommandClient.tsx", "/crm"],
      ["src/components/business-operations/ErpCommandSurface.tsx", "/erp"],
    ] as const) {
      const src = read(rel);
      for (const m of src.matchAll(/href="(\/[^"]*)"/g)) {
        expect(m[1], `${rel} → ${m[1]}`).toContain(own);
      }
    }
    // CRM `organizationId` is the TENANT discriminator, not a navigable
    // "organization context" — linking it to /dashboard/organization would
    // conflate two different concepts, so no such link exists.
    expect(read("src/components/crm-experience/CrmCommandClient.tsx"))
      .not.toContain("/dashboard/organization");
  });

  it("no audited surface renders a placeholder or empty href", () => {
    for (const rel of [
      "src/components/industrial-brain/IndustrialBrainWorkspace.tsx",
      "src/components/crm-experience/CrmCommandClient.tsx",
      "src/components/business-operations/ErpCommandSurface.tsx",
      "src/components/knowledge/CaseStudioClient.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/href="#"/);
      expect(src, rel).not.toMatch(/href=""/);
      expect(src, rel).not.toMatch(/href=\{undefined\}|href=\{null\}/);
    }
  });

  it("no navigation destination carries a locale prefix or an API path", () => {
    for (const item of visibleAppNavGroups("admin").flatMap((g) => g.items)) {
      expect(item.href).not.toMatch(/^\/(en|fa|de)\//);
      expect(item.href).not.toMatch(/^\/api\//);
    }
  });

  it("CRM and ERP stay invisible to engineer (87L.4 policy, unchanged)", () => {
    const engineer = visibleAppNavGroups("engineer" as Role).flatMap((g) => g.items.map((i) => i.href));
    expect(engineer).not.toContain("/crm");
    expect(engineer).not.toContain("/erp");
    for (const href of ["/assets", "/cmms", "/automation", "/documents"]) {
      expect(engineer, href).toContain(href);
    }
  });
});

describe("raw-enum inventory — occurrence-exact, reconciled arithmetic", () => {
  /**
   * FINAL AMENDMENT reconciliation. Baseline 71ec2c1 carried 52 unique
   * production occurrences (48 with the space separator + 4 pattern variants)
   * across 34 unique files. 28 occurrences in 17 files were corrected in
   * 87L.5; 24 occurrences in 17 files remain, every one classified below.
   * 52 = 28 + 24. (The earlier "32/17/15" figures mixed file counts with
   * occurrence counts; this inventory counts occurrences.)
   */

  /** Count every production underscore-formatter occurrence, all variants. */
  const PATTERN = /\.replace\(\/_\/g,\s*['"`][^'"`]*['"`]\)|\.replaceAll\(['"`]_['"`],\s*['"`][^'"`]*['"`]\)/g;
  function scan(dir: string, acc: { rel: string; count: number }[] = []) {
    for (const name of readdirSync(join(root, dir))) {
      const rel = `${dir}/${name}`;
      if (name === "__tests__" || name === "node_modules") continue;
      if (statSync(join(root, rel)).isDirectory()) { scan(rel, acc); continue; }
      if (!/\.(tsx|ts)$/.test(name) || /\.test\./.test(name)) continue;
      const src = read(rel);
      // strip comment lines so documentation (e.g. enum-label.ts's own header)
      // never counts as a production occurrence
      const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      const count = (code.match(PATTERN) ?? []).length;
      if (count > 0) acc.push({ rel, count });
    }
    return acc;
  }

  /**
   * The EXACT remaining inventory: file → occurrences → classification.
   *   deferred-ui  = user-visible, outside journeys 1–16 (module named)
   *   non-visible  = head metadata / test-only component, never rendered UI text
   *   technical    = OPC_UA → OPC-UA protocol hyphenation (abbreviation, like MTBF)
   *   dynamic-key  = humanizes ARBITRARY metadata keys, not a closed enum (§7:
   *                  never translate user-entered data)
   */
  const REMAINING: Record<string, { count: number; kind: string }> = {
    "src/app/[locale]/admin/leads/page.tsx":                    { count: 1, kind: "deferred-ui: admin console" },
    "src/components/admin/VendorAdminClient.tsx":               { count: 2, kind: "deferred-ui: admin console" },
    "src/components/candidate/CandidateApplicationsClient.tsx": { count: 1, kind: "deferred-ui: candidate portal" },
    "src/components/compliance/ComplianceDashboardClient.tsx":  { count: 4, kind: "deferred-ui: compliance" },
    "src/components/compliance/PrivacyCenterClient.tsx":        { count: 1, kind: "deferred-ui: privacy center" },
    "src/components/engineering/IntelligenceView.tsx":          { count: 1, kind: "deferred-ui: engineering intelligence" },
    "src/components/knowledge-graph/KnowledgeGraphClient.tsx":  { count: 1, kind: "deferred-ui: knowledge graph" },
    "src/components/knowledge-graph/RelationshipExplorer.tsx":  { count: 2, kind: "deferred-ui: knowledge graph" },
    "src/components/knowledge/ArticleCard.tsx":                 { count: 1, kind: "deferred-ui: knowledge library card" },
    "src/components/operations/IntelligenceWallClient.tsx":     { count: 2, kind: "deferred-ui: operations wall" },
    "src/components/vendors/VendorApplicationForm.tsx":         { count: 1, kind: "deferred-ui: public vendor form" },
    "src/lib/eng-graph/builder.ts":                             { count: 1, kind: "deferred-ui: graph edge labels via eng-graph API" },
    // 89C: vendors/[vendorId]/page.tsx dropped out — its single occurrence
    // (vendorType.replace in SEO keywords) was ELIMINATED when the profile
    // metadata was localized; see ELIMINATED_89C below.
    "src/components/erp/ErpDashboardClient.tsx":                { count: 1, kind: "non-visible: test-only component, zero route consumers (87L.3)" },
    "src/components/industrial/AssetCard.tsx":                  { count: 1, kind: "technical: OPC_UA→OPC-UA hyphenation" },
    "src/components/industrial/AssetDetailClient.tsx":          { count: 2, kind: "technical: protocol hyphenation" },
    "src/lib/document/metadata.ts":                             { count: 1, kind: "dynamic-key: humanizes arbitrary metadata keys, not a closed enum" },
  };

  it("the live inventory matches the classified inventory exactly — file by file, count by count", () => {
    const live = [...scan("src/components"), ...scan("src/app"), ...scan("src/lib")];
    const liveMap = Object.fromEntries(live.map(({ rel, count }) => [rel, count]));
    // no unclassified straggler, no phantom entry, no drifted count
    expect(liveMap).toEqual(Object.fromEntries(Object.entries(REMAINING).map(([k, v]) => [k, v.count])));
  });

  it("arithmetic reconciles: 52 baseline = 28 corrected + 23 remaining + 1 eliminated", () => {
    const remaining = Object.values(REMAINING).reduce((s, v) => s + v.count, 0);
    expect(remaining).toBe(23);
    expect(Object.keys(REMAINING)).toHaveLength(16);
    // corrected = the 17 journey-reachable files migrated to enumLabel;
    // eliminated = vendors/[vendorId] keywords replace removed by 89C metadata localization.
    const CORRECTED_FILES = 17, CORRECTED_OCCURRENCES = 28, ELIMINATED_89C = 1, BASELINE = 52;
    expect(CORRECTED_OCCURRENCES + remaining + ELIMINATED_89C).toBe(BASELINE);
    void CORRECTED_FILES;
  });

  it("no journey-reachable module appears in the remaining inventory", () => {
    const journeyModules = [
      "src/components/assets/", "src/components/cmms/", "src/components/document/",
      "src/components/dashboard", "src/components/crm-experience/",
      "src/components/business-operations/", "src/components/asset-maintenance/",
      "src/components/engineering-documents/", "src/components/industrial-brain/",
      "src/app/[locale]/cmms/", "src/app/[locale]/assets/", "src/app/[locale]/documents/",
    ];
    for (const rel of Object.keys(REMAINING)) {
      expect(journeyModules.some((m) => rel.startsWith(m)), rel).toBe(false);
    }
  });
});

describe("representative experience states — evidence of the audited behaviour", () => {
  it("Assets/CMMS/Documents listings are SERVER-rendered — no client loading phase exists to go blank", () => {
    // the page awaits the data and hands a complete array to the client
    const page = read("src/app/[locale]/assets/registry/page.tsx");
    expect(page).toContain("await getAssets()");
    expect(page).toContain("<AssetsRegistryClient assets={assets} />");
    // so the client legitimately has no isLoading branch
    expect(read("src/components/assets/AssetsRegistryClient.tsx")).not.toMatch(/isLoading|useEffect\(.*fetch/);
  });

  it("CRM (client-fetched) shows a localized skeleton, and its failure state is distinct from empty", () => {
    const src = read("src/components/crm-experience/CrmCommandClient.tsx");
    expect(src).toContain('phase: "loading"');
    expect(src).toContain('<DashboardSkeleton label={t("states.loading")} />');
    expect(src).toContain("DataUnavailableState");
    expect(src).toContain('t("states.unavailableTitle")');
  });

  it("filtered/search empty states are localized and never claim a failure", () => {
    // registry: one localized message for zero matches, rendered as static text
    const registry = read("src/components/assets/AssetsRegistryClient.tsx");
    expect(registry).toContain('t("common.noAssetsFound")');
    // document search: empty result keeps the controlled query input mounted
    const search = read("src/components/document/SearchClient.tsx");
    expect(search).toContain("result.documents.length === 0");
    expect(search).not.toMatch(/window\.location|router\.replace\([^)]*q=/);
  });

  it("Case Studio renders the form immediately and surfaces only catalog errors", () => {
    const src = read("src/components/knowledge/CaseStudioClient.tsx");
    // a failed background refresh keeps previous content, never blanks or throws
    expect(src).toContain("if (!r.ok) return;");
    // every setError argument is a translated catalog string
    for (const m of src.matchAll(/setError\(([^)]+)\)/g)) {
      expect(m[1].trim(), m[0]).toMatch(/^(null|t\()/);
    }
  });

  it("access denial renders a dedicated server surface, never an empty dataset", () => {
    const guard = read("src/components/auth/RequireCapability.tsx");
    expect(guard).toContain("deniedTitle");
    expect(guard).not.toMatch(/noAssets|noRecords|empty/i);
  });

  it("CMMS missing task uses notFound(), and the layout supplies deterministic parent navigation", () => {
    const page = read("src/app/[locale]/cmms/tasks/[id]/page.tsx");
    expect(page).toContain("if (!task) return notFound();");
    // the page itself renders no ad-hoc breadcrumb; a direct URL visit still
    // has a deterministic, locale-preserving way back because the cmms LAYOUT
    // wraps every task page in the AppShell + CmmsSubNav (87I), whose links go
    // through the i18n navigation helper
    const layout = read("src/app/[locale]/cmms/layout.tsx");
    expect(layout).toContain("CmmsSubNav");
    expect(layout).toContain("AppShell");
    expect(read("src/components/asset-maintenance/AmSubNav.tsx"))
      .toContain('from "@/i18n/navigation"');
  });
});
