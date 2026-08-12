/**
 * PHASE 103 — the governance matrix, the speech grant, and response hygiene.
 *
 * Everything here drives the REAL governance module, the REAL provider-policy
 * evaluator and the REAL HMAC grant. Only the edges are doubled, so each case
 * below is a statement about the shipped decision logic rather than about a
 * fixture.
 *
 * THE CASES
 *   §1 the fail-closed matrix: every missing switch, key, secret, policy,
 *      workflow, data class, environment and tenant denies, and the ONLY
 *      configuration that allows is the fully-approved one;
 *   §2 the grant: tampered text, wrong user, wrong tenant, wrong locale, expiry,
 *      forgery and replay are each refused, and each refusal is indistinguishable
 *      from the others;
 *   §3 storage and hygiene: no transcript, no answer, no audio and no client
 *      secret appear in any audit event, log line or response the caller should
 *      not see.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `NODE_ENV` is declared readonly by `@types/node`; the governance-environment
 *  cases below have to move it, so they do it through one named alias. */
const mutableEnv = process.env as Record<string, string | undefined>;

import {
  ORG_ID,
  OTHER_ORG_ID,
  OTHER_USER_ID,
  SPEECH_REGISTRY_ID,
  TRANSCRIPTION_REGISTRY_ID,
  USER_ID,
  copilotResponseFixture,
  enableVoiceEnv,
  freshState,
  installMocks,
  installNetworkTripwire,
  restoreEnv,
  seedHappyPath,
  seedMember,
  seedProviderPolicy,
  snapshotEnv,
  uninstallMocks,
  voiceRequest,
  type HarnessState,
  type VoiceEnv,
} from "./harness";

let state: HarnessState;
let envSnapshot: VoiceEnv;
let restoreFetch: () => void;

beforeEach(() => {
  vi.resetModules();
  state = freshState();
  envSnapshot = snapshotEnv();
  enableVoiceEnv();
  installMocks(state);
  restoreFetch = installNetworkTripwire();
});

afterEach(() => {
  restoreFetch();
  uninstallMocks();
  restoreEnv(envSnapshot);
  vi.resetModules();
});

async function sessionPost(body: unknown = { locale: "en" }) {
  const { POST } = await import("../session/route");
  return POST(voiceRequest("session", body));
}

async function queryPost(body: unknown = { transcript: "pump p-101 vibration", locale: "en" }) {
  const { POST } = await import("../query/route");
  return POST(voiceRequest("query", body));
}

async function speechPost(body: unknown) {
  const { POST } = await import("../speech/route");
  return POST(voiceRequest("speech", body));
}

/** Run a real query and return the speech envelope it minted. */
async function mintSpeech(locale = "en") {
  const response = await queryPost({ transcript: "pump p-101 vibration", locale });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    speech: { text: string; grant: string; locale: string } | null;
  };
  if (!body.speech) throw new Error("the query minted no speech grant");
  return body.speech;
}

/* ═════════════════ 1 — the fail-closed governance matrix ════════════════════ */

describe("§1 external AI is deny-by-default on the session route", () => {
  beforeEach(() => {
    seedHappyPath(state);
  });

  it("ALLOWS only when switch, key, secret, environment and policy all say yes", async () => {
    const response = await sessionPost();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.mode).toBe("transcription_only");
    expect(state.providerCalls).toHaveLength(1);
    expect(state.providerCalls[0].kind).toBe("transcription");
  });

  for (const [label, mutate, reason] of [
    [
      "the global switch is off",
      () => {
        process.env.HERMES_EXTERNAL_AI_ENABLED = "0";
      },
      "FEATURE_FLAG_OFF",
    ],
    [
      "the global switch is absent",
      () => {
        delete process.env.HERMES_EXTERNAL_AI_ENABLED;
      },
      "FEATURE_FLAG_OFF",
    ],
    [
      "the switch holds an unexpected value",
      () => {
        process.env.HERMES_EXTERNAL_AI_ENABLED = "maybe";
      },
      "FEATURE_FLAG_OFF",
    ],
    [
      "no provider API key is configured",
      () => {
        delete process.env.OPENAI_API_KEY;
      },
      "API_KEY_MISSING",
    ],
    [
      "no signing secret is configured",
      () => {
        delete process.env.HERMES_VOICE_SIGNING_SECRET;
      },
      "SIGNING_SECRET_MISSING",
    ],
    [
      "the signing secret is too short to be real",
      () => {
        process.env.HERMES_VOICE_SIGNING_SECRET = "changeme";
      },
      "SIGNING_SECRET_MISSING",
    ],
    [
      "the environment is not one the registry permits",
      () => {
        mutableEnv.NODE_ENV = "test";
        delete mutableEnv.APP_ENV;
      },
      "ENVIRONMENT_NOT_ALLOWED",
    ],
  ] as const) {
    it(`DENIES when ${label}`, async () => {
      mutate();
      const response = await sessionPost();
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "EXTERNAL_AI_UNAVAILABLE" });
      // Nothing left the building.
      expect(state.providerCalls).toEqual([]);
      // The reason IS audited — it is a server-side governance fact — but the
      // client was told only that the capability is unavailable.
      const denial = state.auditEvents.find((e) => e.action === "copilot.voice.session.denied");
      expect((denial?.metadata as Record<string, unknown>)?.result).toBe(reason);
    });
  }
});

