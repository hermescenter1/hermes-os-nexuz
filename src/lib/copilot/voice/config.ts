/**
 * PHASE 103 — Live Voice Intelligence runtime configuration, read fail-closed.
 *
 * Every getter here answers "is this configured?", never "here is the value" for
 * anything that must not travel. Secrets are read live from `process.env` at the
 * moment of use and are never cached in a module-level binding, never logged,
 * never returned to a caller that could echo them, and never included in an
 * audit event.
 *
 * ABSENCE IS A DENIAL, NOT A DEFAULT
 * A missing switch, a missing API key or a missing signing secret each disables
 * the feature. There is deliberately no development fallback that invents a key
 * or a secret: a fallback would make the disabled state untestable and would let
 * a misconfigured production host silently behave like a configured one.
 */

import type { DeploymentEnvironment } from "@/lib/ai-governance/types";

/**
 * The global external-AI kill switch.
 *
 * OFF unless the variable is explicitly one of the affirmative literals below.
 * `HERMES_EXTERNAL_AI_ENABLED=0` — the documented default — is off, and so is
 * every unset, empty, misspelled or unexpected value. That asymmetry is the
 * point: the only way to turn external AI on is to mean it.
 */
export function isExternalAiEnabled(): boolean {
  const raw = process.env.HERMES_EXTERNAL_AI_ENABLED;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/**
 * The provider API key, or null when unconfigured.
 *
 * Reused from the platform's existing `OPENAI_API_KEY` rather than introducing a
 * second credential: one key, one rotation, one entry in the recovery contract.
 * Returned only to the provider module, which puts it in an Authorization header
 * and nowhere else.
 */
export function providerApiKey(): string | null {
  const raw = process.env.OPENAI_API_KEY;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

/**
 * The Phase 103 signing secret, or null when unconfigured.
 *
 * ONE secret serves two purposes — signing the speech grant and deriving the
 * irreversible external user identifier — with domain separation applied by the
 * consumers (`grant.ts`, `identity.ts`), each of which prefixes a distinct,
 * constant label before hashing. Two independent HMAC keys derived from one
 * secret with distinct labels are as separate as two configured secrets, and one
 * fewer thing an operator can get wrong.
 *
 * A short secret is treated as ABSENT. A 16-character minimum stops a
 * placeholder such as "changeme" from producing signatures that look valid.
 */
export const VOICE_SIGNING_SECRET_MIN_LENGTH = 16;

export function voiceSigningSecret(): string | null {
  const raw = process.env.HERMES_VOICE_SIGNING_SECRET;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length >= VOICE_SIGNING_SECRET_MIN_LENGTH ? value : null;
}

/**
 * The deployment environment, in the governance vocabulary.
 *
 * The registry entries permit `staging` and `production` only, so a `test` or
 * `development` host denies at the environment check without any additional
 * flag. Unknown values resolve to `development`, which is the denying side.
 */
export function deploymentEnvironment(): DeploymentEnvironment {
  const raw = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (raw === "production") {
    // A staging deployment runs a production build; it declares itself with
    // APP_ENV so governance can tell the two apart without guessing.
    return (process.env.APP_ENV ?? "").trim().toLowerCase() === "staging" ? "staging" : "production";
  }
  if (raw === "test") return "test";
  return "development";
}

/**
 * Is every piece of configuration this feature needs present?
 *
 * Used by the routes to answer with ONE undifferentiated code
 * (`EXTERNAL_AI_UNAVAILABLE`) instead of telling a caller which of the switch,
 * the key or the secret is missing — a probe must not be able to map the
 * server's configuration.
 */
export function voiceConfigurationComplete(): boolean {
  return isExternalAiEnabled() && providerApiKey() !== null && voiceSigningSecret() !== null;
}
