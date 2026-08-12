/**
 * PHASE 103 — shared test harness for the Live Voice routes.
 *
 * NOT a test file (vitest collects only `*.test.ts`). It follows the Phase 102
 * media harness deliberately: only the EDGES are replaced — token verification,
 * the session store, the database, the audit sink, the security-event logger,
 * the rate limiter, the entitlement resolver, the API-key verifier and the
 * external provider. Everything the suites actually assert about runs for real:
 *
 *   - `src/lib/copilot/voice/guard.ts`     (the ordered chain)
 *   - `src/lib/copilot/voice/governance.ts` (the fail-closed matrix)
 *   - `src/lib/copilot/voice/grant.ts`      (real HMAC over real claims)
 *   - `src/lib/org/context.ts` + `rbac.ts`  (real membership and permissions)
 *   - `src/lib/security/request-guards.ts`  (the real same-origin decision)
 *
 * A suite that mocked the guard would prove only that the mock was called.
 *
 * NO REAL PROVIDER CALL IS EVER MADE. `@/lib/copilot/voice/provider` is replaced
 * wholesale, and `installNetworkTripwire()` additionally replaces `globalThis
 * .fetch` with a function that FAILS the test if anything reaches it — so a
 * future edit that adds a second outbound call cannot slip past unnoticed.
 */

import { vi, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { BASE_URL } from "@/lib/seo/config";

export type Row = Record<string, unknown>;

/** The organisation and user every suite acts as, unless it says otherwise. */
export const ORG_ID = "org-voice-1";
export const OTHER_ORG_ID = "org-voice-2";
export const USER_ID = "user-voice-engineer";
export const OTHER_USER_ID = "user-voice-other";

export const TRANSCRIPTION_REGISTRY_ID = "openai:gpt-live-transcribe";
export const SPEECH_REGISTRY_ID = "openai:gpt-4o-mini-tts";

/** Long enough to satisfy VOICE_SIGNING_SECRET_MIN_LENGTH. Not a real secret. */
export const TEST_SIGNING_SECRET = "phase103-test-signing-secret-value";

export interface ProviderCall {
  readonly kind: "transcription" | "speech";
  readonly payload: Row;
}

export interface HarnessState {
  /** Verified JWT claims, or null for "no session". */
  payload: { sub: string; role: string; sid?: string } | null;
  sessionActive: boolean;
  /** When set, `requirePlatformAuth` resolves an API-KEY context instead. */
  apiKeyContext: { organizationId: string; scopes: string[] } | null;
  databaseAvailable: boolean;
  rateLimitAllowed: boolean;
  entitlementAllowed: boolean;
  /** Provider behaviour, so a suite can drive the failure paths. */
  providerFails: "none" | "timeout" | "rejected" | "unavailable";
  auditEvents: Row[];
  entitlementCalls: Row[];
  providerCalls: ProviderCall[];
  logCalls: Row[];
  tables: Record<string, Row[]>;
}

/** Every module the suites replace. Unmocked in `afterEach` — `vi.doMock`
 *  otherwise leaks forward across files sharing a worker. */
export const MOCKED_MODULES = [
  "@/lib/auth/jwt",
  "@/lib/auth/session-store",
  "@/lib/api/keys",
  "@/lib/db/prisma",
  "@/lib/audit/audit-service",
  "@/lib/logger",
  "@/lib/logger/security-events",
  "@/lib/auth/rate-limiter",
  "@/lib/billing-governance/runtime/require-entitlement",
  "@/lib/copilot/voice/provider",
  "@/lib/copilot/copilot",
];

export function freshState(): HarnessState {
  return {
    payload: { sub: USER_ID, role: "engineer", sid: "sid-voice-1" },
    sessionActive: true,
    apiKeyContext: null,
    databaseAvailable: true,
    rateLimitAllowed: true,
    entitlementAllowed: true,
    providerFails: "none",
    auditEvents: [],
    entitlementCalls: [],
    providerCalls: [],
    logCalls: [],
    tables: {
      organizationMember: [],
      aiProviderPolicy: [],
    },
  };
}

/* ── A small, fail-closed Prisma double ───────────────────────────────────── */

/**
 * An operator this double does not implement THROWS rather than being ignored.
 * A silently-dropped `where` clause would turn a tenant-scoped query into an
 * unscoped one and make an isolation test pass for the wrong reason.
 */
function matches(row: Row, where: Row): boolean {
  for (const [key, expected] of Object.entries(where ?? {})) {
    if (expected === undefined) continue;
    const actual = row[key];
    if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      const op = expected as Record<string, unknown>;
      if ("in" in op) {
        if (!(op.in as unknown[]).includes(actual)) return false;
        continue;
      }
      throw new Error(`test harness: unsupported where operator on "${key}"`);
    }
    if (actual !== expected) return false;
  }
  return true;
}