describe("§1 the tenant policy is required, scoped and honoured", () => {
  it("DENIES when the organisation has no policy at all", async () => {
    seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
    const response = await sessionPost();
    expect(response.status).toBe(503);
    expect(state.providerCalls).toEqual([]);
  });

  it("DENIES when the policy exists but is disabled", async () => {
    seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
    seedProviderPolicy(state, { providerRegistryId: TRANSCRIPTION_REGISTRY_ID, enabled: false });
    expect((await sessionPost()).status).toBe(503);
    expect(state.providerCalls).toEqual([]);
  });

  it("DENIES when the policy has expired", async () => {
    seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
    seedProviderPolicy(state, {
      providerRegistryId: TRANSCRIPTION_REGISTRY_ID,
      expiresAt: new Date(2020, 0, 1),
    });
    expect((await sessionPost()).status).toBe(503);
  });

  it("DENIES when the policy does not list THIS workflow", async () => {
    // Approving a provider is not the same decision as approving "our
    // operators' speech leaves the building".
    seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
    seedProviderPolicy(state, {
      providerRegistryId: TRANSCRIPTION_REGISTRY_ID,
      workflows: ["some_other_workflow"],
    });
    expect((await sessionPost()).status).toBe(503);
    expect(state.providerCalls).toEqual([]);
  });

  it("DENIES when the policy does not permit the data class", async () => {
    seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
    seedProviderPolicy(state, {
      providerRegistryId: TRANSCRIPTION_REGISTRY_ID,
      dataClasses: ["public"],
    });
    expect((await sessionPost()).status).toBe(503);
  });

  it("DENIES when the only approved policy belongs to ANOTHER organisation", async () => {
    seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
    seedProviderPolicy(state, {
      organizationId: OTHER_ORG_ID,
      providerRegistryId: TRANSCRIPTION_REGISTRY_ID,
    });
    expect((await sessionPost()).status).toBe(503);
    expect(state.providerCalls).toEqual([]);
  });

  it("the speech leg needs its OWN policy — a transcription approval is not enough", async () => {
    seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "ENGINEER" });
    seedProviderPolicy(state, { providerRegistryId: TRANSCRIPTION_REGISTRY_ID });

    const speech = await mintSpeech();
    const response = await speechPost({ text: speech.text, grant: speech.grant, locale: "en" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "EXTERNAL_AI_UNAVAILABLE" });
    expect(state.providerCalls.filter((c) => c.kind === "speech")).toEqual([]);
  });

  it("DENIES when the database is unavailable — no policy means no approval", async () => {
    seedHappyPath(state);
    // A store that cannot answer resolves to null, which the evaluator treats as
    // NO_POLICY. Fail-closed, never fail-open.
    const { POST } = await import("../session/route");
    state.databaseAvailable = false;
    const response = await POST(voiceRequest("session", { locale: "en" }));
    expect([401, 503]).toContain(response.status);
    expect(state.providerCalls).toEqual([]);
  });
});

describe("§1 a provider failure never becomes a 500 or a leak", () => {
  for (const failure of ["timeout", "rejected", "unavailable"] as const) {
    it(`a ${failure} provider answers 503 PROVIDER_UNAVAILABLE`, async () => {
      seedHappyPath(state);
      state.providerFails = failure;
      const response = await sessionPost();
      expect(response.status).toBe(503);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code).toBe("PROVIDER_UNAVAILABLE");
      expect(Object.keys(body).sort()).toEqual(["code", "error"]);
    });
  }
});

/* ═══════════════════════ 2 — the speech grant ═══════════════════════════════ */

