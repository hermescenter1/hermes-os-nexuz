/**
 * PHASE 103 — invariants that live in the SHAPE of the code, read off disk.
 *
 * Some of this phase's promises cannot be observed by calling a function:
 * "there is no recorder", "nothing starts automatically", "the browser resources
 * are released", "no tool is ever offered to the model", "there is no control
 * path". Those are statements about what the source does NOT contain, or about
 * where a call sits relative to another. They are asserted here against the real
 * files, comment-stripped so a promise written only in prose can never satisfy
 * one.
 *
 * Every assertion is paired with a positive control wherever a bare `not
 * .toContain` could pass simply because the file was renamed or emptied: the
 * suite first proves it is reading the RIGHT file with real content.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { stripComments } from "../../../../../scripts/security/phase99/route-inventory.mjs";

const REPO = process.cwd();

const PANEL = "src/components/copilot/LiveVoicePanel.tsx";
const PROVIDER = "src/lib/copilot/voice/provider.ts";
const GUARD = "src/lib/copilot/voice/guard.ts";
const GOVERNANCE = "src/lib/copilot/voice/governance.ts";
const SESSION_ROUTE = "src/app/api/copilot/voice/session/route.ts";
const QUERY_ROUTE = "src/app/api/copilot/voice/query/route.ts";
const SPEECH_ROUTE = "src/app/api/copilot/voice/speech/route.ts";
const ALL_VOICE_FILES = [PANEL, PROVIDER, GUARD, GOVERNANCE, SESSION_ROUTE, QUERY_ROUTE, SPEECH_ROUTE];

const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
/** Source with comments removed: a claim in prose proves nothing. */
const code = (rel: string): string => stripComments(read(rel));

/* ═════════════════ 1 — every file this suite audits exists ══════════════════ */

describe("the audited surface is real", () => {
  it("every Phase 103 file exists and carries content", () => {
    for (const rel of ALL_VOICE_FILES) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
      expect(read(rel).length, rel).toBeGreaterThan(500);
    }
  });
});

/* ═══════════════ 2 — no recording, no autostart, real cleanup ═══════════════ */

