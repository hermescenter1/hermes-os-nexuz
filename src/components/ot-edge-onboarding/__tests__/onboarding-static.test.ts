import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 94C2 — source-level guarantees for the onboarding surface.
 *
 * These hold every file in the directory to the same rules, discovered rather
 * than listed, so a component added later inherits them without anyone
 * remembering. They catch what a runtime test cannot: a future form that
 * imports Prisma, adds a delete action, spreads a DTO into a payload, or
 * hard-codes an English sentence.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

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

const COMPONENTS = filesUnder("src/components/ot-edge-onboarding", [".ts", ".tsx"]);
const LIB = ["src/lib/ot-operations/write-contract.ts", "src/lib/ot-operations/mutations.ts"];
const PAGES = [
  "src/app/[locale]/dashboard/ot/gateways/new/page.tsx",
  "src/app/[locale]/dashboard/ot/gateways/[id]/edit/page.tsx",
  "src/app/[locale]/dashboard/ot/devices/new/page.tsx",
  "src/app/[locale]/dashboard/ot/devices/[id]/edit/page.tsx",
];
const ALL = [...COMPONENTS, ...LIB, ...PAGES];

/* ── Server boundary ────────────────────────────────────────────────────── */

describe("94C2 — the onboarding UI reaches no server internal", () => {
  it.each(ALL)("%s imports no Prisma, repository or authorization module", (file) => {
    const source = strip(read(file));
    for (const forbidden of [
      /@prisma\/client/,
      /PrismaClient/,
      /getPrisma\s*\(/,
      /ot-edge\/persistence/,
      /ot-edge\/services/,
      /ot-edge\/machine-context/,
      /ot-edge\/envelope-signature/,
      /ot-edge\/http\//,
      /lib\/org\/rbac/,
      /lib\/auth\/session/,
      /requirePermission/,
      /requireOrgActor/,
      /OrgPermission/,
    ]) {
      expect(source, `${file} must not reference ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s never calls the machine ingestion endpoint", (file) => {
    const source = strip(read(file));
    // Ingestion is authenticated by an HMAC only a gateway holds. A browser
    // calling it could never succeed, and offering it would imply otherwise.
    expect(source).not.toMatch(/envelopes/);
    expect(source).not.toMatch(/x-hermes-ingestion-id/i);
  });

  it.each(ALL)("%s handles no credential or signing material", (file) => {
    const source = strip(read(file))
      // The deny-list NAMES these so a payload can never carry one; scanning it
      // would flag the guard for doing its job.
      .replace(/FORBIDDEN_WRITE_FIELDS[\s\S]*?\] as const\);/g, "");
    for (const forbidden of [
      /signingKeyRef/,
      /secretRef/,
      /\bcredential\b/i,
      /\bprivateKey\b/i,
      /\bpassword\b/i,
      /ingestionId/,
      /\bnonce\b/i,
      /idempotencyKey/,
      /HMAC/,
    ]) {
      expect(source, `${file} references ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s writes nothing to browser storage", (file) => {
    const source = strip(read(file));
    // No established encrypted-draft convention exists in this repository, so
    // the default holds: a form draft is never persisted.
    for (const forbidden of [/localStorage/, /sessionStorage/, /document\.cookie/, /indexedDB/]) {
      expect(source, `${file} uses ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ALL)("%s logs nothing", (file) => {
    const source = strip(read(file));
    // A logged payload is a logged form submission.
    expect(source).not.toMatch(/console\.(log|error|warn|info|debug)/);
    expect(source).not.toMatch(/\blogger\./);
  });

  it.each(ALL)("%s adds no polling or socket", (file) => {
    const source = strip(read(file));
    for (const forbidden of [/setInterval/, /WebSocket/, /EventSource/, /refetchInterval/]) {
      expect(source, `${file} uses ${forbidden}`).not.toMatch(forbidden);
    }
  });
});

/* ── The operations this surface refuses to offer ───────────────────────── */

describe("94C2 — no destructive or remote-control operation exists", () => {
  it.each(ALL)("%s exposes no delete, restart, rotate or command action", (file) => {
    const source = strip(read(file));
    for (const forbidden of [
      /method:\s*"DELETE"/,
      /\bdeleteGateway\b/,
      /\bdeleteDevice\b/,
      /\bremoveRecord\b/,
      /rebootDevice/i,
      /restartGateway/i,
      /firmwareUpdate/i,
      /rotateKey/i,
      /revokeCredential/i,
      /pushConfiguration/i,
      /remoteCommand/i,
      /writeTag/i,
      /actuate/i,
      /setpoint/i,
    ]) {
      expect(source, `${file} exposes ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("the mutation client speaks only POST and PATCH", () => {
    const source = strip(read("src/lib/ot-operations/mutations.ts"));
    const methods = [...source.matchAll(/"(GET|POST|PATCH|PUT|DELETE)"/g)].map((m) => m[1]);
    expect(new Set(methods)).toEqual(new Set(["GET", "POST", "PATCH"]));
  });

  it("writes reach only the four documented endpoints", () => {
    const source = strip(read("src/lib/ot-operations/mutations.ts"));
    const paths = [...source.matchAll(/"(\/api\/[^"`]*)"|`(\/api\/[^`]*)`/g)]
      .map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, "{id}"))
      .sort();
    expect([...new Set(paths)]).toEqual([
      "/api/industrial/assets",
      "/api/industrial/gateways",
      "/api/ot/devices",
      "/api/ot/devices/{id}",
      "/api/ot/gateways",
      "/api/ot/gateways/{id}",
    ]);
  });
});

/* ── Payload construction ───────────────────────────────────────────────── */

describe("94C2 — a payload is mapped by name, never spread", () => {
  it.each([...COMPONENTS, ...LIB])("%s spreads no record into a mutation", (file) => {
    const source = strip(read(file));
    for (const forbidden of [/\.\.\.record/, /\.\.\.dto/, /\.\.\.body/, /\.\.\.formValues/]) {
      expect(source, `${file} spreads ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("the mutation client sends no tenant or actor field", () => {
    const source = strip(read("src/lib/ot-operations/mutations.ts"));
    for (const forbidden of [/organizationId/, /tenantId/, /\buserId\b/, /allowedSiteIds/]) {
      expect(source, `the client sends ${forbidden}`).not.toMatch(forbidden);
    }
    // The tenant is derived from the session cookie on the server.
    expect(source).toMatch(/credentials: "same-origin"/);
    // Without this header the bounded body reader answers 415.
    expect(source).toMatch(/"Content-Type": "application\/json"/);
  });

  it("the mutation client never surfaces a server message", () => {
    const source = strip(read("src/lib/ot-operations/mutations.ts"));
    // Those strings are fixed English; the UI maps `code` to its own wording.
    expect(source).not.toMatch(/parsed\?\.message|body\.message/);
    expect(source).toMatch(/classifyWrite\(/);
  });
});

/* ── Routes and shell ───────────────────────────────────────────────────── */

describe("94C2 — the onboarding routes reuse the existing protected shell", () => {
  it.each(PAGES)("%s adds no layout, guard or shell of its own", (page) => {
    const source = strip(read(page));
    // The existing /dashboard/ot layout supplies AppShell, the sub-navigation
    // and RequireCapability. A second one here would be a parallel shell.
    expect(source).not.toMatch(/AppShell/);
    expect(source).not.toMatch(/RequireCapability/);
    expect(source).not.toMatch(/OtSubNav/);
  });

  it.each(PAGES)("%s owns exactly one h1 through the shared PageHeader", (page) => {
    const source = strip(read(page));
    expect(source).toMatch(/PageHeader/);
    expect(source).toMatch(/level="page"/);
    expect(source).not.toMatch(/<h1/);
  });

  it.each(PAGES)("%s performs no fetch and holds no tenant value", (page) => {
    const source = strip(read(page));
    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/organizationId|siteId/);
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

describe("94C2 — the onboarding catalog is complete in all three locales", () => {
  const catalogs = {
    en: ((en as unknown as Tree).otEdge as Tree).onboarding,
    fa: ((fa as unknown as Tree).otEdge as Tree).onboarding,
    de: ((de as unknown as Tree).otEdge as Tree).onboarding,
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

  it("carries no English in Persian and no Persian in German", () => {
    const enLeaves = leaves(catalogs.en);
    const faLeaves = leaves(catalogs.fa);
    const carried = faLeaves.filter(([, value], index) => value === enLeaves[index][1]);
    expect(carried.map(([path]) => path)).toEqual([]);

    for (const [path, value] of leaves(catalogs.de)) {
      expect(/[؀-ۿ]/.test(value), `de.${path} contains Persian characters`).toBe(false);
    }
  });

  it("uses the agreed Persian terminology", () => {
    const faTree = catalogs.fa as Tree;
    const gateway = faTree.gateway as Record<string, string>;
    const device = faTree.device as Record<string, string>;
    const success = faTree.success as Record<string, string>;
    const errors = faTree.errors as Record<string, string>;

    expect(gateway.createTitle).toBe("ثبت درگاه");
    expect(gateway.editTitle).toBe("ویرایش درگاه");
    expect(device.createTitle).toBe("ثبت تجهیز");
    expect(device.editTitle).toBe("ویرایش تجهیز");
    expect(device.engineeringIdLabel).toBe("شناسه مهندسی");
    expect((faTree.site as Record<string, string>).label).toBe("سایت صنعتی");
    expect(success.gatewayTitle).toBe("ثبت با موفقیت انجام شد");
    // A sentence in the catalog, so the agreed phrase is asserted as a prefix.
    expect(errors.DUPLICATE_IDENTIFIER).toContain("این شناسه قبلاً ثبت شده است");
  });

  it("claims nothing in any locale that registration cannot support", () => {
    // The denial sentences are removed first: they contain this vocabulary
    // precisely in order to deny it.
    for (const locale of ["en", "fa", "de"] as const) {
      const success = (catalogs[locale] as Tree).success as Record<string, string>;
      const denials = [success.gatewayBody, success.deviceBody];
      const rest = leaves(catalogs[locale])
        .map(([, value]) => value)
        .filter((value) => !denials.includes(value))
        .join(" ")
        .toLowerCase();
      const forbidden =
        locale === "fa"
          ? ["آنلاین", "متصل است", "سالم است"]
          : locale === "de"
            ? ["ist verbunden", "ist online", "ist fehlerfrei"]
            : ["is connected", "is online", "is healthy", "telemetry is flowing"];
      for (const claim of forbidden) {
        expect(rest, `${locale} claims "${claim}"`).not.toContain(claim);
      }
    }
  });

  it.each(COMPONENTS.filter((f) => f.endsWith(".tsx")))("%s hard-codes no visible English", (file) => {
    const source = strip(read(file));
    const prose = [...source.matchAll(/>\s*([A-Z][a-z]+(?: [a-z]+){2,})\s*</g)].map((m) => m[1]);
    expect(prose).toEqual([]);
  });

  it.each(COMPONENTS)("%s formats dates only through the shared utilities", (file) => {
    const source = strip(read(file));
    expect(source).not.toMatch(/toLocaleDateString|toLocaleTimeString|toLocaleString/);
    expect(source).not.toMatch(/"(fa-IR|en-US|de-DE)"/);
  });
});
