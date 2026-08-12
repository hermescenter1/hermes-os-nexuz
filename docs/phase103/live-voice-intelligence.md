# Phase 103 — Hermes Live Voice Intelligence

**Status of this document:** the design and security record for the voice
interface added to the Industrial Copilot in Phase 103. It describes what was
built, what it deliberately cannot do, and what an owner must decide before it
can be switched on.

```
REAL_OPENAI_CONTACTED=NO
AUDIO_STORED=NO
TRANSCRIPT_STORED=NO
LIVE_CONTROL_PERFORMED=NO
PRODUCTION_CONTACTED=NO
OPENBAO_CONTACTED=NO
PHASE103_DEPLOYED=NO
```

---

## 1. What this phase is

A **voice interface** to the existing deterministic Industrial Copilot. Nothing
more.

It is **not** an autonomous voice agent, **not** a second decision engine, and
**not** a control path. The external models may hear and may speak; they may
never analyse, decide, call a tool, or reach a PLC, SCADA or gateway surface.

The permitted flow, end to end:

```
microphone
   │  (browser → provider, WebRTC, transcription-only)
   ▼
live transcript
   │  shown in an EDITABLE textarea
   ▼
operator reviews, corrects, and presses "Analyze"      ← the only door
   │
   ▼
POST /api/copilot/voice/query
   │  → generateResponse()  — the EXISTING deterministic engine, unchanged
   ▼
documented, read-only answer   +   a server-SIGNED speech grant
   │
   ▼  (optional, operator presses "Play")
POST /api/copilot/voice/speech
   │  → verifies the grant binds THIS text, user, tenant, locale and time
   ▼
audio stream, played once, stored nowhere
```

Voice changed **how the question arrived**. It did not change **who answers it**.

---

## 2. Architecture

### 2.1 Modules

| Path | Responsibility |
|---|---|
| `src/lib/copilot/voice/contract.ts` | Shared vocabulary: locales, limits, TTLs, error codes, the closed audit-metadata shape. Constants only. |
| `src/lib/copilot/voice/config.ts` | Fail-closed environment reads. Absence is a denial, never a default. |
| `src/lib/copilot/voice/identity.ts` | HMAC-derived, irreversible external user identifier. |
| `src/lib/copilot/voice/grant.ts` | Mint and verify the signed speech grant. |
| `src/lib/copilot/voice/grant-consumption.ts` | Single-use nonce claim (Redis, in-process fallback). |
| `src/lib/copilot/voice/governance.ts` | Composes the Phase 95 registry + tenant provider policy into one decision. |
| `src/lib/copilot/voice/provider.ts` | The **only** module that contacts the provider. |
| `src/lib/copilot/voice/answer.ts` | Deterministic projection of the Copilot answer + the exact spoken text. |
| `src/lib/copilot/voice/guard.ts` | The one ordered security chain all three routes share. |
| `src/components/copilot/LiveVoicePanel.tsx` | The operator surface. |

### 2.2 Endpoints

| Endpoint | Purpose | Bucket |
|---|---|---|
| `POST /api/copilot/voice/session` | Mint a short-lived, transcription-only credential for the browser. | `copilot-voice-session` (10/min) |
| `POST /api/copilot/voice/query` | Run the confirmed transcript through the deterministic engine; return the answer + a speech grant. | `copilot-voice-query` (12/min) |
| `POST /api/copilot/voice/speech` | Read back one exact, grant-proven string. | `copilot-voice-speech` (8/min) |

All three are `POST`-only, classified `TENANT_MEMBER` by the Phase 99 route
inventory, and perform **no database mutation**. Phase 103 adds **no Prisma
model and no migration** — the design needs neither.

### 2.3 External provider surface

Verified against the current official documentation:

| Call | Endpoint | Made by |
|---|---|---|
| Mint ephemeral credential | `POST https://api.openai.com/v1/realtime/client_secrets` | Hermes server (account key) |
| WebRTC SDP handshake | `POST https://api.openai.com/v1/realtime/calls` | The **browser** (ephemeral secret) |
| Text to speech | `POST https://api.openai.com/v1/audio/speech` | Hermes server (account key) |