function buildModel(state: HarnessState, name: string) {
  const rows = () => (state.tables[name] ??= []);
  return {
    findFirst: async (args?: Row) => rows().find((r) => matches(r, (args?.where as Row) ?? {})) ?? null,
    findMany: async (args?: Row) => rows().filter((r) => matches(r, (args?.where as Row) ?? {})),
    /**
     * Compound-key lookup, as the provider-policy store performs it:
     * `where: { organizationId_providerRegistryId: { organizationId, providerRegistryId } }`.
     * Flattened here so the REAL store code runs unchanged.
     */
    findUnique: async (args?: Row) => {
      const where = ((args?.where as Row) ?? {}) as Row;
      const compound = where.organizationId_providerRegistryId as Row | undefined;
      return rows().find((r) => matches(r, compound ?? where)) ?? null;
    },
  };
}

export function buildPrismaDouble(state: HarnessState) {
  const client: Record<string, unknown> = {};
  for (const name of Object.keys(state.tables)) client[name] = buildModel(state, name);
  return client;
}

/* ── Mock installation ────────────────────────────────────────────────────── */

function providerFailure(state: HarnessState): string | null {
  switch (state.providerFails) {
    case "timeout":
      return "TIMEOUT";
    case "rejected":
      return "PROVIDER_REJECTED";
    case "unavailable":
      return "PROVIDER_UNAVAILABLE";
    default:
      return null;
  }
}

export function installMocks(state: HarnessState): void {
  vi.doMock("@/lib/auth/jwt", () => ({
    verifyAccessToken: async () => state.payload,
    signAccessToken: async () => "unused",
  }));
  vi.doMock("@/lib/auth/session-store", () => ({
    isPayloadSessionActive: async () => state.sessionActive,
  }));
  // The API-key path. Present so a suite can prove a VALID key is still refused
  // by the voice guard — a mock that always failed verification would make that
  // assertion vacuous.
  vi.doMock("@/lib/api/keys", () => ({
    verifyApiKey: async () =>
      state.apiKeyContext
        ? {
            id: "key-1",
            organizationId: state.apiKeyContext.organizationId,
            scopes: state.apiKeyContext.scopes,
            lastUsedAt: null,
          }
        : null,
    touchLastUsed: () => {},
  }));
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () => (state.databaseAvailable ? buildPrismaDouble(state) : null),
  }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (event: Row) => {
      state.auditEvents.push(event);
    },
    INFRA_AUDIT: {},
    COPILOT_AUDIT: {},
  }));
  vi.doMock("@/lib/logger", () => ({
    logger: {
      debug: (msg: string, meta?: Row) => state.logCalls.push({ level: "debug", msg, meta }),
      info: (msg: string, meta?: Row) => state.logCalls.push({ level: "info", msg, meta }),
      warn: (msg: string, meta?: Row) => state.logCalls.push({ level: "warn", msg, meta }),
      error: (msg: string, meta?: Row) => state.logCalls.push({ level: "error", msg, meta }),
      fatal: (msg: string, meta?: Row) => state.logCalls.push({ level: "fatal", msg, meta }),
    },
  }));
  vi.doMock("@/lib/logger/security-events", () => ({
    logAuthFailure: () => {},
    logAuthzDenial: () => {},
    logInfraFailure: () => {},
  }));
  vi.doMock("@/lib/auth/rate-limiter", () => ({
    checkRateLimit: async () => state.rateLimitAllowed,
    retryAfter: () => 42,
    limitWindowSeconds: () => 60,
    remainingAttempts: async () => 1,
    isAuthLimiterDegraded: () => false,
  }));
  vi.doMock("@/lib/billing-governance/runtime/require-entitlement", () => ({
    enforceEntitlement: async (args: Row) => {
      state.entitlementCalls.push(args);
      if (state.entitlementAllowed) return { ok: true, decision: { allowed: true } };
      return {
        ok: false,
        decision: { allowed: false, reason: "FEATURE_NOT_ENTITLED" },
        response: NextResponse.json({ error: "Not entitled", code: "FEATURE_NOT_ENTITLED" }, { status: 402 }),
      };
    },
  }));
  vi.doMock("@/lib/copilot/voice/provider", () => ({
    issueTranscriptionSession: async (request: Row) => {
      state.providerCalls.push({ kind: "transcription", payload: request });
      const failure = providerFailure(state);
      if (failure) return { ok: false, failure };
      return { ok: true, value: { clientSecret: "ephemeral-test-secret", expiresAt: 1_800_000_000 } };
    },
    synthesizeSpeech: async (request: Row) => {
      state.providerCalls.push({ kind: "speech", payload: request });
      const failure = providerFailure(state);
      if (failure) return { ok: false, failure };
      return {
        ok: true,
        value: {
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.close();
            },
          }),
          contentType: "audio/mpeg",
        },
      };
    },
    buildTranscriptionSessionBody: () => ({}),
  }));
  vi.doMock("@/lib/copilot/copilot", () => ({
    generateResponse: async () => copilotResponseFixture(),
  }));
}

