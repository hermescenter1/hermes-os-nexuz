/**
 * PHASE 99 — static route-security inventory.
 *
 * Enumerates every Next.js App Router API handler (`src/app/api/**\/route.ts`) and
 * derives, PER (path, method), the security posture that the source code actually
 * proves. Nothing here is inferred from UI affordances: a hidden button is not an
 * authorization control, so only guard calls inside the handler body count.
 *
 * The classifier is FAIL-CLOSED. A handler whose body contains no recognised
 * authorization evidence, and which is not on an explicitly justified public /
 * health / webhook surface declaration, is classified `UNKNOWN` — and `UNKNOWN`
 * fails Phase 99 readiness. There is deliberately no "probably fine" bucket.
 *
 * Pure Node stdlib, offline, deterministic, no network, no secrets.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLIC_SURFACE, HEALTH_SURFACE, WEBHOOK_SURFACE } from "./public-surface.mjs";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const API_ROOT = join(REPO_ROOT, "src", "app", "api");

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** The closed classification set. `UNKNOWN` must fail readiness. */
export const ROUTE_CLASSES = [
  "PUBLIC_READ",
  "PUBLIC_WRITE",
  "AUTHENTICATED_USER",
  "TENANT_MEMBER",
  "TENANT_ADMIN",
  "OWNER_ONLY",
  "PLATFORM_ADMIN",
  "WEBHOOK",
  "INTERNAL_HEALTH",
  "UNKNOWN",
];

/**
 * Authorization evidence tokens.
 *
 * `scope` records what the guard actually establishes:
 *   - `tenant`  — resolves the acting organization server-side and enforces a
 *                 permission/membership predicate against it.
 *   - `user`    — establishes an authenticated identity only; any tenant
 *                 predicate must come from elsewhere in the handler.
 *   - `platform`— platform/admin authority (session admin or scoped API key).
 */
export const GUARD_TOKENS = [
  // Tenant-scoped authorization
  { token: "withOtRoute", scope: "tenant" },
  { token: "requireOrgActor", scope: "tenant" },
  { token: "requireOrgContext", scope: "tenant" },
  { token: "requireComplianceOrgScope", scope: "tenant" },
  { token: "requirePermission", scope: "tenant" },
  { token: "requireSiteActor", scope: "tenant" },
  { token: "requireSitePermission", scope: "tenant" },
  { token: "requireWritableOwner", scope: "tenant" },
  { token: "resolveOwnerScope", scope: "tenant" },
  { token: "requireActor", scope: "tenant" },
  { token: "resolveOrgScope", scope: "tenant" },
  { token: "resolveBrainOwner", scope: "tenant" },
  { token: "getOrgActorContext", scope: "tenant" },
  { token: "getSiteActorContext", scope: "tenant" },
  { token: "requireScope", scope: "tenant" },
  // PHASE 103 — the single Live Voice guard. It COMPOSES requireOrgActor and
  // requirePermission (both already tenant-scope tokens above) into one ordered,
  // fail-closed chain shared by the three voice routes, so the acting
  // organization is resolved on the server and a membership + `view_copilot`
  // predicate is enforced against it before any handler body runs. Registering
  // the composite is what keeps the classifier honest about routes that call it;
  // scripts/__tests__/phase103-voice-guard-recognition.test.ts locks both halves
  // — that the routes really delegate to it, and that it really performs the
  // checks this entry vouches for.
  { token: "requireVoiceCopilotActor", scope: "tenant" },
  // Machine identity: the OT gateway authenticates with an HMAC over the
  // envelope using a server-held signing key, and the tenant is read from the
  // gateway record rather than the request.
  { token: "authenticateGateway", scope: "tenant" },
  // Platform / API-key authority
  { token: "requirePlatformAuth", scope: "platform" },
  { token: "requirePlatformSuperadmin", scope: "platform" },
  { token: "authorizePlatformActor", scope: "platform" },
  { token: "requireAdmin", scope: "platform" },
  // Authenticated identity
  { token: "getCurrentUser", scope: "user" },
  { token: "getAuthRole", scope: "user" },
  { token: "resolveRequestSession", scope: "user" },
  { token: "requireAuthoring", scope: "user" },
  { token: "hasAuthoring", scope: "user" },
  { token: "getUserIdFromRequest", scope: "user" },
  { token: "verifyAccessToken", scope: "user" },
  { token: "requireRecentAuth", scope: "user" },
  { token: "verifySession", scope: "user" },
  { token: "getSessionUser", scope: "user" },
  { token: "getTokenUser", scope: "user" },
  // Refresh rotation authenticates by claiming a hashed refresh token atomically;
  // possession of the token IS the credential this endpoint checks.
  { token: "rotateRefreshToken", scope: "user" },
];