**A note on `create_response=false`.** The brief specifies the session must be
created with `create_response=false`. In the current Realtime API that contract
is carried by the session TYPE: `session.type: "transcription"` creates a
transcription session, which emits transcription events and has **no assistant
turn to create** — the same guarantee, expressed by the shape of the session
rather than by a flag. `buildTranscriptionSessionBody` sets it explicitly, sends
no `tools`, no `tool_choice`, no `instructions` and no output modality, and
`phase103-voice-source-invariants.test.ts` asserts each of those absences so a
future edit cannot quietly reintroduce a conversational session.

The account API key is used **only** on the server. The browser holds only the
ephemeral secret, which expires in 60 seconds.

---

## 3. Data flow and retention

| Artefact | Where it goes | Retained? |
|---|---|---|
| Microphone audio | Browser → provider, directly over WebRTC. **Never touches the Hermes server.** | **NO** |
| Transcript | Browser state → `POST /voice/query` → the engine → dropped. | **NO** |
| Answer text | Returned to the browser; hashed into the grant. | **NO** |
| Synthesised audio | Streamed provider → Hermes → browser, unbuffered. | **NO** |
| Ephemeral client secret | Returned to the browser. | **NO** |
| Audit events | `provider`, `model`, `registryId`, `locale`, **character count**, result code. | Yes — and nothing else. |

`buildVoiceAuditMetadata` rebuilds the metadata object field by field from a
typed interface, so a caller cannot widen it by spreading an object that happens
to contain a transcript — even with a cast. The suites assert that a distinctive
transcript phrase appears in **no** audit event and **no** log line.

There is no `MediaRecorder` anywhere in the panel, no `Blob` assembly, no
download and no upload of audio. Asserted statically.

---

## 4. Trust boundaries

```
┌─ BROWSER (untrusted) ──────────────────────────────────────────────┐
│  microphone · transcript textarea · playback                       │
│  holds: session cookie, ephemeral provider secret (60 s)           │
└───────────────┬────────────────────────────────┬───────────────────┘
                │ same-origin, cookie             │ WebRTC, ephemeral secret
                ▼                                 ▼
┌─ HERMES SERVER (trusted) ──────────┐   ┌─ PROVIDER (external) ─────┐
│  guard chain (7 ordered checks)    │   │  transcription only       │
│  deterministic Copilot engine      │   │  text-to-speech only      │
│  HMAC signing secret               │   │  sees: audio, answer text,│
│  provider API key                  │   │        an HMAC pseudonym  │
│  audit sink (no content)           │   │  never sees: user id,     │
└────────────────────────────────────┘   │  org id, tenant data      │
                                         └───────────────────────────┘
```

**What the provider learns:** the audio the operator speaks, the answer text if
playback is used, and a 32-hex-character pseudonym.

**What the provider never learns:** the Hermes user id, the organisation id, any
other tenant data, or any link between two pseudonyms.

The pseudonym is `HMAC-SHA256(secret, "hermes.voice.identity.v1 ‖ org ‖ user")`
truncated to 128 bits. It is a keyed MAC, not a bare hash, so the small and
guessable input space cannot be enumerated offline without the server secret.
Rotating `HERMES_VOICE_SIGNING_SECRET` re-anonymises everyone.

---

## 5. The security chain

One shared guard, `requireVoiceCopilotActor`, runs on every voice route in this
exact order. The order is asserted positionally against the source.

| # | Check | On failure |
|---|---|---|
| 1 | `requirePlatformAuth` — identity + server-derived `orgId` | 401 `AUTHENTICATION_REQUIRED` |
| 2 | **JWT only** — a platform API key is refused | 401 `SESSION_AUTH_REQUIRED` |
| 3 | `requireTrustedOrigin` — exact-origin match | 403 `FORBIDDEN` |
| 4 | `requireOrgActor` — ACTIVE membership | 401/403 `ORGANIZATION_SCOPE_REQUIRED` |
| 5 | `requirePermission(role, "view_copilot")` | 403 `INSUFFICIENT_PERMISSION` |
| 6 | `enforceEntitlement("copilot", units: 0)` | the billing surface's own response |
| 7 | `checkRateLimit(bucket, "${org}:${user}")` | 429 + `Retry-After` |

