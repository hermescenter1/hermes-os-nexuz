/**
 * Hermes OS — Phase 98 configuration inventory & recovery contract.
 *
 * A machine-readable, SECRET-FREE inventory of every production configuration
 * surface: environment KEY NAMES (never values), config files, persistent volumes
 * and canonical identity. Each item declares its source class, whether it is
 * required, WHERE it is recovered from and WHICH role owns its recovery. An offline
 * validator proves the inventory documents every key in `.env.production.example`,
 * contains no secret values, gives every non-repository item a recovery source and
 * leaves no item with UNKNOWN recovery ownership.
 *
 * sourceClass: REPOSITORY_MANAGED | SECRET_EXTERNAL | HOST_MANAGED | REGENERATED |
 *              OWNER_CONFIGURATION | DERIVED
 * required:    required | optional | conditional
 */

import { canonicalSha256 } from "./canonical-json.mjs";
import { scanForSecrets } from "./secret-scan.mjs";

export const INVENTORY_SCHEMA_VERSION = "1.0";

/** @param {string} key @param {object} o */
function env(key, o) {
  return {
    key,
    secret: !!o.secret,
    client: !!o.client,
    sourceClass: o.sourceClass,
    required: o.required,
    recoverySource: o.recoverySource,
    ownerRole: o.ownerRole,
  };
}

const SECRET_STORE = "External secret store / operator vault (never in repo)";
const REPO = "Repository (docker-compose / defaults)";
const OWNER = "Owner runbook decision";
const HOST = "Deployment host / runtime";