/** Tokens that prove a webhook authenticates its sender cryptographically. */
export const WEBHOOK_SIGNATURE_TOKENS = [
  "constructEvent",
  "verifySignature",
  "timingSafeEqual",
  "createHmac",
  "verifyWebhookSignature",
];

/** Prisma mutation calls — used by the state-change-on-GET (CSRF) invariant. */
export const MUTATION_TOKENS = [
  ".create(",
  ".createMany(",
  ".update(",
  ".updateMany(",
  ".upsert(",
  ".delete(",
  ".deleteMany(",
  "$executeRaw",
  "$transaction(",
];

/** Recursively collect `route.ts` files under src/app/api. */
export function collectRouteFiles(apiRoot = API_ROOT) {
  const out = [];
  if (!existsSync(apiRoot)) return out;
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        walk(full);
      } else if (name === "route.ts" || name === "route.tsx") {
        out.push(full);
      }
    }
  };
  walk(apiRoot);
  return out.sort();
}

/** `src/app/api/foo/[id]/route.ts` → `/api/foo/[id]` (POSIX, stable on Windows). */
export function toApiPath(absFile, repoRoot = REPO_ROOT) {
  const rel = relative(join(repoRoot, "src", "app"), absFile).split(sep).join("/");
  return "/" + rel.replace(/\/route\.tsx?$/, "");
}

/**
 * Strip line and block comments so a guard name mentioned only in prose can
 * never be mistaken for a real call. String literals are preserved (permission
 * names live in them) — this is a comment stripper, not a tokenizer.
 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  let mode = "code"; // code | line | block | single | double | tick
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && d === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") mode = "single";
      else if (c === '"') mode = "double";
      else if (c === "`") mode = "tick";
      out += c; i += 1; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; }
      i += 1; continue;
    }
    if (mode === "block") {
      if (c === "*" && d === "/") { mode = "code"; i += 2; continue; }
      if (c === "\n") out += c; // keep line numbering usable
      i += 1; continue;
    }
    // inside a string literal
    if (c === "\\") { out += c + (d ?? ""); i += 2; continue; }
    if ((mode === "single" && c === "'") || (mode === "double" && c === '"') || (mode === "tick" && c === "`")) {
      mode = "code";
    }
    out += c; i += 1;
  }
  return out;
}

/**
 * Extract each exported HTTP handler body by brace matching.
 *
 * Handles both `export async function GET(...) { ... }` and
 * `export const GET = <expr>;` (including `withOtRoute(...)` wrappers, whose
 * body is the argument list rather than a block).
 */