**Why API keys are refused.** `requirePlatformAuth` accepts both a browser
session and a platform API key. Voice must not accept the latter: the
transcription leg exists to hand a live credential to a browser microphone, and
a headless integration has none. Accepting a key would turn the endpoint into a
way to mint external credentials and spend a tenant's provider budget outside any
human review. Refusing keys also means the API-key exemption inside
`requireTrustedOrigin` can never be reached from these routes, so step 3 always
applies.

**Why the entitlement asks for 0 units.** `copilot` is a boolean feature key.
`0` requests an availability decision rather than a consumption one, so this
phase does not silently change anyone's usage accounting.

**Rate-limit keying.** By `${organizationId}:${userId}`, never by IP. These
routes are never anonymous, and an identity cannot be rotated per request the way
a network address can.

---

## 6. The signed speech grant

`/voice/query` mints:

```
v1 . organizationId . userId . locale . sha256(text) . expiry . nonce . HMAC
```

`/voice/speech` re-derives the MAC from the **server's** view of the actor plus
the submitted text. Consequences:

| Attempt | Result |
|---|---|
| Change one character of the text | refused — hash differs |
| Replace the text entirely | refused |
| Use another user's grant | refused — actor differs |
| Use a grant from another tenant | refused |
| Ask for a different locale | refused |
| Use it 61 seconds later | refused — expired |
| Rewrite the claims, keep the signature | refused — MAC fails |
| Forge one | refused — needs the server secret |
| Replay a grant that already played | refused — nonce consumed |

Every refusal returns the **same** status and a **byte-identical** body
(`403 VOICE_GRANT_INVALID`), so a caller cannot learn which check failed. The
specific reason is audited server-side.

The grant carries a **hash** of the text, never the text, so an intercepted grant
reveals nothing about what was said.

**Single-use — stated precisely.** The nonce is claimed atomically in Redis
(`SET NX PX`). When Redis is unavailable the claim falls back to an in-process
map, so in a multi-instance deployment **without Redis** a grant could be
accepted once per instance inside its 60-second window. This is defence in depth,
not the boundary: the boundary is the grant's binding and expiry, and a replay
can only re-request the same sentence for the same user, inside a rate-limit
budget that already bounds it.

---

## 7. Fail-closed matrix

Every row denies. The **only** configuration that permits an external call is the
last one.

| Condition | Decision | Client sees |
|---|---|---|
| `HERMES_EXTERNAL_AI_ENABLED` unset / `0` / anything but an explicit affirmative | `FEATURE_FLAG_OFF` | 503 `EXTERNAL_AI_UNAVAILABLE` |
| `OPENAI_API_KEY` absent or empty | `API_KEY_MISSING` | 503 `EXTERNAL_AI_UNAVAILABLE` |
| `HERMES_VOICE_SIGNING_SECRET` absent or shorter than 16 chars | `SIGNING_SECRET_MISSING` | 503 `EXTERNAL_AI_UNAVAILABLE` |
| Registry entry missing | `UNKNOWN_PROVIDER` | 503 |
| Registry entry ever permitted tool calling | `TOOL_CALLING_NOT_PERMITTED` | 503 |
| Environment not `staging`/`production` | `ENVIRONMENT_NOT_ALLOWED` | 503 |
| No tenant provider policy | `NO_POLICY` | 503 |
| Policy disabled | `POLICY_DISABLED` | 503 |
| Policy expired | `POLICY_EXPIRED` | 503 |
| Policy does not list the workflow | `UNAPPROVED_DATA_CLASS` | 503 |
| Policy does not list the data class | `UNAPPROVED_DATA_CLASS` | 503 |
| Policy belongs to another organisation | `CROSS_TENANT` | 503 |
| Database unavailable (no policy readable) | `NO_POLICY` | 503 |
| Provider times out / refuses / is down | `TIMEOUT` etc. | 503 `PROVIDER_UNAVAILABLE` |
| **All of the above satisfied** | **ALLOWED** | 200 |

