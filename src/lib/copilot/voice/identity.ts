/**
 * PHASE 103 — the irreversible identifier sent to the external provider.
 *
 * The Realtime API accepts an `OpenAI-Safety-Identifier` so abuse can be traced
 * to one end user without the provider learning who that user is. Sending the
 * platform's own user id would export a stable, joinable primary key to a third
 * party for the rest of its life; sending nothing would make every tenant look
 * like one caller.
 *
 * So the identifier is HMAC-SHA256(secret, "hermes.voice.identity.v1" ‖ org ‖
 * user), truncated to 32 hex characters. Properties that matter:
 *
 *   - IRREVERSIBLE: recovering the user id needs the secret, which never leaves
 *     the server. It is a keyed MAC, not a bare hash, so an attacker who knows
 *     the (small, guessable) input space still cannot enumerate it offline.
 *   - STABLE per (organisation, user): the provider can rate-limit and attribute
 *     abuse across sessions.
 *   - TENANT-SEPARATED: the organisation is part of the input, so the same
 *     person in two organisations is two identifiers.
 *   - ROTATABLE: rotating HERMES_VOICE_SIGNING_SECRET re-anonymises everyone.
 *
 * The label is what keeps this key independent of the speech-grant key derived
 * from the same secret in `grant.ts`.
 */

import { createHmac } from "node:crypto";

import { voiceSigningSecret } from "./config";

/** Domain-separation label. Changing it invalidates every previous identifier. */
const IDENTITY_LABEL = "hermes.voice.identity.v1";

/**
 * Truncation length in hex characters (128 bits).
 *
 * The identifier only has to be unique and unlinkable, not collision-proof under
 * adversarial search, and a shorter value is less useful as a tracking token if
 * the provider's own logs are ever exposed.
 */
const IDENTITY_HEX_LENGTH = 32;

/**
 * Derive the external identifier, or null when the signing secret is absent.
 *
 * Null is a DENIAL: the provider module refuses to call out without one, so an
 * unconfigured host can never fall back to sending a raw user id.
 */
export function externalUserIdentifier(organizationId: string, userId: string): string | null {
  const secret = voiceSigningSecret();
  if (!secret) return null;
  if (!organizationId || !userId) return null;

  // LENGTH-PREFIXED, not delimiter-separated.
  //
  // A plain separator only works while no identifier can contain it — an
  // assumption about database values that nothing enforces, and one that would
  // silently collapse two distinct (org, user) pairs onto one pseudonym if it
  // ever stopped holding. Prefixing each component with its own length makes
  // the encoding injective for ANY input, so distinct pairs always hash
  // distinctly — and it keeps the material printable, which a control
  // character in source never is.
  const material = `${IDENTITY_LABEL}|${organizationId.length}|${organizationId}|${userId.length}|${userId}`;
  return createHmac("sha256", secret).update(material, "utf8").digest("hex").slice(0, IDENTITY_HEX_LENGTH);
}