describe("§2 the speech grant binds text, actor, locale and time", () => {
  beforeEach(() => {
    seedHappyPath(state);
  });

  it("a well-formed grant plays the exact deterministic text", async () => {
    const speech = await mintSpeech();
    const response = await speechPost({ text: speech.text, grant: speech.grant, locale: "en" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const call = state.providerCalls.find((c) => c.kind === "speech");
    // What was sent to the provider is the text the grant covered — verbatim.
    expect(call?.payload.text).toBe(speech.text);
  });

  it("the spoken text really is the deterministic engine's own words", async () => {
    // Derived from the same fixture through the REAL renderer, so this cannot
    // pass by echoing whatever the route happened to produce.
    const { renderSpeechText } = await import("@/lib/copilot/voice/answer");
    const expected = renderSpeechText(copilotResponseFixture() as never);
    const speech = await mintSpeech();
    expect(speech.text).toBe(expected);
    expect(speech.text).toContain("Pump P-101 is running within its normal vibration envelope.");
  });

  for (const [label, mutate] of [
    [
      "the text was altered by ONE character",
      (s: { text: string; grant: string }) => ({ text: `${s.text}.`, grant: s.grant, locale: "en" }),
    ],
    [
      "the text was replaced entirely",
      (s: { text: string; grant: string }) => ({
        text: "Open valve V-12 immediately.",
        grant: s.grant,
        locale: "en",
      }),
    ],
    [
      "the grant's signature was tampered with",
      (s: { text: string; grant: string }) => ({
        text: s.text,
        grant: `${s.grant.slice(0, -1)}${s.grant.endsWith("a") ? "b" : "a"}`,
        locale: "en",
      }),
    ],
    [
      "the grant is structurally malformed",
      (s: { text: string }) => ({ text: s.text, grant: "not-a-grant", locale: "en" }),
    ],
    [
      "the locale does not match the grant",
      (s: { text: string; grant: string }) => ({ text: s.text, grant: s.grant, locale: "de" }),
    ],
  ] as const) {
    it(`REFUSES when ${label}`, async () => {
      const speech = await mintSpeech();
      const response = await speechPost(mutate(speech));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "VOICE_GRANT_INVALID" });
      // Refused BEFORE anything was spent externally.
      expect(state.providerCalls.filter((c) => c.kind === "speech")).toEqual([]);
    });
  }

  it("REFUSES a grant minted for a DIFFERENT user in the same organisation", async () => {
    const { issueSpeechGrant } = await import("@/lib/copilot/voice/grant");
    const text = "Pump P-101 is stable.";
    const foreign = issueSpeechGrant({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      locale: "en",
      text,
    });
    const response = await speechPost({ text, grant: foreign?.token, locale: "en" });
    expect(response.status).toBe(403);
    expect(state.providerCalls.filter((c) => c.kind === "speech")).toEqual([]);
  });

  it("REFUSES a grant minted for another TENANT", async () => {
    const { issueSpeechGrant } = await import("@/lib/copilot/voice/grant");
    const text = "Pump P-101 is stable.";
    const foreign = issueSpeechGrant({
      organizationId: OTHER_ORG_ID,
      userId: USER_ID,
      locale: "en",
      text,
    });
    const response = await speechPost({ text, grant: foreign?.token, locale: "en" });
    expect(response.status).toBe(403);
  });

  it("REFUSES an EXPIRED grant", async () => {
    const { issueSpeechGrant } = await import("@/lib/copilot/voice/grant");
    const text = "Pump P-101 is stable.";
    // Minted two minutes ago; the TTL is one minute.
    const stale = issueSpeechGrant({
      organizationId: ORG_ID,
      userId: USER_ID,
      locale: "en",
      text,
      now: new Date(Date.now() - 120_000),
    });
    const response = await speechPost({ text, grant: stale?.token, locale: "en" });
    expect(response.status).toBe(403);
    expect(state.providerCalls.filter((c) => c.kind === "speech")).toEqual([]);
  });

  it("REFUSES a REPLAY of a grant that already played", async () => {
    const speech = await mintSpeech();
    const first = await speechPost({ text: speech.text, grant: speech.grant, locale: "en" });
    expect(first.status).toBe(200);

    const replay = await speechPost({ text: speech.text, grant: speech.grant, locale: "en" });
    expect(replay.status).toBe(403);
    expect(await replay.json()).toMatchObject({ code: "VOICE_GRANT_INVALID" });
    // Exactly ONE synthesis was paid for.
    expect(state.providerCalls.filter((c) => c.kind === "speech")).toHaveLength(1);
  });

  it("every grant refusal is indistinguishable from every other", async () => {
    const speech = await mintSpeech();
    const bodies: string[] = [];
    const statuses: number[] = [];
    for (const attempt of [
      { text: `${speech.text}!`, grant: speech.grant, locale: "en" },
      { text: speech.text, grant: "not-a-grant", locale: "en" },
      { text: speech.text, grant: speech.grant, locale: "fa" },
    ]) {
      const response = await speechPost(attempt);
      statuses.push(response.status);
      bodies.push(await response.text());
    }
    // Same status, same byte-identical body: the response cannot be used to work
    // out WHICH check failed.
    expect(new Set(statuses).size).toBe(1);
    expect(new Set(bodies).size).toBe(1);
  });
});

/* ═══════════════════ 3 — storage and response hygiene ═══════════════════════ */