export function uninstallMocks(): void {
  for (const mod of MOCKED_MODULES) vi.doUnmock(mod);
}

/**
 * A deterministic Copilot response, shaped exactly like the real engine's.
 *
 * Used so the suites can predict `renderSpeechText` byte for byte and therefore
 * assert on a grant's hash without reimplementing the renderer.
 */
export function copilotResponseFixture() {
  return {
    intent: "health_question",
    confidence: "HIGH",
    summary: "Pump P-101 is running within its normal vibration envelope.",
    observations: [
      {
        title: "Vibration trend",
        description: "RMS velocity has stayed below 4.5 mm/s for the last 24 hours.",
        evidence: [{ type: "kpi", recordId: "kpi-1", description: "vibration rms" }],
      },
    ],
    insights: [],
    recommendations: [
      {
        id: "inspection_p101",
        title: "Schedule the quarterly bearing inspection.",
        description: "Bearing inspection is due in eleven days.",
        priority: "MEDIUM",
        evidence: [],
      },
    ],
    supportingAssets: [],
    supportingKPIs: [],
    insufficientData: false,
  };
}

/**
 * Fail the test if ANY code under test reaches the network.
 *
 * Returns the restore function. The provider module is mocked, so a call here
 * means a new, unreviewed outbound path appeared.
 */
