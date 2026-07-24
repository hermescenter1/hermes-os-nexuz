// PHASE 94C1 — the presentation vocabulary of the OT Edge surface.
//
// EVERY RULE THIS FILE ENFORCES EXISTS BECAUSE OF A CLAIM WE MUST NOT MAKE
//   - A raw enum never reaches the screen. `enumLabel` routes through the
//     catalog, and an unmapped value falls back to a bidi-isolated technical
//     token rather than SCREAMING_ENGLISH inside a Persian sentence.
//   - Colour is never the only signal. Every badge carries its own text.
//   - `lastSeenAt` is an OBSERVATION, not a connection state. There is no
//     "online" rendering anywhere in this file, and a null renders as an
//     explicit "Never seen" rather than a dash the reader has to interpret.
//   - The system identifier is labelled as exactly that. It is the primary key
//     of a registry row, not a serial number, so it is never called one.
//
// Server-safe by design (no "use client"): these are pure presentational
// functions over values the caller has already fetched.

import type { ReactNode } from "react";
import { Badge, TechnicalValue, type BadgeVariant } from "@/components/ds";
import { enumLabel, type EnumTranslator } from "@/lib/i18n/enum-label";
import { formatDateTime } from "@/lib/i18n/format";

/**
 * Lifecycle → badge variant.
 *
 * The mapping is deliberately conservative: nothing is `danger`, because none
 * of these states is a fault. A revoked gateway is an administrative decision,
 * not an incident, and colouring it like an alarm would misinform an operator
 * scanning the list.
 */
const GATEWAY_LIFECYCLE_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  REGISTERED: "information",
  STALE: "warning",
  DISABLED: "neutral",
  REVOKED: "neutral",
  SIMULATOR: "brand",
};

const DEVICE_LIFECYCLE_VARIANT: Record<string, BadgeVariant> = {
  OPERATIONAL: "success",
  COMMISSIONING: "information",
  PLANNED: "information",
  MAINTENANCE: "warning",
  DECOMMISSIONED: "neutral",
  UNKNOWN: "neutral",
};

export interface EnumBadgeProps {
  value: string;
  t: EnumTranslator;
  /** Catalog sub-tree, e.g. `enums.gatewayLifecycle`. */
  path: string;
  variant?: BadgeVariant;
}

/**
 * A localized badge for a closed enum.
 *
 * `enumLabel` refuses to build a key from anything that is not a SCREAMING_SNAKE
 * identifier, so an unexpected value can never be turned into a lookup — it
 * falls through to the technical rendering below instead.
 */
export function EnumBadge({ value, t, path, variant = "neutral" }: EnumBadgeProps) {
  if (!value) return <span className="text-text-muted">—</span>;
  const label = enumLabel(t, path, value);
  // When the catalog has no entry the label is a humanised fallback; showing it
  // inside a bdi keeps a Latin token from reordering Persian text around it.
  const mapped = t.has(`${path}.${value}`);
  return (
    <Badge variant={variant}>
      {mapped ? label : <TechnicalValue mono={false}>{label}</TechnicalValue>}
    </Badge>
  );
}

export function GatewayLifecycleBadge({ value, t }: { value: string; t: EnumTranslator }) {
  return <EnumBadge value={value} t={t} path="enums.gatewayLifecycle" variant={GATEWAY_LIFECYCLE_VARIANT[value] ?? "neutral"} />;
}

export function DeviceLifecycleBadge({ value, t }: { value: string; t: EnumTranslator }) {
  return <EnumBadge value={value} t={t} path="enums.deviceLifecycle" variant={DEVICE_LIFECYCLE_VARIANT[value] ?? "neutral"} />;
}

export function DeviceCategoryBadge({ value, t }: { value: string; t: EnumTranslator }) {
  return <EnumBadge value={value} t={t} path="enums.deviceCategory" variant="neutral" />;
}

/**
 * The capabilities a gateway declares.
 *
 * An empty list is stated explicitly ("none declared") rather than left blank:
 * a gateway with no capability cannot ingest anything, which is a fact worth
 * reading, not an absence of information.
 */
export function GatewayCapabilityList({
  values,
  t,
  emptyLabel,
}: {
  values: readonly string[];
  t: EnumTranslator;
  emptyLabel: string;
}) {
  if (values.length === 0) return <span className="text-text-muted">{emptyLabel}</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {values.map((value) => (
        <li key={value}>
          <EnumBadge value={value} t={t} path="enums.gatewayCapability" variant="neutral" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The signing state.
 *
 * A boolean, rendered as words. The reference behind it never crosses the API
 * boundary and is never displayed, hinted at, or partially masked here.
 */
export function SigningState({
  configured,
  configuredLabel,
  notConfiguredLabel,
}: {
  configured: boolean;
  configuredLabel: string;
  notConfiguredLabel: string;
}) {
  return (
    <Badge variant={configured ? "success" : "warning"}>
      {configured ? configuredLabel : notConfiguredLabel}
    </Badge>
  );
}

/**
 * The last-observation cell.
 *
 * Two states only, and neither says "online". A timestamp reports when an
 * envelope was last ACCEPTED; silence reports that none ever was. Anything in
 * between — reachable, healthy, degraded — is not knowable from this field.
 */
export function ObservationValue({
  value,
  locale,
  neverLabel,
}: {
  value: string | null;
  locale: string;
  neverLabel: string;
}) {
  if (value === null) {
    return <span className="text-text-muted">{neverLabel}</span>;
  }
  return (
    <time dateTime={value} className="text-text-secondary">
      {formatDateTime(value, locale)}
    </time>
  );
}

/**
 * A system identifier.
 *
 * Always bidi-isolated: these are Latin/alphanumeric tokens that would
 * otherwise be reordered by the Persian text around them, which for an
 * identifier is not a cosmetic problem — a reordered id is a wrong id.
 */
export function SystemIdentifier({ value }: { value: string }) {
  return <TechnicalValue>{value}</TechnicalValue>;
}

/** A definition-list row, used by both detail pages. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border-subtle py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-label font-medium text-text-secondary sm:w-56 sm:shrink-0">{label}</dt>
      <dd className="text-body text-text-primary">{children}</dd>
    </div>
  );
}

/**
 * A site cell.
 *
 * Three distinct outcomes, kept apart on purpose: a resolved name, a record
 * with no site at all, and a site whose name could not be read (the site
 * registry is separately authorized, so an operator may legitimately see a
 * gateway without being able to name its site). Collapsing them would invent
 * information in two of the three cases.
 */
export function SiteValue({
  siteId,
  siteNames,
  noSiteLabel,
  unknownLabel,
}: {
  siteId: string | null;
  siteNames: Record<string, string>;
  noSiteLabel: string;
  unknownLabel: string;
}) {
  if (siteId === null) return <span className="text-text-muted">{noSiteLabel}</span>;
  const name = siteNames[siteId];
  if (name) return <span className="text-text-primary">{name}</span>;
  return (
    <span className="text-text-secondary">
      <TechnicalValue>{siteId}</TechnicalValue>
      <span className="ms-2 text-text-muted">({unknownLabel})</span>
    </span>
  );
}
