import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * PHASE 94B4 — source regressions across every Phase 94 route file.
 *
 * These are the checks that survive a NEW route being added later: the
 * behavioural tests only cover handlers someone remembered to test, while these
 * enumerate the route tree and hold every file to the same rules.
 */

const API = resolve(process.cwd(), "src/app/api");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

/** Every Phase 94 route file, discovered rather than hard-coded. */
function phase94Routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "route.ts") out.push(p);
    }
  };
  for (const root of ["ot", "engineering"]) walk(join(API, root));
  return out;
}

const ROUTES = phase94Routes();
const rel = (p: string) => p.replace(API, "").replace(/\\/g, "/");

/**
 * PHASE 94B4.1 — the routes a MACHINE calls.
 *
 * Listed explicitly, and asserted below to be exactly this one file, so that a
 * future route cannot quietly opt out of the human gates by looking like a
 * gateway endpoint. Everything not named here must still go through
 * `withOtRoute`.
 */
const MACHINE_ROUTES = ["/ot/gateways/[id]/envelopes/route.ts"];
const HUMAN_ROUTES = ROUTES.map(rel).filter((r) => !MACHINE_ROUTES.includes(r));
const src = (r: string) => strip(readFileSync(join(API, r.slice(1)), "utf8"));

describe("94B4 — the route tree is complete", () => {
  it("discovers every expected route file", () => {
    const found = ROUTES.map(rel).sort();
    expect(found).toEqual(
      [
        "/engineering/findings/[id]/route.ts",
        "/engineering/imports/[id]/route.ts",
        "/engineering/imports/route.ts",
        "/engineering/projects/[id]/alarms/route.ts",
        "/engineering/projects/[id]/analyze/route.ts",
        "/engineering/projects/[id]/findings/route.ts",
        "/engineering/projects/[id]/network/route.ts",
        "/engineering/projects/[id]/route.ts",
        "/engineering/projects/[id]/tags/route.ts",
        "/engineering/projects/route.ts",
        "/ot/devices/[id]/route.ts",
        "/ot/devices/route.ts",
        "/ot/gateways/[id]/envelopes/route.ts",
        "/ot/gateways/[id]/route.ts",
        "/ot/gateways/route.ts",
      ].sort(),
    );
  });

  it("exports exactly nineteen HTTP handlers", () => {
    let handlers = 0;
    for (const p of ROUTES) {
      handlers += (strip(readFileSync(p, "utf8")).match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? []).length;
    }
    expect(handlers).toBe(19);
  });

  it("exposes no DELETE or PUT — Phase 94 is read and advisory only", () => {
    for (const p of ROUTES) {
      const code = strip(readFileSync(p, "utf8"));
      expect(code, `${rel(p)} must not expose DELETE`).not.toMatch(/export async function DELETE/);
      expect(code, `${rel(p)} must not expose PUT`).not.toMatch(/export async function PUT/);
    }
  });
});