describe("§3 no audio, transcript, answer or secret is ever stored or leaked", () => {
  beforeEach(() => {
    seedHappyPath(state);
  });

  const SECRET_TRANSCRIPT = "the reactor coolant pump is cavitating at forty hertz";

  it("the transcript never appears in an audit event", async () => {
    await queryPost({ transcript: SECRET_TRANSCRIPT, locale: "en" });
    const serialised = JSON.stringify(state.auditEvents);
    expect(serialised).not.toContain(SECRET_TRANSCRIPT);
    expect(serialised).not.toContain("cavitating");
  });

  it("the transcript never appears in a log line", async () => {
    await queryPost({ transcript: SECRET_TRANSCRIPT, locale: "en" });
    expect(JSON.stringify(state.logCalls)).not.toContain("cavitating");
  });

  it("the audit records the LENGTH of the transcript, not its content", async () => {
    await queryPost({ transcript: SECRET_TRANSCRIPT, locale: "en" });
    const event = state.auditEvents.find((e) => e.action === "copilot.voice.query.answered");
    const metadata = event?.metadata as Record<string, unknown>;
    expect(metadata.characters).toBe(SECRET_TRANSCRIPT.length);
    expect(metadata.locale).toBe("en");
    // The engine identity is recorded as the DETERMINISTIC one: the answer did
    // not come from an external model, and the audit says so.
    expect(metadata.registryId).toBe("hermes:copilot-deterministic");
  });

  it("the answer text never appears in an audit event", async () => {
    const speech = await mintSpeech();
    await speechPost({ text: speech.text, grant: speech.grant, locale: "en" });
    const serialised = JSON.stringify(state.auditEvents);
    expect(serialised).not.toContain(speech.text);
    expect(serialised).not.toContain("vibration envelope");
  });

  it("the ephemeral client secret never appears in an audit event or a log line", async () => {
    const response = await sessionPost();
    const body = (await response.json()) as { clientSecret: string };
    expect(body.clientSecret).toBe("ephemeral-test-secret");
    // It is returned to the browser — that is the point — and stored nowhere.
    expect(JSON.stringify(state.auditEvents)).not.toContain(body.clientSecret);
    expect(JSON.stringify(state.logCalls)).not.toContain(body.clientSecret);
  });

  it("the provider API key never appears in an audit event, a log line or a response", async () => {
    const response = await sessionPost();
    const payload = await response.text();
    const key = process.env.OPENAI_API_KEY ?? "";
    expect(key.length).toBeGreaterThan(0);
    expect(payload).not.toContain(key);
    expect(JSON.stringify(state.auditEvents)).not.toContain(key);
    expect(JSON.stringify(state.logCalls)).not.toContain(key);
  });

  it("the signing secret never leaves the server in any form", async () => {
    const speech = await mintSpeech();
    const secret = process.env.HERMES_VOICE_SIGNING_SECRET ?? "";
    expect(secret.length).toBeGreaterThan(0);
    expect(speech.grant).not.toContain(secret);
    expect(JSON.stringify(state.auditEvents)).not.toContain(secret);
  });

  it("the query response states the deterministic engine as the authority", async () => {
    const response = await queryPost();
    const body = (await response.json()) as { engine: Record<string, unknown> };
    expect(body.engine).toMatchObject({
      authority: "deterministic",
      registryId: "hermes:copilot-deterministic",
      externalModelUsed: false,
    });
  });

  it("the query route never calls the external provider at all", async () => {
    await queryPost();
    // Producing the ANSWER involves no external model. Only playback does, and
    // only when the operator asks for it.
    expect(state.providerCalls).toEqual([]);
  });

  it("a body carrying organizationId or userId is REJECTED, not silently ignored", async () => {
    const { POST } = await import("../query/route");
    const response = await POST(
      voiceRequest("query", {
        transcript: "pump p-101",
        locale: "en",
        organizationId: OTHER_ORG_ID,
        userId: OTHER_USER_ID,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("an over-long transcript is refused rather than truncated", async () => {
    const response = await queryPost({ transcript: "x".repeat(2_001), locale: "en" });
    expect(response.status).toBe(400);
  });

  it("an unsupported locale is refused on every route", async () => {
    expect((await sessionPost({ locale: "fr" })).status).toBe(400);
    expect((await queryPost({ transcript: "x", locale: "fr" })).status).toBe(400);
  });

  it("a non-JSON content type is refused with 415", async () => {
    const { POST } = await import("../query/route");
    const response = await POST(
      voiceRequest("query", "transcript=x", { contentType: "application/x-www-form-urlencoded" }),
    );
    expect(response.status).toBe(415);
  });

  it("an oversized body is refused with 413 before it is parsed", async () => {
    const { POST } = await import("../query/route");
    const response = await POST(voiceRequest("query", { transcript: "x".repeat(40_000), locale: "en" }));
    expect(response.status).toBe(413);
  });
});
