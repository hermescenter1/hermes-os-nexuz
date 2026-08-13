/**
 * PHASE 103 — the cryptographic and deterministic primitives, unit level.
 *
 * The route suites prove the primitives are WIRED correctly. This one proves
 * they are CORRECT: the MAC actually binds what it claims to, the external
 * identifier is actually irreversible and tenant-separated, the configuration
 * getters actually fail closed, and the speech renderer is actually
 * deterministic.
 *
 * Each case is written so that removing the property it asserts turns it RED —
 * a test that only checks "returns a string" would pass against a stub.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_KEYS = [
  "HERMES_EXTERNAL_AI_ENABLED",
  "OPENAI_API_KEY",
  "HERMES_VOICE_SIGNING_SECRET",
  "NODE_ENV",
  "APP_ENV",
] as const;

/** `NODE_ENV` is declared readonly by `@types/node`; the deployment-environment
 *  case below has to move it, so it does so through one named alias. */
const mutableEnv = process.env as Record<string, string | undefined>;

const SECRET = "phase103-unit-test-signing-secret";
let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];
  process.env.HERMES_VOICE_SIGNING_SECRET = SECRET;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
});

/* ══════════════════════════ configuration ═══════════════════════════════════ */

describe("configuration is read fail-closed", () => {
  it("the kill switch is OFF for every value except an explicit affirmative", async () => {
    const { isExternalAiEnabled } = await import("../config");
    for (const value of ["1", "true", "TRUE", "on", "yes", " 1 "]) {
      process.env.HERMES_EXTERNAL_AI_ENABLED = value;
      expect(isExternalAiEnabled(), value).toBe(true);
    }
    for (const value of ["0", "false", "off", "no", "", "maybe", "enabled", "2", "y"]) {
      process.env.HERMES_EXTERNAL_AI_ENABLED = value;
      expect(isExternalAiEnabled(), value).toBe(false);
    }
    delete process.env.HERMES_EXTERNAL_AI_ENABLED;
    expect(isExternalAiEnabled()).toBe(false);
  });

  it("a short signing secret is treated as ABSENT, so a placeholder cannot sign", async () => {
    const { voiceSigningSecret, VOICE_SIGNING_SECRET_MIN_LENGTH } = await import("../config");
    process.env.HERMES_VOICE_SIGNING_SECRET = "changeme";
    expect(voiceSigningSecret()).toBeNull();
    process.env.HERMES_VOICE_SIGNING_SECRET = "x".repeat(VOICE_SIGNING_SECRET_MIN_LENGTH);
    expect(voiceSigningSecret()).not.toBeNull();
  });

  it("an empty or whitespace API key is ABSENT, not an empty credential", async () => {
    const { providerApiKey } = await import("../config");
    for (const value of ["", "   "]) {
      process.env.OPENAI_API_KEY = value;
      expect(providerApiKey()).toBeNull();
    }
    delete process.env.OPENAI_API_KEY;
    expect(providerApiKey()).toBeNull();
    process.env.OPENAI_API_KEY = "sk-test";
    expect(providerApiKey()).toBe("sk-test");
  });

  it("the deployment environment resolves to the DENYING side when unclear", async () => {
    const { deploymentEnvironment } = await import("../config");
    mutableEnv.NODE_ENV = "production";
    delete process.env.APP_ENV;
    expect(deploymentEnvironment()).toBe("production");
    process.env.APP_ENV = "staging";
    expect(deploymentEnvironment()).toBe("staging");
    mutableEnv.NODE_ENV = "test";
    expect(deploymentEnvironment()).toBe("test");
    mutableEnv.NODE_ENV = "something-else";
    // Unknown → development, which the registry entries do NOT permit.
    expect(deploymentEnvironment()).toBe("development");
  });

  it("voiceConfigurationComplete needs ALL THREE pieces", async () => {
    const { voiceConfigurationComplete } = await import("../config");
    process.env.HERMES_EXTERNAL_AI_ENABLED = "1";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(voiceConfigurationComplete()).toBe(true);
    delete process.env.OPENAI_API_KEY;
    expect(voiceConfigurationComplete()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.HERMES_EXTERNAL_AI_ENABLED = "0";
    expect(voiceConfigurationComplete()).toBe(false);
  });
});

/* ═══════════════════════ external identity (HMAC) ═══════════════════════════ */

describe("the external user identifier is irreversible and tenant-separated", () => {
  it("is stable for the same (organisation, user) pair", async () => {
    const { externalUserIdentifier } = await import("../identity");
    const a = externalUserIdentifier("org-1", "user-1");
    const b = externalUserIdentifier("org-1", "user-1");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("differs across organisations for the SAME user", async () => {
    const { externalUserIdentifier } = await import("../identity");
    expect(externalUserIdentifier("org-1", "user-1")).not.toBe(externalUserIdentifier("org-2", "user-1"));
  });

  it("differs across users in the SAME organisation", async () => {
    const { externalUserIdentifier } = await import("../identity");
    expect(externalUserIdentifier("org-1", "user-1")).not.toBe(externalUserIdentifier("org-1", "user-2"));
  });

  it("contains neither the user id nor the organisation id", async () => {
    const { externalUserIdentifier } = await import("../identity");
    const value = externalUserIdentifier("org-secret-tenant", "user-secret-person") ?? "";
    expect(value).not.toContain("secret");
    expect(value).not.toContain("user");
    expect(value).not.toContain("org");
  });

  it("changes completely when the secret is rotated — re-anonymising everyone", async () => {
    const { externalUserIdentifier } = await import("../identity");
    const before = externalUserIdentifier("org-1", "user-1");
    process.env.HERMES_VOICE_SIGNING_SECRET = `${SECRET}-rotated`;
    expect(externalUserIdentifier("org-1", "user-1")).not.toBe(before);
  });

  it("is NULL without a secret, so no provider call can proceed unidentified", async () => {
    const { externalUserIdentifier } = await import("../identity");
    delete process.env.HERMES_VOICE_SIGNING_SECRET;
    expect(externalUserIdentifier("org-1", "user-1")).toBeNull();
  });

  it("is INJECTIVE — no two distinct (org, user) pairs collide", async () => {
    // The failure this guards against is subtle and silent: with a plain
    // separator, ("a|b", "c") and ("a", "b|c") hash identically, so two people
    // in two tenants become ONE pseudonym at the provider. Length-prefixing the
    // components makes that impossible for any input, including ids that
    // themselves contain the separator.
    const { externalUserIdentifier } = await import("../identity");
    const pairs: [string, string][] = [
      ["a", "bc"],
      ["ab", "c"],
      ["a|1", "c"],
      ["a", "1|c"],
      ["", "abc"],
      ["abc", ""],
    ];
    const seen = new Map<string, string>();
    for (const [org, user] of pairs) {
      const value = externalUserIdentifier(org, user);
      if (value === null) continue; // empty components are refused outright
      const key = `${org}→${user}`;
      const clash = seen.get(value);
      expect(clash, `${key} collides with ${clash}`).toBeUndefined();
      seen.set(value, key);
    }
    expect(seen.size).toBe(4);
  });

  it("the source carries no control characters", async () => {
    // A NUL used as a separator works and is invisible: it makes git treat the
    // file as binary, hides itself in every editor and diff, and cannot be
    // reviewed. This keeps the material printable.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/copilot/voice/identity.ts", "utf8");
    const control = [...source].filter((ch) => {
      const code = ch.charCodeAt(0);
      return code < 9 || (code > 13 && code < 32);
    });
    expect(control).toEqual([]);
  });

  it("is not merely a bare hash of the inputs", async () => {
    // A keyed MAC, not SHA-256(org‖user): the small, guessable input space means
    // an unkeyed digest would be trivially enumerable offline.
    const { createHash } = await import("node:crypto");
    const { externalUserIdentifier } = await import("../identity");
    const bare = createHash("sha256").update("org-1user-1", "utf8").digest("hex").slice(0, 32);
    expect(externalUserIdentifier("org-1", "user-1")).not.toBe(bare);
  });
});

/* ═══════════════════════════ the speech grant ═══════════════════════════════ */

describe("the speech grant binds exactly what it claims to bind", () => {
  const base = {
    organizationId: "org-1",
    userId: "user-1",
    locale: "en" as const,
    text: "Pump P-101 is stable.",
  };

  it("verifies its own freshly-minted token", async () => {
    const { issueSpeechGrant, verifySpeechGrant } = await import("../grant");
    const grant = issueSpeechGrant(base);
    expect(grant).not.toBeNull();
    const verdict = verifySpeechGrant({ ...base, token: grant?.token });
    expect(verdict.ok).toBe(true);
  });

  for (const [label, patch, reason] of [
    ["a changed organisation", { organizationId: "org-2" }, "ACTOR_MISMATCH"],
    ["a changed user", { userId: "user-2" }, "ACTOR_MISMATCH"],
    ["a changed locale", { locale: "de" as const }, "LOCALE_MISMATCH"],
    ["changed text", { text: "Pump P-101 is stable!" }, "TEXT_MISMATCH"],
  ] as const) {
    it(`REFUSES ${label} with ${reason}`, async () => {
      const { issueSpeechGrant, verifySpeechGrant } = await import("../grant");
      const grant = issueSpeechGrant(base);
      const verdict = verifySpeechGrant({ ...base, ...patch, token: grant?.token });
      expect(verdict.ok).toBe(false);
      expect(verdict.ok === false ? verdict.reason : null).toBe(reason);
    });
  }

  it("REFUSES a token whose MAC was altered", async () => {
    const { issueSpeechGrant, verifySpeechGrant } = await import("../grant");
    const token = issueSpeechGrant(base)?.token ?? "";
    const flipped = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
    const verdict = verifySpeechGrant({ ...base, token: flipped });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false ? verdict.reason : null).toBe("BAD_SIGNATURE");
  });

  it("REFUSES a token whose CLAIMS were rewritten without re-signing", async () => {
    // The attack the MAC exists to stop: take a valid token, swap the user field
    // for your target's, keep the signature.
    const { issueSpeechGrant, verifySpeechGrant } = await import("../grant");
    const token = issueSpeechGrant(base)?.token ?? "";
    const parts = token.split(".");
    parts[2] = "user-2";
    const verdict = verifySpeechGrant({ ...base, userId: "user-2", token: parts.join(".") });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false ? verdict.reason : null).toBe("BAD_SIGNATURE");
  });

  it("REFUSES a grant signed with a DIFFERENT secret", async () => {
    const { issueSpeechGrant, verifySpeechGrant } = await import("../grant");
    const token = issueSpeechGrant(base)?.token ?? "";
    process.env.HERMES_VOICE_SIGNING_SECRET = `${SECRET}-other`;
    const verdict = verifySpeechGrant({ ...base, token });
    expect(verdict.ok === false ? verdict.reason : null).toBe("BAD_SIGNATURE");
  });

  it("EXPIRES after its TTL", async () => {
    const { issueSpeechGrant, verifySpeechGrant } = await import("../grant");
    const { VOICE_GRANT_TTL_SECONDS } = await import("../contract");
    const minted = new Date("2026-08-12T10:00:00.000Z");
    const token = issueSpeechGrant({ ...base, now: minted })?.token ?? "";

    // One second before expiry: still valid.
    const justInside = new Date(minted.getTime() + (VOICE_GRANT_TTL_SECONDS - 1) * 1000);
    expect(verifySpeechGrant({ ...base, token, now: justInside }).ok).toBe(true);

    // One second after: refused.
    const justOutside = new Date(minted.getTime() + (VOICE_GRANT_TTL_SECONDS + 1) * 1000);
    const verdict = verifySpeechGrant({ ...base, token, now: justOutside });
    expect(verdict.ok === false ? verdict.reason : null).toBe("EXPIRED");
  });

  it("carries the text HASH, never the text", async () => {
    const { issueSpeechGrant, hashSpeechText } = await import("../grant");
    const token = issueSpeechGrant(base)?.token ?? "";
    expect(token).not.toContain("Pump");
    expect(token).not.toContain("stable");
    expect(token).toContain(hashSpeechText(base.text));
  });

  it("issues NOTHING without a signing secret", async () => {
    const { issueSpeechGrant, verifySpeechGrant } = await import("../grant");
    delete process.env.HERMES_VOICE_SIGNING_SECRET;
    expect(issueSpeechGrant(base)).toBeNull();
    expect(verifySpeechGrant({ ...base, token: "anything" }).ok).toBe(false);
  });

  it("is TOTAL: no malformed input throws", async () => {
    const { verifySpeechGrant } = await import("../grant");
    for (const token of [
      undefined,
      null,
      42,
      {},
      [],
      "",
      ".".repeat(7),
      "v9.a.b.en.0.1.2.3",
      "v1...........",
      "x".repeat(5_000),
    ]) {
      const verdict = verifySpeechGrant({ ...base, token });
      expect(verdict.ok).toBe(false);
    }
  });

  it("two grants for identical input differ — the nonce is real", async () => {
    const { issueSpeechGrant } = await import("../grant");
    const a = issueSpeechGrant(base)?.token;
    const b = issueSpeechGrant(base)?.token;
    expect(a).not.toBe(b);
  });
});

/* ═════════════════════════ single-use consumption ═══════════════════════════ */

describe("grant nonces are consumed once", () => {
  it("the first claim wins and the second is refused", async () => {
    const { consumeGrantNonce, resetGrantConsumptionForTests } = await import("../grant-consumption");
    resetGrantConsumptionForTests();
    const nonce = "aaaaaaaaaaaaaaaaaaaaaaaa";
    expect(await consumeGrantNonce(nonce)).toBe(true);
    expect(await consumeGrantNonce(nonce)).toBe(false);
  });

  it("different nonces do not interfere", async () => {
    const { consumeGrantNonce, resetGrantConsumptionForTests } = await import("../grant-consumption");
    resetGrantConsumptionForTests();
    expect(await consumeGrantNonce("bbbbbbbbbbbbbbbbbbbbbbbb")).toBe(true);
    expect(await consumeGrantNonce("cccccccccccccccccccccccc")).toBe(true);
  });

  it("a nonce is claimable again once its window has passed", async () => {
    const { consumeGrantNonce, resetGrantConsumptionForTests } = await import("../grant-consumption");
    const { VOICE_GRANT_TTL_SECONDS } = await import("../contract");
    resetGrantConsumptionForTests();
    const nonce = "dddddddddddddddddddddddd";
    const start = new Date("2026-08-12T10:00:00.000Z");
    expect(await consumeGrantNonce(nonce, start)).toBe(true);
    const later = new Date(start.getTime() + (VOICE_GRANT_TTL_SECONDS + 5) * 1000);
    expect(await consumeGrantNonce(nonce, later)).toBe(true);
  });
});

/* ══════════════════════ deterministic speech rendering ══════════════════════ */

describe("the spoken text is a deterministic projection of the engine's answer", () => {
  const response = {
    intent: "health_question",
    confidence: "HIGH",
    summary: "Pump P-101 is stable.",
    observations: [{ title: "Vibration", description: "Below 4.5 mm/s.", evidence: [] }],
    insights: [],
    recommendations: [
      { id: "r1", title: "Schedule the inspection.", description: "Due soon.", priority: "MEDIUM", evidence: [] },
    ],
    supportingAssets: [],
    supportingKPIs: [],
    insufficientData: false,
  };

  it("renders the same string every time", async () => {
    const { renderSpeechText } = await import("../answer");
    const first = renderSpeechText(response as never);
    expect(renderSpeechText(response as never)).toBe(first);
  });

  it("contains ONLY words the engine produced", async () => {
    const { renderSpeechText } = await import("../answer");
    const text = renderSpeechText(response as never);
    expect(text).toContain("Pump P-101 is stable.");
    expect(text).toContain("Vibration");
    expect(text).toContain("Schedule the inspection.");
    // Nothing was invented around them.
    expect(text).not.toMatch(/I think|probably|as an AI|recommend that you should/i);
  });

  it("a BLOCKED response reads back its refusal and nothing else", async () => {
    const { renderSpeechText } = await import("../answer");
    const blocked = {
      ...response,
      blockedReason: "Control actions are not available in Hermes Copilot.",
    };
    const text = renderSpeechText(blocked as never);
    expect(text).toBe("Control actions are not available in Hermes Copilot.");
    // Crucially, the observations and recommendations are NOT spoken alongside a
    // refusal — the operator hears the refusal, full stop.
    expect(text).not.toContain("Vibration");
    expect(text).not.toContain("Schedule");
  });

  it("clamps to the declared ceiling, so the hash covers exactly what is spoken", async () => {
    const { renderSpeechText } = await import("../answer");
    const { VOICE_SPEECH_MAX_CHARS } = await import("../contract");
    const long = { ...response, summary: "x".repeat(VOICE_SPEECH_MAX_CHARS + 500) };
    expect(renderSpeechText(long as never).length).toBe(VOICE_SPEECH_MAX_CHARS);
  });

  it("returns an EMPTY string when there is nothing to say", async () => {
    const { renderSpeechText } = await import("../answer");
    const silent = { ...response, summary: "   ", observations: [], recommendations: [] };
    // Empty means "mint no grant", which is how the route declines to offer
    // playback rather than offering to read out nothing.
    expect(renderSpeechText(silent as never)).toBe("");
  });

  it("the answer projection exposes no field the Copilot surfaces do not already", async () => {
    const { toVoiceAnswer } = await import("../answer");
    const dto = toVoiceAnswer(response as never);
    expect(Object.keys(dto).sort()).toEqual([
      "blocked",
      "confidence",
      "evidence",
      "insufficientData",
      "intent",
      "observations",
      "recommendations",
      "summary",
    ]);
  });
});
