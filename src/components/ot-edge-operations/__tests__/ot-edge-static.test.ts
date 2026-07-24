import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { APP_NAV_GROUPS, isAppNavItemVisible } from "@/lib/navigation/app-nav";
import { isAuthorizedForPath, isProtectedPath } from "@/lib/auth/rbac";
import { can, type Role } from "@/lib/auth/roles";
import { can as orgCan } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";

/**
 * PHASE 94C1 — source-level guarantees for the OT Edge surface.
 *
 * These catch the mistakes a runtime test cannot: a NEW component added later
 * that imports Prisma, calls the machine-ingestion endpoint, hard-codes an
 * English string, or fabricates a connectivity claim. They enumerate the
 * directory rather than a hand-kept list, so a file added tomorrow is held to
 * the same rules without anyone remembering to add it.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

function filesUnder(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__") walk(full);
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        out.push(full.replace(ROOT, "").replace(/\\/g, "/").replace(/^\//, ""));
      }
    }
  };
  walk(resolve(ROOT, dir));
  return out.sort();
}

const COMPONENTS = filesUnder("src/components/ot-edge-operations", [".ts", ".tsx"]);
const LIB = filesUnder("src/lib/ot-operations", [".ts"]);
const PAGES = filesUnder("src/app/[locale]/dashboard/ot", [".tsx"]);
const ALL = [...COMPONENTS, ...LIB, ...PAGES];

/* ── Routes and shell ───────────────────────────────────────────────────── */