**The deterministic fallback.** Every denial above affects **voice only**. The
Copilot answer is produced and displayed regardless; the operator reads it on
screen. Both registry entries declare `deterministicFallback:
"hermes:copilot-deterministic"`.

The speech leg requires its **own** approved workflow: approving transcription
does not approve reading answers aloud.

---

## 8. Governance registry

Two entries added to `src/lib/ai-governance/model-registry.ts`:

| registryId | capability | external | defaultEnabled | tools | environments |
|---|---|---|---|---|---|
| `openai:gpt-live-transcribe` | transcription | yes | **false** | **false** | staging, production |
| `openai:gpt-4o-mini-tts` | text-to-speech | yes | **false** | **false** | staging, production |

Both carry `EXTERNAL_REVIEW_REQUIRED` for retention, training-use and region —
those are vendor legal facts, and this phase does not invent them. Model
identifiers appear **only** in the registry; `voice/*` resolves the raw `modelId`
through `getRegistryEntry`, which keeps the MODEL_INVENTORY gate meaningful.

---

## 9. Privacy disclosure

The panel renders a three-part disclosure **above** the controls, in Persian,
English and German, so the operator reads it before the microphone can open:

1. speech-to-text and text-to-speech are processed by an **external AI provider**;
2. Hermes stores **no audio and no transcript** — only the text length and the outcome;
3. the external models **never analyse, decide or act** — every answer comes from
   the deterministic engine, and playback reads it back word for word.

Nothing starts automatically: `getUserMedia` is reachable only from the Start
control and playback only from the Play control. Asserted statically — the panel
has exactly one `useEffect`, and it is the unmount teardown.

---

## 10. Unsupported capabilities

Explicitly **not** provided, by design:

- autonomous voice agents or wake words;
- any voice path to a PLC, SCADA, HMI, OT gateway or command surface;
- tool calling, function calling, or model-authored analysis;
- audio recording, download, upload or retention;
- speaking any text the deterministic engine did not produce;
- voice access via a platform API key;
- per-request choice of voice, model, provider or prompt;
- transcription in a locale outside `fa` / `en` / `de`;
- conversational (assistant-turn) realtime sessions.

---

## 11. Owner activation checklist

Voice ships **OFF**. Each step is an explicit decision.

1. **Legal review** — resolve the three `EXTERNAL_REVIEW_REQUIRED` facts
   (retention, training use, processing region) with the provider, and record the
   outcome in `docs/ai-governance/model-provider-inventory.md`.
2. **DPA / processor record** — add the provider as a processor for voice audio
   in the RoPA, and confirm the lawful basis for operator speech.
3. **Generate the signing secret** — `openssl rand -base64 48` → set
   `HERMES_VOICE_SIGNING_SECRET` in the secret store. Never commit it.
4. **Confirm `OPENAI_API_KEY`** is present in the secret store and scoped to the
   intended account.
5. **Create the per-organisation provider policies** — one row per
   `AiProviderPolicy` per leg, listing data class `tenant_operational` and the
   workflows `copilot_voice_transcription` and/or `copilot_voice_speech`, with an
   approver and an expiry. **A tenant without a policy stays off even after
   step 6.**
6. **Set `HERMES_EXTERNAL_AI_ENABLED=1`** and redeploy. This *also* adds
   `https://api.openai.com` to the `connect-src` CSP directive; with the switch
   off, the production CSP is byte-for-byte unchanged from Phase 102.
7. **Verify on staging first** — `APP_ENV=staging`. The registry forbids
   `test` and `development`, so a developer machine cannot reach the provider.
8. **Confirm the disclosure renders** on `/fa`, `/en` and `/de`.

---

## 12. Rollback

| Scope | Action | Effect |
|---|---|---|
| **Instant, no deploy** | Set `HERMES_EXTERNAL_AI_ENABLED=0`, restart | Voice denies everywhere. The Copilot is untouched. CSP returns to its pre-103 value. |
| **Per tenant** | Set `enabled = false` on that org's `AiProviderPolicy` rows | That tenant's voice denies; others unaffected. |
| **Invalidate all grants** | Rotate `HERMES_VOICE_SIGNING_SECRET` | In-flight grants (≤60 s) stop verifying; provider-side pseudonyms change. |
| **Full revert** | Revert the Phase 103 commit | No migration to undo, no data to restore, no volume to reconcile. |