export function extractHandlers(strippedSource) {
  const handlers = {};
  for (const method of HTTP_METHODS) {
    const fnRe = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`);
    const constRe = new RegExp(`export\\s+const\\s+${method}\\s*(?::[^=]*)?=`);
    const fnMatch = fnRe.exec(strippedSource);
    if (fnMatch) {
      // The parameter list itself contains braces (`{ params }: { params: … }`),
      // so close the parens FIRST and only then take the next `{` as the body.
      const parenOpen = fnMatch.index + fnMatch[0].length - 1;
      const params = balanced(strippedSource, parenOpen, "(", ")");
      const open = findBodyBrace(strippedSource, parenOpen + params.length);
      if (open !== -1) handlers[method] = balanced(strippedSource, open, "{", "}");
      continue;
    }
    const constMatch = constRe.exec(strippedSource);
    if (constMatch) {
      // Take everything up to the next top-level `export ` or end of file. This
      // over-approximates the body, which is safe: it can only ADD evidence for
      // the state-change/mutation checks, and guard attribution for a wrapper
      // form (`export const GET = withOtRoute(...)`) needs the wrapper call.
      const start = constMatch.index + constMatch[0].length;
      const nextExport = strippedSource.indexOf("\nexport ", start);
      handlers[method] = strippedSource.slice(start, nextExport === -1 ? undefined : nextExport);
    }
  }
  return handlers;
}

/**
 * Find the `{` that opens a function BODY, starting after its parameter list.
 *
 * A return-type annotation may itself contain braces (`): Promise<{ id: string }>`),
 * so a naive `indexOf("{")` grabs the type and hides every guard call in the real
 * body. Only a `{` seen at generic-angle depth 0 can open the body.
 */
function findBodyBrace(text, from) {
  let angle = 0;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === "<") angle += 1;
    else if (c === ">") { if (angle > 0) angle -= 1; }
    else if (c === "{" && angle === 0) return i;
    else if (c === ";" && angle === 0) return -1; // overload signature, no body
  }
  return -1;
}

function balanced(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return text.slice(openIdx);
}

/** Guard evidence found in a handler body (plus module-level helper bodies). */
export function guardEvidence(body, moduleSource) {
  const found = [];
  for (const g of GUARD_TOKENS) {
    const re = new RegExp(`\\b${g.token}\\s*\\(`);
    if (re.test(body)) { found.push(g); continue; }
    // A handler may delegate to a module-local helper (`const gate = () =>
    // requireOrgActor(...)`). Only count that when the handler calls a local
    // symbol whose module-level definition contains the guard.
    for (const local of localHelperNames(moduleSource)) {
      if (new RegExp(`\\b${local}\\s*\\(`).test(body) && helperBodyHasToken(moduleSource, local, g.token)) {
        found.push(g);
        break;
      }
    }
  }
  // de-duplicate by token
  const seen = new Set();
  return found.filter((g) => (seen.has(g.token) ? false : (seen.add(g.token), true)));
}

function localHelperNames(moduleSource) {
  const names = new Set();
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|(?:^|\n)\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
  let m;
  while ((m = re.exec(moduleSource))) {
    const name = m[1] ?? m[2];
    if (name && !HTTP_METHODS.includes(name)) names.add(name);
  }
  return names;
}

function helperBodyHasToken(moduleSource, helperName, token) {
  const idx = moduleSource.search(new RegExp(`(?:function\\s+${helperName}\\s*\\(|const\\s+${helperName}\\s*=)`));
  if (idx === -1) return false;
  // Skip the parameter list before looking for the body brace — a return-type
  // annotation such as `): Promise<{ sub: string }>` would otherwise be mistaken
  // for the function body and hide every guard call inside it.
  const paren = moduleSource.indexOf("(", idx);
  const afterParams = paren === -1 ? idx : paren + balanced(moduleSource, paren, "(", ")").length;
  const open = findBodyBrace(moduleSource, afterParams);
  if (open === -1) return false;
  return new RegExp(`\\b${token}\\s*\\(`).test(balanced(moduleSource, open, "{", "}"));
}

function declaredSurface(list, apiPath, method) {
  return list.find((e) => e.path === apiPath && e.methods.includes(method)) ?? null;
}

/** Classify one (apiPath, method) pair from static evidence. Fail-closed. */
export function classifyHandler({ apiPath, method, body, moduleSource }) {
  const guards = guardEvidence(body, moduleSource);
  const scopes = new Set(guards.map((g) => g.scope));
  const evidence = guards.map((g) => g.token).sort();

  const health = declaredSurface(HEALTH_SURFACE, apiPath, method);
  if (health) {
    return { classification: "INTERNAL_HEALTH", evidence, declared: true, justification: health.justification };
  }

  const webhook = declaredSurface(WEBHOOK_SURFACE, apiPath, method);
  if (webhook) {
    const signed = WEBHOOK_SIGNATURE_TOKENS.some((t) => body.includes(t) || moduleSource.includes(t));
    return {
      classification: "WEBHOOK",
      evidence,
      declared: true,
      justification: webhook.justification,
      senderAuthenticated: signed,
    };
  }

  const pub = declaredSurface(PUBLIC_SURFACE, apiPath, method);
  if (pub) {
    return {
      classification: method === "GET" || method === "HEAD" || method === "OPTIONS" ? "PUBLIC_READ" : "PUBLIC_WRITE",
      evidence,
      declared: true,
      justification: pub.justification,
    };
  }

  // Undeclared surfaces must PROVE authorization in the handler body.
  if (apiPath.startsWith("/api/admin/")) {
    return scopes.size > 0
      ? { classification: "PLATFORM_ADMIN", evidence, declared: false }
      : { classification: "UNKNOWN", evidence, declared: false, reason: "admin path with no authorization evidence" };
  }
  if (scopes.has("platform")) return { classification: "PLATFORM_ADMIN", evidence, declared: false };
  if (scopes.has("tenant")) return { classification: "TENANT_MEMBER", evidence, declared: false };
  if (scopes.has("user")) return { classification: "AUTHENTICATED_USER", evidence, declared: false };

  return { classification: "UNKNOWN", evidence, declared: false, reason: "no authorization evidence and no declared public surface" };
}

/** Does this handler body perform a persistence mutation? */
export function hasMutation(body) {
  return MUTATION_TOKENS.some((t) => body.includes(t));
}

/** Build the full inventory. Deterministic ordering. */
export function buildRouteInventory({ repoRoot = REPO_ROOT } = {}) {
  const files = collectRouteFiles(join(repoRoot, "src", "app", "api"));
  const routes = [];
  for (const abs of files) {
    const apiPath = toApiPath(abs, repoRoot);
    const raw = readFileSync(abs, "utf8");
    const src = stripComments(raw);
    const handlers = extractHandlers(src);
    const file = relative(repoRoot, abs).split(sep).join("/");
    for (const method of HTTP_METHODS) {
      const body = handlers[method];
      if (body === undefined) continue;
      const c = classifyHandler({ apiPath, method, body, moduleSource: src });
      routes.push({
        file,
        apiPath,
        method,
        classification: c.classification,
        authEvidence: c.evidence,
        declaredSurface: c.declared === true,
        justification: c.justification ?? null,
        reason: c.reason ?? null,
        senderAuthenticated: c.senderAuthenticated ?? null,
        tenantScoped: c.classification === "TENANT_MEMBER" || c.classification === "TENANT_ADMIN" || c.classification === "OWNER_ONLY",
        mutates: hasMutation(body),
      });
    }
  }
  routes.sort((a, b) => (a.apiPath === b.apiPath ? a.method.localeCompare(b.method) : a.apiPath.localeCompare(b.apiPath)));
  return routes;
}

/** Aggregate counters used by the readiness evaluator and the committed report. */
export function summarizeInventory(routes) {
  const byClass = {};
  for (const cls of ROUTE_CLASSES) byClass[cls] = 0;
  for (const r of routes) byClass[r.classification] = (byClass[r.classification] ?? 0) + 1;
  const tenantBound = routes.filter((r) => r.tenantScoped);
  return {
    routeFiles: new Set(routes.map((r) => r.file)).size,
    handlers: routes.length,
    byClassification: byClass,
    unknown: byClass.UNKNOWN,
    tenantBoundHandlers: tenantBound.length,
    stateChangingGetHandlers: routes.filter((r) => r.method === "GET" && r.mutates).length,
    unauthenticatedWebhooks: routes.filter((r) => r.classification === "WEBHOOK" && r.senderAuthenticated !== true).length,
  };
}