export const ENV_INVENTORY = [
  env("NODE_ENV", { sourceClass: "HOST_MANAGED", required: "required", recoverySource: HOST, ownerRole: "Platform/SRE" }),
  env("APP_URL", { sourceClass: "OWNER_CONFIGURATION", required: "required", recoverySource: OWNER, ownerRole: "Operations" }),
  env("NEXT_PUBLIC_APP_URL", { client: true, sourceClass: "OWNER_CONFIGURATION", required: "required", recoverySource: OWNER, ownerRole: "Operations" }),
  env("DATABASE_URL", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Database recovery owner" }),
  env("HERMES_STORAGE_MODE", { sourceClass: "OWNER_CONFIGURATION", required: "required", recoverySource: REPO, ownerRole: "Platform/SRE" }),
  env("POSTGRES_USER", { sourceClass: "REPOSITORY_MANAGED", required: "required", recoverySource: REPO, ownerRole: "Database recovery owner" }),
  env("POSTGRES_PASSWORD", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "required", recoverySource: SECRET_STORE, ownerRole: "Database recovery owner" }),
  env("POSTGRES_DB", { sourceClass: "REPOSITORY_MANAGED", required: "required", recoverySource: REPO, ownerRole: "Database recovery owner" }),
  env("POSTGRES_CONTAINER", { sourceClass: "REPOSITORY_MANAGED", required: "optional", recoverySource: REPO, ownerRole: "Platform/SRE" }),
  env("REDIS_URL", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Platform/SRE" }),
  env("REDIS_PASSWORD", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Platform/SRE" }),
  env("JWT_SECRET", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Application/release owner" }),
  env("JWT_ACCESS_SECRET", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Application/release owner" }),
  env("AUTH_SECRET", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Application/release owner" }),
  env("NEXTAUTH_SECRET", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Application/release owner" }),
  env("ADMIN_EMAIL", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: OWNER, ownerRole: "Operations" }),
  env("ADMIN_PASSWORD", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "optional", recoverySource: SECRET_STORE, ownerRole: "Operations" }),
  env("ADMIN_NAME", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: OWNER, ownerRole: "Operations" }),
  env("EMAIL_PROVIDER", { sourceClass: "OWNER_CONFIGURATION", required: "required", recoverySource: OWNER, ownerRole: "Operations" }),
  env("EMAIL_FROM", { sourceClass: "OWNER_CONFIGURATION", required: "conditional", recoverySource: OWNER, ownerRole: "Operations" }),
  env("SMTP_HOST", { sourceClass: "OWNER_CONFIGURATION", required: "conditional", recoverySource: OWNER, ownerRole: "Operations" }),
  env("SMTP_PORT", { sourceClass: "OWNER_CONFIGURATION", required: "conditional", recoverySource: OWNER, ownerRole: "Operations" }),
  env("SMTP_USER", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Operations" }),
  env("SMTP_PASS", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Operations" }),
  env("BACKUP_DIR", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Database recovery owner" }),
  env("BACKUP_RETENTION_DAYS", { sourceClass: "REPOSITORY_MANAGED", required: "optional", recoverySource: REPO, ownerRole: "Database recovery owner" }),
  env("LOG_LEVEL", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Platform/SRE" }),
  env("SHUTDOWN_DRAIN_MS", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Platform/SRE" }),
  env("OPENAI_API_KEY", { secret: true, sourceClass: "SECRET_EXTERNAL", required: "optional", recoverySource: SECRET_STORE, ownerRole: "Application/release owner" }),
  env("DOCUMENT_EMBEDDINGS_PROVIDER", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: OWNER, ownerRole: "Application/release owner" }),
  env("OPENAI_EMBEDDING_MODEL", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Application/release owner" }),
  env("HERMES_RAG_MODE", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Application/release owner" }),
  env("HERMES_PROJECT_INTELLIGENCE_ENABLED", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Application/release owner" }),
  env("HERMES_DOCUMENT_STORAGE_PROVIDER", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Upload recovery owner" }),
  env("HERMES_LOCAL_DOCUMENT_STORAGE_DIR", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: REPO, ownerRole: "Upload recovery owner" }),
  // ── Phase 98 additions (backup encryption + off-host readiness) ──────────────
  env("HERMES_BACKUP_KEY_FILE", { sourceClass: "OWNER_CONFIGURATION", required: "conditional", recoverySource: SECRET_STORE, ownerRole: "Database recovery owner" }),
  env("HERMES_BACKUP_KEY_ID", { sourceClass: "OWNER_CONFIGURATION", required: "conditional", recoverySource: OWNER, ownerRole: "Database recovery owner" }),
  env("BACKUP_MIN_VERIFIED_COPIES", { sourceClass: "REPOSITORY_MANAGED", required: "optional", recoverySource: REPO, ownerRole: "Database recovery owner" }),
  env("HERMES_OFFHOST_BACKUP_DEST", { sourceClass: "OWNER_CONFIGURATION", required: "optional", recoverySource: OWNER, ownerRole: "Platform/SRE" }),
];

export const CONFIG_SURFACES = [
  { item: "Git revision", sourceClass: "REPOSITORY_MANAGED", recoverySource: "Git (origin/main pinned SHA)", ownerRole: "Application/release owner" },
  { item: "docker-compose.prod.yml", sourceClass: "REPOSITORY_MANAGED", recoverySource: "Git", ownerRole: "Platform/SRE" },
  { item: "deploy/nginx/default.conf", sourceClass: "REPOSITORY_MANAGED", recoverySource: "Git", ownerRole: "DNS/TLS recovery owner" },
  { item: "TLS certificates (/etc/letsencrypt)", sourceClass: "REGENERATED", recoverySource: "Certbot re-issue (ACME) — deploy/ssl/README.md", ownerRole: "DNS/TLS recovery owner" },
  { item: "Certbot renew cron (/etc/cron.d/certbot-renew)", sourceClass: "HOST_MANAGED", recoverySource: "Host cron re-install per deploy/ssl/README.md", ownerRole: "Platform/SRE" },
  { item: "OpenBao client config (OPENBAO_* / OT_SECRET_BACKEND)", sourceClass: "OWNER_CONFIGURATION", recoverySource: "OpenBao DR contract (Phase 94/95 runbooks) + secret store", ownerRole: "OpenBao recovery owner" },
  { item: "Backup encryption key", sourceClass: "SECRET_EXTERNAL", recoverySource: SECRET_STORE, ownerRole: "Database recovery owner" },
  { item: "Backup location (BACKUP_DIR + off-host)", sourceClass: "OWNER_CONFIGURATION", recoverySource: OWNER, ownerRole: "Database recovery owner" },
  { item: "GitHub protected 'production' environment + deploy secrets", sourceClass: "HOST_MANAGED", recoverySource: "GitHub repo settings + secret store", ownerRole: "Platform/SRE" },
  { item: "Monitoring (Uptime Kuma / /api/metrics + METRICS_TOKEN)", sourceClass: "OWNER_CONFIGURATION", recoverySource: "deploy/monitoring/README.md + secret store", ownerRole: "Monitoring owner" },
  { item: "Canonical Compose project name", sourceClass: "REPOSITORY_MANAGED", recoverySource: "Fixed literal 'hermes' (docker-compose.prod.yml name:)", ownerRole: "Platform/SRE" },
  { item: "Application working directory", sourceClass: "HOST_MANAGED", recoverySource: "Fixed path /opt/hermes-os-nexuz", ownerRole: "Platform/SRE" },
  { item: "Release-state directory", sourceClass: "OWNER_CONFIGURATION", recoverySource: "Host path documented in release runbook", ownerRole: "Application/release owner" },
  { item: "Application image / release identity", sourceClass: "REPOSITORY_MANAGED", recoverySource: "Rebuilt from pinned Git SHA; digest recorded in release manifest", ownerRole: "Application/release owner" },
];

export const PERSISTENT_VOLUMES = [
  { name: "postgres_data", mount: "/var/lib/postgresql/data", sourceClass: "REGENERATED", recoverySource: "Encrypted PostgreSQL backup (.hbk) + restore", ownerRole: "Database recovery owner" },
  { name: "redis_data", mount: "/data", sourceClass: "REGENERATED", recoverySource: "REBUILD_FROM_AUTHORITATIVE_STATE (fresh Redis; AOF is node-resilience only)", ownerRole: "Platform/SRE" },
  { name: "uploads_data", mount: "/app/public/uploads", sourceClass: "REGENERATED", recoverySource: "Encrypted uploads backup (.hbk) + restore", ownerRole: "Upload recovery owner" },
  { name: "documents_data", mount: "/app/.data/documents", sourceClass: "REGENERATED", recoverySource: "Encrypted uploads backup (.hbk) + restore (Phase 98 additive volume)", ownerRole: "Upload recovery owner" },
];

export function renderInventory() {
  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    note: "SECRET-FREE. Environment KEY NAMES only — never values. Generated by scripts/dr/config-inventory.mjs.",
    env: ENV_INVENTORY,
    surfaces: CONFIG_SURFACES,
    volumes: PERSISTENT_VOLUMES,
  };
}

export function inventorySha256() {
  return canonicalSha256(renderInventory());
}

/** Parse `KEY=...` lines from an env template (returns the set of KEY names). */
export function parseEnvKeys(envText) {
  const keys = new Set();
  for (const line of envText.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/**
 * @param {ReturnType<typeof renderInventory>} inv
 * @param {string} envExampleText  contents of .env.production.example
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateInventory(inv, envExampleText) {
  const errors = [];
  const known = new Set(inv.env.map((e) => e.key));

  // 1. Every key documented in the env template must be inventoried.
  for (const k of parseEnvKeys(envExampleText)) {
    if (!known.has(k)) errors.push(`CONFIGURATION_RECOVERY_UNDOCUMENTED: env key '${k}' missing from inventory`);
  }

  // 2. No secret VALUES anywhere in the inventory (names only).
  for (const l of scanForSecrets(inv)) errors.push(`CONFIG_SECRET_VALUE_IN_RECOVERY_MANIFEST: ${l}`);

  // 3. Structural rules on each item.
  const validSource = new Set(["REPOSITORY_MANAGED", "SECRET_EXTERNAL", "HOST_MANAGED", "REGENERATED", "OWNER_CONFIGURATION", "DERIVED"]);
  const check = (item, label) => {
    if (!validSource.has(item.sourceClass)) errors.push(`${label}: invalid sourceClass '${item.sourceClass}'`);
    if (!item.ownerRole || item.ownerRole === "UNKNOWN") errors.push(`RECOVERY_OWNER_UNASSIGNED: ${label} '${item.key ?? item.item ?? item.name}'`);
    // Every non-repository item needs an explicit recovery source.
    if (item.sourceClass !== "REPOSITORY_MANAGED" && (!item.recoverySource || item.recoverySource === "UNKNOWN")) {
      errors.push(`CONFIGURATION_RECOVERY_UNDOCUMENTED: ${label} '${item.key ?? item.item ?? item.name}' has no recovery source`);
    }
  };
  inv.env.forEach((e) => check(e, "env"));
  inv.surfaces.forEach((s) => check(s, "surface"));
  inv.volumes.forEach((v) => check(v, "volume"));

  return { ok: errors.length === 0, errors };
}
