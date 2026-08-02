import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * PHASE 94 — source-level guarantees for the machine-credential enrollment
 * surface. These are STRICTER than the onboarding rules because this surface
 * legitimately handles a one-time secret: it must never persist it, log it, or
 * place it in a URL, and it must reach no server internal.
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

const COMPONENTS = filesUnder("src/components/ot-edge-enrollment", [".ts", ".tsx"]);
const CLIENT = ["src/lib/ot-operations/enrollment.ts"];
const ALL = [...COMPONENTS, ...CLIENT];

describe("94 enrollment UI — reaches no server internal", () => {
  it.each(ALL)("%s imports no Prisma, repository, service or crypto module", (file) => {
    const source = strip(read(file));
    for (const forbidden of [
      /@prisma\/client/,
      /PrismaClient/,
      /getPrisma\s*\(/,
      /ot-edge\/persistence/,
      /ot-edge\/services/,
      /ot-edge\/machine-context/,
      /ot-edge\/envelope-signature/,
      /ot-edge\/secret-manager/,
      /ot-edge\/secret-backend/,
      /ot-edge\/http\//,
      /node:crypto/,
    ]) {
      expect(source, `${file} must not reference ${forbidden}`).not.toMatch(forbidden);
    }
  });
});

describe("94 enrollment UI — the one-time secret is never persisted or logged", () => {
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

  it.each(ALL)("%s adds no polling or socket", (file) => {
    const source = strip(read(file));
    for (const forbidden of [/setInterval/, /WebSocket/, /EventSource/, /refetchInterval/]) {
      expect(source, `${file} uses ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("the panel drops the credential from state on acknowledge", () => {
    const source = strip(read("src/components/ot-edge-enrollment/GatewayEnrollmentPanel.tsx"));
    // The one-time value is held only until the operator confirms, then cleared.
    expect(source).toMatch(/setCredential\(null\)/);
  });
});

describe("94 enrollment client — endpoints and methods", () => {
  it("speaks only POST and DELETE to the enrollment endpoints", () => {
    const source = strip(read("src/lib/ot-operations/enrollment.ts"));
    const methods = [...source.matchAll(/"(GET|POST|PATCH|PUT|DELETE)"/g)].map((m) => m[1]);
    expect(new Set(methods)).toEqual(new Set(["POST", "DELETE"]));
  });

  it("reaches only the gateway enrollment sub-tree", () => {
    const source = strip(read("src/lib/ot-operations/enrollment.ts"));
    const paths = [...source.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, "{id}"));
    for (const p of paths) {
      expect(p.startsWith("/api/ot/gateways/{id}/enrollment"), p).toBe(true);
    }
  });

  it("never surfaces a server message and sends no tenant field", () => {
    const source = strip(read("src/lib/ot-operations/enrollment.ts"));
    expect(source).not.toMatch(/parsed\?\.message|body\.message/);
    expect(source).not.toMatch(/organizationId|tenantId|\buserId\b|siteId/);
    expect(source).toMatch(/credentials: "same-origin"/);
  });
});

describe("94 enrollment UI — localization", () => {
  it.each(COMPONENTS.filter((f) => f.endsWith(".tsx")))("%s hard-codes no visible English", (file) => {
    const source = strip(read(file));
    const prose = [...source.matchAll(/>\s*([A-Z][a-z]+(?: [a-z]+){2,})\s*</g)].map((m) => m[1]);
    expect(prose).toEqual([]);
  });

  it.each(COMPONENTS.filter((f) => f.endsWith(".tsx")))("%s formats dates only through shared utilities", (file) => {
    const source = strip(read(file));
    expect(source).not.toMatch(/toLocaleDateString|toLocaleTimeString|toLocaleString/);
    expect(source).not.toMatch(/"(fa-IR|en-US|de-DE)"/);
  });
});
