/**
 * SSO readiness contract (Phase 91). Server-only.
 *
 * Hermes authenticates with passwords + JWT/session cookies today. This module is
 * the typed, fail-closed configuration surface an enterprise SSO (OIDC / SAML)
 * integration plugs into. It ships DISABLED and refuses to claim readiness unless
 * a COMPLETE, valid configuration is present in the environment.
 *
 * It deliberately does NOT implement a provider, contact an identity provider, or
 * stand up a demo login. Turning real SSO on is a separate, explicit piece of work
 * that supplies the provider adapter behind this contract — this file only decides
 * whether that work has been configured, and never fakes it.
 *
 * Documented environment variable NAMES (values live only in the deployment
 * environment; this module reads their presence, never logs their contents):
 *   SSO_PROTOCOL      "oidc" | "saml"
 *   SSO_ISSUER        IdP issuer / SAML entity id
 *   SSO_CLIENT_ID     OIDC client id
 *   SSO_METADATA_URL  OIDC discovery document / SAML metadata URL
 */

export type SsoProtocol = "oidc" | "saml";

export interface SsoConfiguration {
  /** True only when a complete, valid configuration is present. */
  enabled:  boolean;
  protocol: SsoProtocol | null;
  issuer:   string | null;
  /** Whether every field the chosen protocol requires is present. */
  complete: boolean;
}

/** Environment variable names that back the SSO configuration. */
export const SSO_ENV = {
  protocol:    "SSO_PROTOCOL",
  issuer:      "SSO_ISSUER",
  clientId:    "SSO_CLIENT_ID",
  metadataUrl: "SSO_METADATA_URL",
} as const;

const DISABLED: SsoConfiguration = { enabled: false, protocol: null, issuer: null, complete: false };

function readEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

/**
 * Resolve the SSO configuration from the environment.
 * Fail-closed: any missing or invalid field yields a disabled configuration.
 * Never throws, never logs secret values.
 */
export function resolveSsoConfiguration(): SsoConfiguration {
  const rawProtocol = readEnv(SSO_ENV.protocol);
  if (rawProtocol !== "oidc" && rawProtocol !== "saml") return DISABLED;

  const issuer      = readEnv(SSO_ENV.issuer);
  const clientId    = readEnv(SSO_ENV.clientId);
  const metadataUrl = readEnv(SSO_ENV.metadataUrl);

  const complete =
    rawProtocol === "oidc"
      ? Boolean(issuer && clientId && metadataUrl)
      : Boolean(issuer && metadataUrl);

  if (!complete) return { enabled: false, protocol: rawProtocol, issuer, complete: false };

  return { enabled: true, protocol: rawProtocol, issuer, complete: true };
}

/** True only when a complete, valid SSO configuration is present. */
export function isSsoConfigured(): boolean {
  return resolveSsoConfiguration().enabled;
}