No rollback step involves the database: this phase writes nothing.

---

## 13. External provider status — the honest record

| Fact | Value |
|---|---|
| Real OpenAI API contacted during development | **NO** |
| Real OpenAI API contacted during testing | **NO** — the provider module is mocked, and a `fetch` tripwire fails any test that reaches the network |
| Provider legal/retention/region facts | **EXTERNAL_REVIEW_REQUIRED** — unresolved, not guessed |
| Live WebRTC handshake exercised | **NO** — requires a real credential and a real microphone |
| Live transcription accuracy measured | **NO** — cannot be measured without a live call |
| Live text-to-speech quality assessed | **NO** — same |
| Production contacted | **NO** |
| OpenBao contacted | **NO** |
| Deployed | **NO** |

What **is** proven: the security chain, the governance matrix, the grant
cryptography, the absence of storage, the absence of tool calling, the absence of
a control path, the transcription-only session shape, and the browser cleanup.
What is **not** proven, and cannot be until an owner enables the feature against
a real account: that the provider accepts these exact request bodies and returns
the response shapes this code parses.

---

## 14. Verification

| Suite | What it locks |
|---|---|
| `src/app/api/copilot/voice/__tests__/phase103-voice-guard-chain.test.ts` | The seven checks, on all three routes, against the real guard. |
| `src/app/api/copilot/voice/__tests__/phase103-voice-security-contract.test.ts` | The fail-closed matrix, the grant, storage and response hygiene. |
| `src/lib/copilot/voice/__tests__/phase103-voice-primitives.test.ts` | HMAC binding, irreversible identity, config, deterministic rendering. |
| `src/lib/copilot/voice/__tests__/phase103-voice-source-invariants.test.ts` | No recorder, no autostart, real cleanup, no tools, no control path. |
| `scripts/__tests__/phase103-voice-guard-recognition.test.ts` | The Phase 99 classifier really sees the routes as tenant-scoped. |
| `src/i18n/__tests__/phase103-live-voice-i18n.test.ts` | Key set derived from the component; three-way parity; real translations. |
| `src/lib/copilot/voice/__tests__/phase103-voice-transcript.test.ts` | The reducer: commit built and sent, `completed` replaces its deltas, `item_id` correlation, exact type matching, the bounded wait — plus four mutation cases. |
| `src/lib/copilot/voice/__tests__/phase103-voice-panel-contract.test.ts` | Stop commits before it releases; the panel owns no transcript logic; one switch, one reader; no Start control while the switch is off. |
| `src/lib/copilot/voice/__tests__/phase103-voice-channel-open.test.ts` | The open handshake: event plus `readyState`, close/error/timeout/cancel, listener and timer cleanup — and the race replayed against a fake channel with and without the wait. |

---

## 15. Review fixes applied after the first submission

Three independent review findings, all in the browser half of the feature. The
security chain, the grant, the governance matrix and the storage posture are
untouched by all three.

### 15.1 Stop now commits the input audio buffer

The transcription session is created with `turn_detection: null`, so the
provider performs no voice-activity detection and never decides on its own that
a turn has ended. The original Stop handler closed the peer connection, which
meant the audio the operator had just dictated was never transcribed at all.

Stop is now two steps:

1. **The microphone tracks stop immediately and unconditionally.** This is the
   privacy-relevant half — the operating-system recording indicator goes out —
   and it must not wait for a network round trip.
2. **`{"type":"input_audio_buffer.commit"}` is sent on the same WebRTC data
   channel**, and only the transport is kept alive until every open item has
   emitted `conversation.item.input_audio_transcription.completed`, or until a
   bounded 5-second timeout expires — whichever comes first.

The bound is deliberate: an unbounded wait would let a silent provider hold a
peer connection open indefinitely. Any other teardown path (error, restart,
unmount) cancels the wait rather than orphaning it, and the panel shows a
distinct `finalizing` state while the window is open, so Start stays unavailable.