describe("94C1 — the route tree is exactly what was designed", () => {
  it("creates the six canonical OT Edge route files and no others", () => {
    expect(PAGES).toEqual(
      [
        "src/app/[locale]/dashboard/ot/devices/[id]/page.tsx",
        "src/app/[locale]/dashboard/ot/devices/page.tsx",
        "src/app/[locale]/dashboard/ot/gateways/[id]/page.tsx",
        "src/app/[locale]/dashboard/ot/gateways/page.tsx",
        "src/app/[locale]/dashboard/ot/layout.tsx",
        "src/app/[locale]/dashboard/ot/page.tsx",
      ].sort(),
    );
  });

  it("creates no duplicate non-localized route tree", () => {
    expect(existsSync(resolve(ROOT, "src/app/dashboard/ot"))).toBe(false);
    expect(existsSync(resolve(ROOT, "src/app/ot"))).toBe(false);
    expect(existsSync(resolve(ROOT, "src/app/[locale]/ot"))).toBe(false);
  });

  it("adds no API route", () => {
    // Phase 94C1 consumes the verified contract; it does not extend it. The
    // OT route-tree suite asserts a fixed list and would fail on a new file.
    expect(existsSync(resolve(ROOT, "src/app/api/ot-edge"))).toBe(false);
    expect(existsSync(resolve(ROOT, "src/app/api/ot-operations"))).toBe(false);
  });

  it("mounts the module on the shared AppShell behind the existing guard", () => {
    const layout = strip(read("src/app/[locale]/dashboard/ot/layout.tsx"));
    expect(layout).toMatch(/RequireCapability/);
    expect(layout).toMatch(/capability="authoring"/);
    expect(layout).toMatch(/AppShell/);
    // The guard is used, not reimplemented.
    expect(layout).not.toMatch(/getCurrentUser|getPrisma|can\(/);
  });

  it("gives each page exactly one h1 via the shared PageHeader", () => {
    for (const page of PAGES.filter((p) => p.endsWith("page.tsx"))) {
      const source = strip(read(page));
      expect(source, `${page} must use PageHeader`).toMatch(/PageHeader/);
      expect(source, `${page} must not hand-roll an h1`).not.toMatch(/<h1/);
      // `level="page"` is what renders the single h1.
      expect(source).toMatch(/level="page"/);
    }
  });
});

/* ── Security boundaries ────────────────────────────────────────────────── */

describe("94C1 — the UI reaches no server internal", () => {
  it.each(ALL)("%s imports no Prisma, repository or server-only OT module", (file) => {
    const source = strip(read(file));
    for (const forbidden of [
      /@prisma\/client/,
      /PrismaClient/,
      /getPrisma\s*\(/,
      /ot-edge\/persistence/,
      /ot-edge\/services/,
      /ot-edge\/machine-context/,
      /ot-edge\/envelope-signature/,
      /ot-edge\/http\/route-kit/,
      /ot-edge\/http\/composition/,
      /lib\/org\/rbac/,
      /lib\/auth\/session/,
    ]) {
      expect(source, `${file} must not reference ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s never calls the machine ingestion endpoint", (file) => {
    const source = strip(read(file));
    // Envelope ingestion is authenticated by an HMAC only a gateway holds. A
    // browser calling it could never succeed, and offering it would imply the
    // dashboard can act as a device.
    expect(source).not.toMatch(/envelopes/);
    expect(source).not.toMatch(/x-hermes-ingestion-id/i);
  });

  it.each(ALL)("%s references no secret, credential or signing material", (file) => {
    const source = strip(read(file));
    for (const forbidden of [/signingKeyRef/, /ingestionId/, /\bnonce\b/i, /idempotencyKey/, /HMAC/, /\bsecret\b/i]) {
      expect(source, `${file} references ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s writes nothing to browser storage", (file) => {
    const source = strip(read(file));
    for (const forbidden of [/localStorage/, /sessionStorage/, /document\.cookie/, /indexedDB/]) {
      expect(source, `${file} uses ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s logs nothing", (file) => {
    const source = strip(read(file));
    expect(source).not.toMatch(/console\.(log|error|warn|info|debug)/);
    expect(source).not.toMatch(/\blogger\./);
  });

  it.each(ALL)("%s adds no polling, socket or timer-driven refresh", (file) => {
    const source = strip(read(file));
    for (const forbidden of [/setInterval/, /WebSocket/, /EventSource/, /refetchInterval/, /new Worker/]) {
      expect(source, `${file} uses ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s exposes no industrial control or actuation vocabulary", (file) => {
    const source = strip(read(file));
    for (const forbidden of [
      /writeTag/i, /writeValue/i, /actuate/i, /setpoint/i, /acknowledgeAlarm/i,
      /plcWrite/i, /startEquipment/i, /stopEquipment/i, /rebootDevice/i,
      /firmwareUpdate/i, /rotateKey/i, /revokeGateway/i,
    ]) {
      expect(source, `${file} exposes ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("the API client sends no tenant or identity parameter", () => {
    const client = strip(read("src/lib/ot-operations/api.ts"));
    for (const forbidden of [/organizationId/, /\buserId\b/, /allowedSiteIds/, /\brole\b/]) {
      expect(client, `the client sends ${forbidden}`).not.toMatch(forbidden);
    }
    // The tenant is resolved from the session on the server.
    expect(client).toMatch(/credentials: "same-origin"/);
  });

  it("the API client never surfaces a server message to the UI", () => {
    const client = strip(read("src/lib/ot-operations/api.ts"));
    // The server's `message` strings are fixed English; the UI maps `code` to
    // its own localized wording.
    expect(client).not.toMatch(/body\?\.message|json\.message|\.message\b(?!\s*=)/);
    expect(client).toMatch(/classify\(/);
  });
});

/* ── Claim integrity ────────────────────────────────────────────────────── */

describe("94C1 — the UI makes no claim the data cannot support", () => {
  it.each(ALL)("%s invents no connectivity, health or security state", (file) => {
    const source = strip(read(file));
    for (const forbidden of [
      /\bisOnline\b/i, /\boffline\b/i, /\buptime\b/i, /\bheartbeat\b/i,
      /healthScore/i, /securityScore/i, /packetCount/i, /telemetryRate/i,
      /connectionStatus/i, /\bavailability\b/i,
    ]) {
      expect(source, `${file} invents ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s derives last-seen from nothing but lastSeenAt", (file) => {
    const source = strip(read(file));
    // Falling back to createdAt/updatedAt would turn "never observed" into a
    // timestamp, erasing the distinction the field exists to make.
    expect(source).not.toMatch(/lastSeenAt\s*(\?\?|\|\|)\s*(row\.)?(createdAt|updatedAt)/);
  });

  it("no component re-filters or re-sorts the server's rows", () => {
    for (const file of COMPONENTS) {
      const source = strip(read(file));
      // Local narrowing would contradict `total` and the server's pagination.
      expect(source, `${file} filters rows locally`).not.toMatch(/rows\.filter\(|items\.filter\(/);
      expect(source, `${file} sorts rows locally`).not.toMatch(/rows\.sort\(|items\.sort\(/);
    }
  });

  it("the total is taken from the response and never recomputed", () => {
    const pagination = strip(read("src/components/ot-edge-operations/OtPagination.tsx"));
    expect(pagination).toMatch(/total: number/);
    expect(pagination).not.toMatch(/rows\.length|items\.length/);
  });

  it("no fabricated placeholder text exists anywhere in the catalogs", () => {
    const serialized = JSON.stringify({ en: en.otEdge, fa: fa.otEdge, de: de.otEdge });
    for (const fabricated of ["Unknown Device", "Generic Vendor", "Standard Protocol", "Unknown Vendor", "N/A"]) {
      expect(serialized, `${fabricated} appears in a catalog`).not.toContain(fabricated);
    }
  });
});

/* ── Localization ───────────────────────────────────────────────────────── */

type Tree = Record<string, unknown>;
const leaves = (node: unknown, prefix = ""): Array<[string, string]> => {
  if (node !== null && typeof node === "object") {
    return Object.entries(node as Tree).flatMap(([key, value]) =>
      leaves(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [[prefix, String(node)]];
};

describe("94C1 — the otEdge namespace is complete in all three locales", () => {
  const catalogs = {
    en: (en as unknown as Tree).otEdge,
    fa: (fa as unknown as Tree).otEdge,
    de: (de as unknown as Tree).otEdge,
  };

  it("holds an identical key set in en, fa and de", () => {
    const paths = (tree: unknown) => leaves(tree).map(([path]) => path).sort();
    expect(paths(catalogs.fa)).toEqual(paths(catalogs.en));
    expect(paths(catalogs.de)).toEqual(paths(catalogs.en));
  });

  it.each(["en", "fa", "de"] as const)("%s has no empty leaf", (locale) => {
    for (const [path, value] of leaves(catalogs[locale])) {
      expect(value.trim(), `${locale}.${path} is empty`).not.toBe("");
    }
  });

  it("keeps ICU argument names identical across locales", () => {
    const args = (tree: unknown) =>
      leaves(tree).map(([path, value]) => [path, [...value.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",")]);
    expect(args(catalogs.fa)).toEqual(args(catalogs.en));
    expect(args(catalogs.de)).toEqual(args(catalogs.en));
  });

  it("uses Persian ye and kaf, never the Arabic forms", () => {
    for (const [path, value] of leaves(catalogs.fa)) {
      expect(value, `fa.${path} contains Arabic ye`).not.toContain("ي");
      expect(value, `fa.${path} contains Arabic kaf`).not.toContain("ك");
    }
  });

  it("carries no Persian text in the German catalog", () => {
    for (const [path, value] of leaves(catalogs.de)) {
      expect(/[؀-ۿ]/.test(value), `de.${path} contains Persian characters`).toBe(false);
    }
  });

  it("translates the Persian catalog rather than carrying English over", () => {
    const enLeaves = leaves(catalogs.en);
    const faLeaves = leaves(catalogs.fa);
    const identical = faLeaves.filter(([path, value], index) => value === enLeaves[index][1] && !/^enums\./.test(path));
    // Only closed technical tokens may legitimately match, and none currently do.
    expect(identical.map(([path, value]) => `${path} = ${value}`)).toEqual([]);
  });

  it.each(COMPONENTS.filter((f) => f.endsWith(".tsx")))("%s hard-codes no visible English", (file) => {
    const source = strip(read(file));
    // A JSX text node of two or more Latin words is prose that escaped the
    // catalog. Class names, imports and props are excluded by the shape.
    const prose = [...source.matchAll(/>\s*([A-Z][a-z]+(?: [a-z]+){2,})\s*</g)].map((m) => m[1]);
    expect(prose).toEqual([]);
  });

  it("formats dates through the shared locale utilities only", () => {
    for (const file of [...COMPONENTS, ...PAGES]) {
      const source = strip(read(file));
      expect(source, `${file} formats a date directly`).not.toMatch(/toLocaleDateString|toLocaleTimeString|toLocaleString/);
      expect(source, `${file} hard-codes a locale tag`).not.toMatch(/"(fa-IR|en-US|de-DE)"/);
    }
  });
});

/* ── Navigation and authorization ───────────────────────────────────────── */

describe("94C1 — navigation is discoverability, not authorization", () => {
  const item = APP_NAV_GROUPS.flatMap((group) => group.items).find((i) => i.href === "/dashboard/ot");

  it("registers exactly one OT Edge entry, in the operations group", () => {
    expect(item).toBeDefined();
    expect(item?.labelKey).toBe("otEdge");
    const group = APP_NAV_GROUPS.find((g) => g.items.some((i) => i.href === "/dashboard/ot"));
    expect(group?.groupKey).toBe("operations");
  });

  it("declares the same capability the layout's guard enforces", () => {
    // Visibility can never exceed the page guard, which is what the registry's
    // own invariant test checks for every item.
    expect(item?.pageCapability).toBe("authoring");
    expect(strip(read("src/app/[locale]/dashboard/ot/layout.tsx"))).toMatch(/capability="authoring"/);
  });

  it("shows the entry only to roles that can open the page", () => {
    const roles: Role[] = ["superadmin", "admin", "engineer", "customer", "viewer", "candidate", "vendor"];
    for (const role of roles) {
      const visible = isAppNavItemVisible(role, item!);
      expect(visible).toBe(can(role, "authoring") && isAuthorizedForPath(role, `/en/dashboard/ot`));
    }
  });

  it("keeps the route protected regardless of what navigation shows", () => {
    // Hiding a link is presentation. The middleware pattern is the boundary.
    for (const locale of ["en", "fa", "de"]) {
      expect(isProtectedPath(`/${locale}/dashboard/ot`)).toBe(true);
      expect(isProtectedPath(`/${locale}/dashboard/ot/gateways`)).toBe(true);
    }
    expect(isAuthorizedForPath("candidate", "/en/dashboard/ot")).toBe(false);
    expect(isAuthorizedForPath("viewer", "/en/dashboard/ot")).toBe(false);
  });

  it("leaves the OT org permissions untouched — the API is still the authority", () => {
    // The UI never consults these; they are asserted here through the public
    // `can` — the map itself is module-private — so a UI phase that quietly
    // widened the OT permissions would fail.
    const ORG_ROLES: OrgRole[] = ["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"];
    const holders = (permission: "view_ot_gateway" | "manage_ot_gateway" | "view_ot_device" | "manage_ot_device") =>
      ORG_ROLES.filter((role) => orgCan(role, permission));

    expect(holders("view_ot_gateway")).toEqual(["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"]);
    expect(holders("manage_ot_gateway")).toEqual(["OWNER", "ADMIN", "MANAGER"]);
    expect(holders("view_ot_device")).toEqual(["OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"]);
    expect(holders("manage_ot_device")).toEqual(["OWNER", "ADMIN", "MANAGER"]);
  });

  it("adds no second authorization system in the UI", () => {
    for (const file of ALL) {
      const source = strip(read(file));
      expect(source, `${file} authorizes in the client`).not.toMatch(/requirePermission|requireOrgActor|hasPermission|OrgPermission/);
    }
  });
});

/* ── The client honours the verified contract ───────────────────────────── */

describe("94C1 — only the documented query keys can be sent", () => {
  it("the query builder emits nothing outside the contract", () => {
    const query = strip(read("src/lib/ot-operations/query.ts"));
    const emitted = [...query.matchAll(/\["([a-zA-Z]+)",/g)].map((m) => m[1]);
    const allowed = new Set(["lifecycle", "siteId", "capability", "category", "search", "page", "pageSize", "sortBy", "sortDir"]);
    for (const key of emitted) {
      expect(allowed.has(key), `the UI can emit an unsupported key: ${key}`).toBe(true);
    }
  });

  it("the documented contract file still exists and is the stated source", () => {
    const contract = read("docs/OT_API_CONTRACT.md");
    expect(contract).toContain("GET /api/ot/gateways");
    expect(contract).toContain("GET /api/ot/devices");
    // The two limitations the UI is built around.
    expect(contract).toContain("**No `category` parameter exists.**");
    expect(contract).toContain("**No `vendor` / `manufacturer` parameter exists.**");
  });
});