describe("the browser panel records nothing and starts nothing by itself", () => {
  const panel = code(PANEL);

  it("is reading the real panel (positive control)", () => {
    expect(panel).toContain("getUserMedia");
    expect(panel).toContain("RTCPeerConnection");
  });

  it("contains NO MediaRecorder and no audio-file assembly", () => {
    for (const forbidden of [
      "MediaRecorder",
      "ondataavailable",
      "audio/webm",
      "new Blob(",
      "FileReader",
      "showSaveFilePicker",
      "download",
    ]) {
      expect(panel, forbidden).not.toContain(forbidden);
    }
  });

  it("never uploads captured audio to the Hermes server", () => {
    // The three voice endpoints take JSON only. A FormData or a raw stream body
    // in this component would mean audio was being posted somewhere.
    expect(panel).not.toContain("FormData");
    expect(panel).not.toMatch(/body:\s*stream/);
    expect(panel).not.toMatch(/body:\s*blob/i);
  });

  it("has NO autoplay and NO effect that opens the microphone", () => {
    expect(panel).not.toContain("autoPlay");
    expect(panel).not.toContain("autoplay");
    // The only useEffect in the component is the unmount teardown. An effect
    // that called startMicrophone or playAnswer would open a microphone or emit
    // sound without the operator asking.
    const effects = panel.match(/useEffect\(/g) ?? [];
    expect(effects).toHaveLength(1);
    const effectBody = panel.slice(panel.indexOf("useEffect("), panel.indexOf("const fail"));
    expect(effectBody).not.toContain("startMicrophone");
    expect(effectBody).not.toContain("playAnswer");
    expect(effectBody).toContain("releaseCapture()");
    expect(effectBody).toContain("releaseAudio()");
  });

  it("stops every track and closes the peer connection in ONE teardown", () => {
    expect(panel).toContain("for (const track of stream.getTracks()) track.stop()");
    expect(panel).toContain("peer.close()");
    expect(panel).toContain("streamRef.current = null");
    expect(panel).toContain("peerRef.current = null");
  });

  it("calls that teardown from every exit path", () => {
    // Start (re-entry), stop, failure and unmount. Four is the floor, not a
    // pinned total: an added exit path must also call it, never fewer.
    const calls = panel.match(/releaseCapture\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(panel).toContain("const stopMicrophone");
    // The failure handler releases BEFORE it renders the error, so an error
    // state can never coexist with a live microphone.
    const failBody = panel.slice(panel.indexOf("const fail ="), panel.indexOf("const startMicrophone"));
    expect(failBody).toContain("releaseCapture()");
  });

  it("revokes the playback object URL rather than leaking it", () => {
    expect(panel).toContain("URL.createObjectURL");
    expect(panel).toContain("URL.revokeObjectURL");
  });

  it("uses only translation lookups for visible text — no hard-coded copy", () => {
    // Any JSX text node that is not an expression would be an untranslated
    // string. The panel renders text exclusively through `t(...)` or through
    // server-provided answer content.
    const jsxText = panel.match(/>\s*[A-Za-z][A-Za-z ,.'’-]{3,}\s*</g) ?? [];
    expect(jsxText).toEqual([]);
  });

  it("keeps the transcript editable and behind an explicit confirmation", () => {
    // A readOnly or disabled transcript would break the operator's ability to
    // correct a mis-transcription before it reaches the engine.
    const textarea = panel.slice(panel.indexOf("<textarea"), panel.indexOf("</textarea>") + 12);
    expect(textarea).not.toContain("readOnly");
    expect(textarea).not.toContain("disabled");
    expect(panel).toContain("onChange={(event) => {");
    // The engine is reached ONLY from the Analyze handler.
    const queryCalls = panel.match(/"\/api\/copilot\/voice\/query"/g) ?? [];
    expect(queryCalls).toHaveLength(1);
    const analyzeBody = panel.slice(panel.indexOf("const analyze ="), panel.indexOf("const playAnswer ="));
    expect(analyzeBody).toContain("/api/copilot/voice/query");
  });

  it("is keyboard reachable: every control is a real button with a type", () => {
    const buttons = panel.match(/<button/g) ?? [];
    const typed = panel.match(/type="button"/g) ?? [];
    expect(buttons.length).toBe(5);
    expect(typed.length).toBe(buttons.length);
    // No div-as-button anywhere.
    expect(panel).not.toMatch(/<div[^>]*onClick=/);
    // The transcript has a real label and the status is announced.
    expect(panel).toContain('htmlFor="live-voice-transcript"');
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('role="alert"');
  });
});

/* ═══════════════ 3 — transcription-only, no tools, no control ═══════════════ */

describe("the provider is asked for transcription only, and never for a decision", () => {
  const provider = code(PROVIDER);

  it("is reading the real provider (positive control)", () => {
    expect(provider).toContain("realtime/client_secrets");
    expect(provider).toContain("audio/speech");
  });

  it("declares the session transcription-only", () => {
    expect(provider).toContain('type: "transcription"');
    expect(provider).toContain("turn_detection: null");
  });

  it("offers NO tools and asks for NO assistant response", () => {
    for (const forbidden of [
      "tools:",
      "tool_choice",
      "function_call",
      "create_response: true",
      "instructions:",
      "system_prompt",
    ]) {
      expect(provider, forbidden).not.toContain(forbidden);
    }
  });

  it("sends the caller's text verbatim, with nothing that licenses invention", () => {
    expect(provider).toContain("input: request.text");
    // No prompt, no context, no persona wrapped around the text.
    expect(provider).not.toContain("prompt");
    expect(provider).not.toContain("You are");
  });

  it("pins the host in a module constant no request can steer", () => {
    expect(provider).toContain('const OPENAI_API_BASE = "https://api.openai.com/v1"');
    // Every fetch destination is built from that constant.
    const fetchCalls = provider.match(/fetch\(/g) ?? [];
    expect(fetchCalls).toHaveLength(1);
    expect(provider).toContain('redirect: "error"');
  });

  it("sends the irreversible identifier, never a Hermes user id", () => {
    expect(provider).toContain("OpenAI-Safety-Identifier");
    expect(provider).toContain("options.safetyIdentifier");
    expect(provider).not.toContain("userId");
  });

  it("never persists audio: no filesystem, no database, no cache", () => {
    for (const forbidden of [
      'from "node:fs"',
      'from "fs"',
      "@/lib/db/prisma",
      "getPrisma",
      "writeFile",
      "createWriteStream",
      "getRedis",
    ]) {
      expect(provider, forbidden).not.toContain(forbidden);
    }
  });
});

describe("no voice surface can reach an industrial control path", () => {
  it("no voice file imports a gateway, PLC, SCADA, OT or command module", () => {
    for (const rel of ALL_VOICE_FILES) {
      const source = code(rel);
      for (const forbidden of [
        "@/lib/ot-edge",
        "@/lib/industrial/gateway",
        "@/lib/ot-operations",
        "sendCommand",
        "writeTag",
        "writeRegister",
        "issueCommand",
        "actuate",
      ]) {
        expect(source, `${rel} → ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("no voice route performs a database mutation", () => {
    // The Phase 99 inventory records `mutates` per handler; these three must be
    // read-only, and the voice design needs no new table at all.
    for (const rel of [SESSION_ROUTE, QUERY_ROUTE, SPEECH_ROUTE]) {
      const source = code(rel);
      for (const mutation of [".create(", ".update(", ".upsert(", ".delete(", "$executeRaw", "$transaction("]) {
        expect(source, `${rel} → ${mutation}`).not.toContain(mutation);
      }
    }
  });

  it("the query route reaches the DETERMINISTIC engine and no other", () => {
    const source = code(QUERY_ROUTE);
    expect(source).toContain('import { generateResponse } from "@/lib/copilot/copilot"');
    expect(source).toContain("await generateResponse(");
    // No external model participates in producing the answer.
    expect(source).not.toContain("synthesizeSpeech");
    expect(source).not.toContain("issueTranscriptionSession");
  });
});

/* ═══════════════ 4 — the guard chain is ordered as documented ═══════════════ */

describe("the shared guard runs its seven checks in the documented order", () => {
  const guard = code(GUARD);

  const orderOf = (needle: string): number => {
    const index = guard.indexOf(needle);
    expect(index, `guard source does not contain ${needle}`).toBeGreaterThan(-1);
    return index;
  };

  it("authenticate → jwt-only → origin → membership → rbac → entitlement → limit", () => {
    const positions = [
      orderOf("await requirePlatformAuth(req)"),
      orderOf('ctx.authMethod !== "jwt"'),
      orderOf("requireTrustedOrigin(req, ctx.authMethod)"),
      orderOf("await requireOrgActor(req, ctx.orgId)"),
      orderOf("requirePermission(member.ctx.role, VOICE_PERMISSION)"),
      orderOf("await enforceEntitlement({"),
      orderOf("await checkRateLimit(options.bucket, limitKey)"),
    ];
    // Strictly increasing: a reordering that put the commercial gate before RBAC
    // or the limiter before authentication turns this RED.
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i], `step ${i + 1} must follow step ${i}`).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("uses the existing permission and entitlement, not new ones", () => {
    expect(guard).toContain('const VOICE_PERMISSION = "view_copilot"');
    expect(guard).toContain('const VOICE_ENTITLEMENT = "copilot"');
  });

  it("keys the limiter by the authenticated identity, never by a client IP", () => {
    expect(guard).toContain("const limitKey = `${organizationId}:${userId}`");
    expect(guard).not.toContain("resolveClientIp");
    expect(guard).not.toContain("x-forwarded-for");
  });

  it("all three routes delegate to it, and none re-implements the chain", () => {
    for (const rel of [SESSION_ROUTE, QUERY_ROUTE, SPEECH_ROUTE]) {
      const source = code(rel);
      expect(source, rel).toContain('from "@/lib/copilot/voice/guard"');
      expect(source, rel).toContain("await requireVoiceCopilotActor({ req, bucket:");
      expect(source, rel).toContain("if (!gate.ok) return gate.response;");
      // A route that also called the primitives directly could drift out of
      // order without anyone noticing.
      expect(source, rel).not.toContain("requirePlatformAuth(");
      expect(source, rel).not.toContain("requireOrgActor(");
    }
  });

  it("each route names its OWN declared bucket, as a literal the audit can read", () => {
    const buckets = [
      [SESSION_ROUTE, "copilot-voice-session"],
      [QUERY_ROUTE, "copilot-voice-query"],
      [SPEECH_ROUTE, "copilot-voice-speech"],
    ] as const;
    for (const [rel, bucket] of buckets) {
      expect(code(rel), rel).toContain(`bucket: "${bucket}"`);
    }
  });
});

/* ═════════════════ 5 — governance composes Phase 95, fail-closed ════════════ */

describe("governance is composed from the Phase 95 primitives, not reinvented", () => {
  const governance = code(GOVERNANCE);

  it("resolves through the canonical registry and the tenant policy evaluator", () => {
    expect(governance).toContain('from "@/lib/ai-governance/model-registry"');
    expect(governance).toContain('from "@/lib/ai-governance/provider-policy"');
    expect(governance).toContain("await resolveProviderAccess(");
    expect(governance).toContain("prismaProviderPolicyStore()");
  });

  it("refuses to proceed if the registry ever permitted tool calling", () => {
    expect(governance).toContain("if (entry.toolCallingAllowed)");
    expect(governance).toContain('reason: "TOOL_CALLING_NOT_PERMITTED"');
  });

  it("returns the API key ONLY inside an allowed decision", () => {
    expect(governance).toContain("{ allowed: true; entry: ModelRegistryEntry; apiKey: string }");
    expect(governance).toContain("{ allowed: false; reason: VoiceGovernanceDenyReason; registryId: string }");
  });
});

/* ═════════════════════ 6 — the registry entries themselves ══════════════════ */

describe("both external voice models are governed deny-by-default", () => {
  it("each is registered, external, tool-free and falls back to the deterministic Copilot", async () => {
    const { getRegistryEntry, VOICE_SPEECH_REGISTRY_ID, VOICE_TRANSCRIPTION_REGISTRY_ID } = await import(
      "@/lib/ai-governance/model-registry"
    );
    for (const registryId of [VOICE_TRANSCRIPTION_REGISTRY_ID, VOICE_SPEECH_REGISTRY_ID]) {
      const entry = getRegistryEntry(registryId);
      expect(entry, registryId).not.toBeNull();
      expect(entry?.external, registryId).toBe(true);
      expect(entry?.defaultEnabled, registryId).toBe(false);
      expect(entry?.tenantPolicyRequired, registryId).toBe(true);
      expect(entry?.toolCallingAllowed, registryId).toBe(false);
      expect(entry?.deterministicFallback, registryId).toBe("hermes:copilot-deterministic");
      // Never permitted in test/development, so an unconfigured developer
      // machine cannot reach a paid provider by accident.
      expect(entry?.allowedEnvironments, registryId).toEqual(["staging", "production"]);
    }
  });

  it("the committed model inventory matches the registry exactly", async () => {
    const { MODEL_REGISTRY } = await import("@/lib/ai-governance/model-registry");
    const snapshot = JSON.parse(
      readFileSync(join(REPO, "tests/fixtures/ai-governance/model-inventory.json"), "utf8"),
    ) as { registryIds: string[] };
    expect([...snapshot.registryIds].sort()).toEqual(MODEL_REGISTRY.map((e) => e.registryId).sort());
  });
});