### 15.2 The transcript is reduced by `item_id`, not concatenated

The old handler appended any string it found on the channel — `delta` or
`transcript` — to whatever was already in the box, and recognised events by
substring. Deltas `"Hello, "` + `"world"` followed by
`completed.transcript = "Hello, world"` therefore rendered
`"Hello, worldHello, world"`: a corrupted question, in the very field the
operator is about to confirm and send to the deterministic engine.

Reduction now lives in `src/lib/copilot/voice/transcript.ts`, as a pure function
the tests drive directly:

- a `delta` grows the **provisional** text of **its own item**;
- a `completed` **replaces** that item's provisional text — it is never appended;
- items are keyed by `item_id` and rendered in **first-seen** order, so two items
  completing out of order still read in the order they were spoken;
- event types are compared with `===`, never with `includes()`, and an event with
  no usable `item_id` is ignored rather than attributed to a guessed owner.

### 15.3 With the switch off there is no Start control

`HERMES_EXTERNAL_AI_ENABLED` is a server variable, so a client component cannot
read it. The panel previously rendered a fully enabled Start button regardless,
opened the operator's microphone, and only then learned from the server that the
feature was off.

The switch now reaches the UI through one server boundary:

```
process.env.HERMES_EXTERNAL_AI_ENABLED
  └── isExternalAiEnabled()            src/lib/copilot/voice/config.ts
        ├── resolveVoiceGovernance()   server enforcement (FEATURE_FLAG_OFF)
        ├── VOICE_CONNECT_DOMAINS      the CSP entry, in middleware.ts
        └── copilot/layout.tsx         force-dynamic server component
              └── VoiceAvailabilityProvider → useVoiceAvailability() → the panel
```

There is **no** `NEXT_PUBLIC_` mirror of the switch: a second variable is a
second thing to set, and two variables that must agree eventually will not. The
middleware's own inline copy of the parsing rule was removed in favour of the
same function, so the CSP and the feature can no longer disagree about what
`"on"` means. The React context defaults to **false**, so a tree rendered
without the provider disables the panel rather than enabling it.

`force-dynamic` on the Copilot segment is what makes the read a **runtime** read:
without it the value would be captured during `next build` and a container
started later with the switch flipped would describe the wrong reality. The
route is confirmed absent from `.next/prerender-manifest.json`.

When the switch is off the panel renders its brand, title, lede and a translated
`disabledNotice` — and no button, no textarea, and no code path that can request
a session.

### 15.4 `listening` now means the data channel is open

A fourth finding, on the fix above. `await peer.setRemoteDescription(...)`
resolving means the SDP answer was accepted — it says nothing about ICE or
DTLS, which complete afterwards, and `RTCDataChannel.readyState` stays
`connecting` until they do. The panel announced `listening` immediately after
the SDP exchange, which enabled the Stop control against a channel that could
not carry the commit: `sendInputAudioBufferCommit` returned `false`, the handler
fell through to teardown, and the operator's utterance was discarded **with no
error on screen** — the worst shape of the bug 15.1 had just fixed.

`awaitDataChannelOpen()` is a bounded, cancellable waiter registered **before**
the SDP exchange, because the channel can reach `open` while that request is
still in flight. It resolves:

| Outcome | When | Panel response |
|---|---|---|
| `open` | the real `open` event fired **and** `readyState === "open"` at that moment | enter `listening` |
| `closed` | `close`, `closing` or `error`; or the channel was already dead | mic tracks stopped, peer and channel released, `PROVIDER_UNAVAILABLE` |
| `timeout` | nothing at all within 10 s | same |
| `cancelled` | the panel itself tore the attempt down (unmount, restart, another error) | yield — the tearer-down owns the state |

The event alone is a claim; the `readyState` re-read is the evidence, and the
panel checks it a second time before `setState("listening")`. Listeners are
removed and the timer cleared on every path, so no waiter outlives its
connection.

Stop is unchanged and still runs in the order 15.1 set: microphone tracks stop
first and unconditionally, then the commit, then the bounded wait for
`completed`, then teardown. The Stop control is gated on `listening`, which now
provably means channel-open.