export function installNetworkTripwire(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    expect.unreachable(`Phase 103 test made a real network call to ${String(input)}`);
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/* ── Environment control ──────────────────────────────────────────────────── */

const VOICE_ENV_KEYS = [
  "HERMES_EXTERNAL_AI_ENABLED",
  "OPENAI_API_KEY",
  "HERMES_VOICE_SIGNING_SECRET",
  "NODE_ENV",
  "APP_ENV",
] as const;

export type VoiceEnv = Partial<Record<(typeof VOICE_ENV_KEYS)[number], string | undefined>>;

/**
 * A writable view of `process.env`.
 *
 * `@types/node` declares `NODE_ENV` readonly, which is right for application
 * code — nothing should reassign it at runtime. A test that exercises
 * environment-dependent governance has to, and doing it through one clearly
 * named alias keeps that intent visible instead of scattering casts.
 */
const mutableEnv = process.env as Record<string, string | undefined>;

/** Snapshot the voice-related environment so a suite can restore it exactly. */
export function snapshotEnv(): VoiceEnv {
  const snapshot: VoiceEnv = {};
  for (const key of VOICE_ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}

export function restoreEnv(snapshot: VoiceEnv): void {
  for (const key of VOICE_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
}

/**
 * The fully-configured, fully-approved happy path.
 *
 * `NODE_ENV=production` + `APP_ENV=staging` resolves the governance environment
 * to `staging`, which the registry entries permit. Under vitest's own
 * `NODE_ENV=test` the environment check denies — correctly, and that denial is
 * itself one of the cases the fail-closed matrix asserts.
 */
export function enableVoiceEnv(): void {
  mutableEnv.HERMES_EXTERNAL_AI_ENABLED = "1";
  mutableEnv.OPENAI_API_KEY = "sk-test-not-a-real-key";
  mutableEnv.HERMES_VOICE_SIGNING_SECRET = TEST_SIGNING_SECRET;
  mutableEnv.NODE_ENV = "production";
  mutableEnv.APP_ENV = "staging";
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

export function seedMember(
  state: HarnessState,
  input: { userId: string; organizationId: string; role: string; status?: string },
): void {
  state.tables.organizationMember.push({
    id: `member-${state.tables.organizationMember.length + 1}`,
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    status: input.status ?? "ACTIVE",
    createdAt: new Date(2026, 0, 1 + state.tables.organizationMember.length),
  });
}

/** An approved, enabled, unexpired tenant policy covering one leg. */
export function seedProviderPolicy(
  state: HarnessState,
  input: {
    organizationId?: string;
    providerRegistryId: string;
    workflows?: string[];
    dataClasses?: string[];
    enabled?: boolean;
    expiresAt?: Date | null;
  },
): void {
  state.tables.aiProviderPolicy.push({
    organizationId: input.organizationId ?? ORG_ID,
    providerRegistryId: input.providerRegistryId,
    enabled: input.enabled ?? true,
    allowedDataClasses: input.dataClasses ?? ["tenant_operational"],
    allowedWorkflows: input.workflows ?? ["copilot_voice_transcription", "copilot_voice_speech"],
    approvedBy: "owner",
    approvedAt: new Date(2026, 0, 1),
    policyVersion: "phase103.1",
    expiresAt: input.expiresAt ?? null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
  });
}

/** Member + both approved policies: the shortest path to a working request. */
export function seedHappyPath(state: HarnessState): void {
  seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
  seedProviderPolicy(state, { providerRegistryId: TRANSCRIPTION_REGISTRY_ID });
  seedProviderPolicy(state, { providerRegistryId: SPEECH_REGISTRY_ID });
}

/* ── Request builders ─────────────────────────────────────────────────────── */

/** DERIVED from the same BASE_URL `isAllowedOrigin` reads, so the harness cannot
 *  drift away from the policy it exercises. */
export const ALLOWED_ORIGIN = new URL(BASE_URL).origin;
export const FOREIGN_ORIGIN = "https://attacker.example";
/** Suffix spoof of the canonical host — the classic `endsWith` bypass. */
export const LOOKALIKE_ORIGIN = `${ALLOWED_ORIGIN}.attacker.example`;

export type VoiceRoute = "session" | "query" | "speech";

export interface VoiceRequestOptions {
  /** `null` sends NO Origin header, which is what a cross-site post looks like. */
  origin?: string | null;
  contentType?: string | null;
  /** Send an API key instead of a session cookie. */
  apiKey?: string;
  /** Omit the session cookie entirely. */
  anonymous?: boolean;
}

export function voiceRequest(
  route: VoiceRoute,
  body: unknown,
  options: VoiceRequestOptions = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (!options.anonymous && !options.apiKey) headers.cookie = `${ACCESS_TOKEN_COOKIE}=fake-token`;
  if (options.apiKey) headers["x-api-key"] = options.apiKey;
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  if (contentType !== null) headers["content-type"] = contentType;
  const origin = options.origin === undefined ? ALLOWED_ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;

  return new NextRequest(`http://localhost/api/copilot/voice/${route}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
