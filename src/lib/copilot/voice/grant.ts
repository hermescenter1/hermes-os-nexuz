/**
 * PHASE 103 — the signed speech grant.
 *
 * THE PROBLEM IT SOLVES
 * The speech route turns text into audio through a paid external provider. If it
 * simply read whatever text arrived, any authenticated operator could use it as
 * a general-purpose text-to-speech service, and — worse — the Hermes voice would
 * read out sentences the deterministic engine never produced. A plant operator
 * hearing a fabricated instruction in the product's own voice is exactly the
 * failure this phase exists to prevent.
 *
 * THE MECHANISM
 * `/api/copilot/voice/query` computes the answer text deterministically and
 * signs a grant that BINDS:
 *
 *   version ‖ organisationId ‖ userId ‖ locale ‖ sha256(text) ‖ expiry ‖ nonce
 *
 * `/api/copilot/voice/speech` re-derives the same string from the SERVER's view
 * of the actor plus the submitted text, and refuses unless the MAC matches. So:
 *
 *   - changing one character of the text  → hash differs → refused
 *   - replaying another user's grant      → userId differs → refused
 *   - replaying it in another tenant      → organisationId differs → refused
 *   - asking for a different locale       → locale differs → refused
 *   - using it a minute later             → expired → refused
 *   - forging one                         → needs the server secret → refused
 *
 * The grant carries NO transcript and NO answer text — only a hash of the text —
 * so a grant intercepted in transit reveals nothing about what was said.
 *
 * The comparison is timing-safe, and the whole verification is total: it returns
 * a typed reason and never throws, so no caller can turn a malformed grant into
 * a 500 that distinguishes it from a wrong one.
 */

import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { voiceSigningSecret } from "./config";
import { VOICE_GRANT_TTL_SECONDS, type VoiceLocale } from "./contract";

/** Domain-separation label; keeps this key independent of the identity key. */
const GRANT_LABEL = "hermes.voice.grant.v1";

/** Wire version. A future change to the bound fields increments this, and old
 *  grants stop verifying instead of being reinterpreted under new rules. */
const GRANT_VERSION = "v1";

/** Field separator. `.` cannot occur in any component, so the encoding is
 *  unambiguous and no two distinct grants can serialise identically. */
const SEP = ".";

export interface VoiceGrantClaims {
  readonly organizationId: string;
  readonly userId: string;
  readonly locale: VoiceLocale;
  /** SHA-256, hex, of the exact text the grant authorises. */
  readonly textHash: string;
  /** Unix seconds. */
  readonly expiresAt: number;
  /** Single-use marker, carried so a consumption store has something to key on. */
  readonly nonce: string;
}

export type VoiceGrantVerdict =
  | { ok: true; claims: VoiceGrantClaims }
  | { ok: false; reason: VoiceGrantDenyReason };

/**
 * Why a grant was refused.
 *
 * Diagnostic only — the route answers every one of them with the SAME
 * `VOICE_GRANT_INVALID` code and status, so a caller cannot use the response to
 * learn whether it guessed the actor, the text or the expiry.
 */
export type VoiceGrantDenyReason =
  | "NOT_CONFIGURED"
  | "MALFORMED"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "ACTOR_MISMATCH"
  | "LOCALE_MISMATCH"
  | "TEXT_MISMATCH";

/** SHA-256 of the exact UTF-8 text, hex. Exported so callers hash identically. */
export function hashSpeechText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The canonical, unambiguous string the MAC is computed over. */
function canonicalPayload(claims: VoiceGrantClaims): string {
  return [
    GRANT_VERSION,
    claims.organizationId,
    claims.userId,
    claims.locale,
    claims.textHash,
    String(claims.expiresAt),
    claims.nonce,
  ].join(SEP);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${GRANT_LABEL}${SEP}${payload}`, "utf8").digest("hex");
}

/** Timing-safe hex comparison that is also length-safe. */
function macsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export interface IssueGrantInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly locale: VoiceLocale;
  /** The exact text the speech leg will be permitted to read. */
  readonly text: string;
  /** Injected for deterministic tests. */
  readonly now?: Date;
}

export interface IssuedGrant {
  readonly token: string;
  /** ISO-8601, for the UI's countdown. Also derivable from the token. */
  readonly expiresAt: string;
}

/**
 * Mint a grant for one exact text, actor and locale.
 *
 * Returns null when the signing secret is absent — an unconfigured host issues
 * no grants at all, so the speech route has nothing to accept.
 */
export function issueSpeechGrant(input: IssueGrantInput): IssuedGrant | null {
  const secret = voiceSigningSecret();
  if (!secret) return null;

  const nowMs = (input.now ?? new Date()).getTime();
  const expiresAt = Math.floor(nowMs / 1000) + VOICE_GRANT_TTL_SECONDS;
  const claims: VoiceGrantClaims = {
    organizationId: input.organizationId,
    userId: input.userId,
    locale: input.locale,
    textHash: hashSpeechText(input.text),
    expiresAt,
    nonce: randomBytes(12).toString("hex"),
  };
  const payload = canonicalPayload(claims);
  return {
    token: `${payload}${SEP}${sign(payload, secret)}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export interface VerifyGrantInput {
  readonly token: unknown;
  /** The organisation the SERVER resolved for this request. */
  readonly organizationId: string;
  /** The user the SERVER resolved for this request. */
  readonly userId: string;
  readonly locale: VoiceLocale;
  /** The text the caller is asking to have spoken. */
  readonly text: string;
  readonly now?: Date;
}

/**
 * Verify a grant against the server's own view of actor, locale and text.
 *
 * Order matters: shape, then signature, then expiry, then the bindings. Checking
 * the signature before the bindings means an attacker cannot use binding
 * failures to probe the claims of a token they cannot forge.
 */
export function verifySpeechGrant(input: VerifyGrantInput): VoiceGrantVerdict {
  const secret = voiceSigningSecret();
  if (!secret) return { ok: false, reason: "NOT_CONFIGURED" };

  if (typeof input.token !== "string" || input.token.length === 0 || input.token.length > 1024) {
    return { ok: false, reason: "MALFORMED" };
  }

  const parts = input.token.split(SEP);
  if (parts.length !== 8) return { ok: false, reason: "MALFORMED" };
  const [version, organizationId, userId, locale, textHash, expiresAtRaw, nonce, mac] = parts;
  if (version !== GRANT_VERSION) return { ok: false, reason: "MALFORMED" };

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return { ok: false, reason: "MALFORMED" };
  if (!/^[0-9a-f]{64}$/.test(textHash)) return { ok: false, reason: "MALFORMED" };
  if (!/^[0-9a-f]{24}$/.test(nonce)) return { ok: false, reason: "MALFORMED" };

  const payload = parts.slice(0, 7).join(SEP);
  if (!macsEqual(mac, sign(payload, secret))) return { ok: false, reason: "BAD_SIGNATURE" };

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (expiresAt <= nowSeconds) return { ok: false, reason: "EXPIRED" };

  // The signature proved the server minted these claims. These checks prove the
  // claims describe THIS request.
  if (organizationId !== input.organizationId || userId !== input.userId) {
    return { ok: false, reason: "ACTOR_MISMATCH" };
  }
  if (locale !== input.locale) return { ok: false, reason: "LOCALE_MISMATCH" };
  if (!macsEqual(textHash, hashSpeechText(input.text))) return { ok: false, reason: "TEXT_MISMATCH" };

  return {
    ok: true,
    claims: {
      organizationId,
      userId,
      locale: locale as VoiceLocale,
      textHash,
      expiresAt,
      nonce,
    },
  };
}