describe("94B4 — every route is gated and thin", () => {
  it.each(HUMAN_ROUTES)("%s routes every handler through withOtRoute", (r) => {
    const code = strip(readFileSync(join(API, r.slice(1)), "utf8"));
    const handlers = (code.match(/export async function (GET|POST|PATCH)\b/g) ?? []).length;
    const gated = (code.match(/withOtRoute\(/g) ?? []).length;
    // One gate per handler: authentication, membership, permission, rate limit
    // and trusted-context construction all live inside it.
    expect(gated, `${r}: ${handlers} handlers but ${gated} gates`).toBe(handlers);
  });

  it.each(HUMAN_ROUTES)("%s declares a permission for every gate", (r) => {
    const code = strip(readFileSync(join(API, r.slice(1)), "utf8"));
    const gates = (code.match(/withOtRoute\(/g) ?? []).length;
    const perms = (code.match(/permission:\s*"/g) ?? []).length;
    const buckets = (code.match(/bucket:\s*"/g) ?? []).length;
    expect(perms).toBe(gates);
    expect(buckets, "every gate needs a rate-limit bucket").toBe(gates);
  });

  it.each(ROUTES.map(rel))("%s touches no database, crypto or workflow logic", (r) => {
    const code = strip(readFileSync(join(API, r.slice(1)), "utf8"));
    for (const forbidden of [
      /PrismaClient/, /getPrisma\s*\(/, /@prisma\/client/, /prisma\./,
      /createHmac/, /timingSafeEqual/, /computeSignature/,
      /nonces\.reserve/, /reserveNonce/,
      /evaluateTransition/, /upsertDeterministicFindings/,
      /analyzeEnvelope/,
    ]) {
      expect(code, `${r} must not contain ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ROUTES.map(rel))("%s reaches persistence only through the composition module", (r) => {
    const code = strip(readFileSync(join(API, r.slice(1)), "utf8"));
    expect(code).not.toMatch(/from ["']@\/lib\/ot-edge\/persistence\/prisma-adapters["']/);
    if (/repos\./.test(code) || /svc\./.test(code)) {
      expect(code).toMatch(/from ["']@\/lib\/ot-edge\/http\/composition["']/);
    }
  });

  it.each(ROUTES.map(rel))("%s logs nothing at all", (r) => {
    const code = strip(readFileSync(join(API, r.slice(1)), "utf8"));
    // A route that logs is a route that can log a manifest or a signature.
    expect(code).not.toMatch(/console\.(log|error|warn|info|debug)/);
    expect(code).not.toMatch(/logger\./);
  });

  it.each(ROUTES.map(rel))("%s never reads identity from the request payload", (r) => {
    const code = strip(readFileSync(join(API, r.slice(1)), "utf8"));
    for (const forbidden of [
      /body\.organizationId/, /body\.userId/, /body\.actorId/, /body\.role/,
      /body\.allowedSiteIds/, /\.value\.organizationId/,
    ]) {
      expect(code, `${r} must not read ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it.each(ROUTES.map(rel))("%s emits no device or actuation vocabulary", (r) => {
    const code = strip(readFileSync(join(API, r.slice(1)), "utf8"));
    for (const forbidden of [/writeTag/i, /writeValue/i, /actuate/i, /setpoint/i, /acknowledgeAlarm/i, /plcWrite/i, /startEquipment/i, /stopEquipment/i]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});

describe("94B4.1 — the gateway route authenticates a MACHINE, not a person", () => {
  const route = src(MACHINE_ROUTES[0]);
  const ctx = strip(readFileSync(resolve(process.cwd(), "src/lib/ot-edge/machine-context.ts"), "utf8"));

  it("is the only route exempt from the human gates", () => {
    // If a second machine route ever appears, this fails and forces a decision
    // rather than letting the exemption spread silently.
    expect(ROUTES.map(rel).filter((r) => !/withOtRoute/.test(src(r)))).toEqual(MACHINE_ROUTES);
  });

  it("requires no session, no membership and no human permission", () => {
    for (const forbidden of [
      /withOtRoute/, /requireOrgContext/, /requireOrgActor/, /requirePermission/,
      /manage_ot_gateway/, /getCurrentUser/, /getAuthRole/, /buildOtServiceContext/,
      /cookies\(/, /permission:\s*"/,
    ]) {
      expect(route, `the machine route must not use ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("authenticates cryptographically and derives the tenant from the record", () => {
    expect(route).toMatch(/authenticateGateway\(/);
    // The tenant used downstream is the authenticated context, never a value
    // lifted out of the envelope.
    expect(route).toMatch(/svc\.gateway\.ingest\(auth\.ctx/);
    expect(route).not.toMatch(/envelope\.organizationId/);
    expect(route).not.toMatch(/parsed\.organizationId/);
  });

  it("throttles before the lookup and again after authentication", () => {
    const fn = route.slice(route.indexOf("export async function POST"));
    const at = (n: string) => fn.indexOf(n);
    expect(at('checkRateLimit("ot-envelope-preauth"')).toBeGreaterThan(-1);
    // The pre-auth limit precedes the body read AND the lookup, so probing is
    // throttled before it costs a database round trip.
    expect(at('checkRateLimit("ot-envelope-preauth"')).toBeLessThan(at("readRawJsonBody("));
    expect(at("readRawJsonBody(")).toBeLessThan(at("authenticateGateway("));
    // The per-gateway limit comes after authentication, so one device cannot
    // spend another's budget, and before ingestion, so a throttled envelope
    // burns no nonce.
    expect(at("authenticateGateway(")).toBeLessThan(at('checkRateLimit("ot-envelope-gateway"'));
    expect(at('checkRateLimit("ot-envelope-gateway"')).toBeLessThan(at("svc.gateway.ingest("));
  });

  it("answers every authentication failure identically", () => {
    const fn = route.slice(route.indexOf("export async function POST"));
    // One failure helper, no branch that returns a distinguishing status.
    expect((fn.match(/machineAuthFailure\(\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(fn).not.toMatch(/404|403|"NOT_FOUND"|"FORBIDDEN"/);
    const helper = strip(readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/machine-auth.ts"), "utf8"));
    const decl = helper.slice(helper.indexOf("export function machineAuthFailure"));
    expect(decl.slice(0, decl.indexOf("\n}"))).toMatch(/status:\s*401/);
    expect(decl.slice(0, decl.indexOf("\n}"))).toMatch(/GATEWAY_AUTH_FAILED/);
  });

  it("verifies the signature LAST and writes nothing while authenticating", () => {
    const fn = ctx.slice(ctx.indexOf("export async function authenticateGateway"));
    const at = (n: string) => fn.indexOf(n);
    expect(at("GatewayEnvelopeSchema.safeParse")).toBeLessThan(at("input.lookup("));
    expect(at("input.lookup(")).toBeLessThan(at("verifyEnvelopeSignature("));
    expect(at("createHash(")).toBeLessThan(at("verifyEnvelopeSignature("));
    // No write of any kind may appear in the authentication path.
    //
    // The tokens are deliberately precise. A bare /create\(/ or /\.update\(/
    // would match `createHash("sha256").update(...)`, which computes the
    // checksum and touches no database. Loosening them would have been the easy
    // way to make this pass, and would have destroyed what it proves.
    for (const forbidden of [
      /nonces?\.(reserve|create)/,
      /\.create\(\{/,
      /\.createMany\(/,
      /\.updateMany\(/,
      /\$transaction/,
      /repos\./,
      /prisma/i,
    ]) {
      expect(fn, `authentication must not write (${forbidden})`).not.toMatch(forbidden);
    }
  });

  it("the secret is dereferenced from the SERVER record, never the envelope", () => {
    const fn = ctx.slice(ctx.indexOf("export async function authenticateGateway"));
    const call = fn.slice(fn.indexOf("verifyEnvelopeSignature("));
    // The approved reference passed to the verifier is the stored one.
    expect(call).toMatch(/gw\.signingKeyRef\s*\?\?\s*""/);
    expect(call).not.toMatch(/env\.signingKeyRef,\s*\n?\s*\)/);
  });

  it("never fabricates a human identity for a machine", () => {
    for (const forbidden of [/userId/, /\brole\b/, /OrgRole/, /ADMIN/, /can\(/]) {
      expect(ctx, `machine authentication must not mention ${forbidden}`).not.toMatch(forbidden);
    }
    const svc = strip(readFileSync(resolve(process.cwd(), "src/lib/ot-edge/services/gateway-service.ts"), "utf8"));
    expect(svc).toMatch(/actorId:\s*null/);
    expect(svc).not.toMatch(/ctx\.userId/);
  });

  it("logs nothing and never echoes the handle, signature or payload", () => {
    for (const code of [route, ctx]) {
      expect(code).not.toMatch(/console\.(log|error|warn|info|debug)/);
      expect(code).not.toMatch(/logger\./);
    }
    const fn = route.slice(route.indexOf("export async function POST"));
    // The response is built from the service result only; nothing from the
    // request is reflected back.
    expect(fn).not.toMatch(/ingestionId:\s*handle/);
    expect(fn).not.toMatch(/message:\s*`/);
  });
});

describe("94B4 — the shared kit carries the guarantees", () => {
  const kit = strip(readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/route-kit.ts"), "utf8"));
  const body = strip(readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/body.ts"), "utf8"));

  it("no-store is applied to every response built by the kit", () => {
    expect(kit).toMatch(/"Cache-Control":\s*"no-store, max-age=0"/);
  });

  it("the gate order is authenticate → membership → permission → rate limit", () => {
    // Scope to the function BODY: the import block mentions all of these names
    // in a different order and would make the comparison meaningless.
    const fn = kit.slice(kit.indexOf("export async function withOtRoute"));
    const at = (needle: string) => fn.indexOf(needle);
    expect(at("requireOrgContext(req)")).toBeGreaterThan(-1);
    expect(at("requireOrgContext(req)")).toBeLessThan(at("requireOrgActor(req"));
    expect(at("requireOrgActor(req")).toBeLessThan(at("can(actor.ctx.role"));
    // Rate limiting AFTER authentication, so an anonymous flood cannot consume
    // a real user's budget.
    expect(at("can(actor.ctx.role")).toBeLessThan(at("checkRateLimit("));
    // …and the context is built only once every gate has passed.
    expect(at("checkRateLimit(")).toBeLessThan(at("buildOtServiceContext("));
  });

  it("the context is built only from server-resolved values", () => {
    const fn = kit.slice(kit.indexOf("buildOtServiceContext({"));
    const decl = fn.slice(0, fn.indexOf("});"));
    expect(decl).toMatch(/userId:\s*actor\.ctx\.userId/);
    expect(decl).toMatch(/organizationId:\s*actor\.ctx\.orgId/);
    expect(decl).toMatch(/allowedSiteIds:\s*siteIds/);
    expect(decl, "no request-derived identity").not.toMatch(/body|json|searchParams/);
  });

  it("a service hint never reaches the wire", () => {
    // Only the fixed MESSAGE table and the stable code are serialized.
    const fn = kit.slice(kit.indexOf("export function errorResponse"));
    expect(fn.slice(0, fn.indexOf("\n}"))).not.toMatch(/err\.hint/);
  });

  it("the body reader refuses CSV/XML before reading and bounds every read", () => {
    expect(body).toMatch(/REFUSED_TYPES/);
    for (const t of ["text/csv", "application/csv", "application/xml", "text/xml"]) {
      expect(body).toContain(t);
    }
    // Content type and declared length are both checked before the stream read.
    // Scope to the reader's body so the import line does not skew the offsets.
    const fn = body.slice(body.indexOf("export async function readRawJsonBody"));
    expect(fn.indexOf("REFUSED_TYPES.includes")).toBeLessThan(fn.indexOf("await readBoundedTextBody"));
    expect(fn.indexOf("content-length")).toBeLessThan(fn.indexOf("await readBoundedTextBody"));
    expect(body).not.toMatch(/req\.json\(\)/);
  });

  it("the idempotency key is validated but never echoed or logged", () => {
    expect(kit).toMatch(/IDEMPOTENCY_PATTERN/);
    const fn = kit.slice(kit.indexOf("export function readIdempotencyKey"));
    const decl = fn.slice(0, fn.indexOf("\n}"));
    expect(decl).not.toMatch(/console\.|logger\./);
    // The failure branch returns no value at all.
    expect(decl).toMatch(/\{\s*ok:\s*false\s*\}/);
  });

  it("the composition module is the only place services are constructed", () => {
    const comp = strip(readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/composition.ts"), "utf8"));
    expect(comp).toMatch(/createImportService|createAnalysisService|createFindingService|createGatewayEnvelopeService/);
    // The approved provider only — a route never sees secret material.
    expect(comp).toMatch(/envSecretProvider/);
    expect(comp).not.toMatch(/process\.env\.OT_GATEWAY_HMAC/);
  });
});
