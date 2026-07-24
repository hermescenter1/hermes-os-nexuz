"use client";

// PHASE 94C2 — choosing the record a new profile attaches to.
//
// THIS CONTROL EXISTS BECAUSE THE IDENTIFIER IS NOT WHAT IT LOOKS LIKE
// `CreateGateway.gatewayId` is the PRIMARY KEY of an `IndustrialGateway` row —
// not the hardware identifier printed on the device, which is a different field
// on the same record. Sending the wrong one earns a bare 422 with no field
// detail. So the operator never types an identifier: they pick a record, the
// control shows the human-readable name and the hardware reference for
// recognition, and it submits `record.id`.
//
// SITE IS SHOWN, NEVER SUBMITTED
// No write schema accepts `siteId`. A profile inherits the site of the record
// it points at, so the site here is a consequence of the choice — displayed so
// the operator can see what they are committing to, and offered as a FILTER to
// narrow a long list. It is never part of the payload.
//
// A FAILURE TO LOAD BLOCKS SUBMISSION
// An empty picker and an unreadable picker look identical, and telling an
// operator "you have no gateways" when the truth is "the list could not be
// read" would send them to provision something that already exists.

import { useId, useMemo } from "react";
import { Alert, Button, FormField, cn } from "@/components/ds";
import { TechnicalValue } from "@/components/ds";
import type { ParentOption } from "@/lib/ot-operations/mutations";

export interface OtParentSelectorProps {
  label: string;
  hint: string;
  placeholder: string;
  options: readonly ParentOption[];
  value: string;
  onChange: (id: string) => void;
  /** Site filter — narrows the list only; never submitted. */
  siteFilter: string;
  onSiteFilterChange: (siteId: string) => void;
  siteFilterLabel: string;
  anySiteLabel: string;
  siteNames: Record<string, string>;
  siteLabel: string;
  siteInheritedHint: string;
  siteNotSelectedLabel: string;
  referenceLabel: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export function OtParentSelector({
  label,
  hint,
  placeholder,
  options,
  value,
  onChange,
  siteFilter,
  onSiteFilterChange,
  siteFilterLabel,
  anySiteLabel,
  siteNames,
  siteLabel,
  siteInheritedHint,
  siteNotSelectedLabel,
  referenceLabel,
  error,
  disabled,
  required,
}: OtParentSelectorProps) {
  const selectId = useId();
  const filterId = useId();

  // Only the sites actually represented among the options — offering a site
  // with no candidates would be a filter that can only empty the list.
  const siteChoices = useMemo(() => {
    const ids = [...new Set(options.map((option) => option.siteId))];
    return ids
      .map((id) => ({ id, label: siteNames[id] ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [options, siteNames]);

  const visible = useMemo(
    () =>
      (siteFilter ? options.filter((option) => option.siteId === siteFilter) : options)
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    [options, siteFilter],
  );

  const selected = options.find((option) => option.id === value) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {siteChoices.length > 1 ? (
        <FormField label={siteFilterLabel} id={filterId}>
          <select
            value={siteFilter}
            onChange={(event) => onSiteFilterChange(event.target.value)}
            disabled={disabled}
            className={cn(
              "ds-focus h-11 w-full rounded-sm border border-border-default bg-surface-interactive px-3",
              "text-body text-text-primary hover:border-border-active disabled:opacity-40",
            )}
          >
            <option value="">{anySiteLabel}</option>
            {siteChoices.map((site) => (
              <option key={site.id} value={site.id}>
                {site.label}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}

      <FormField label={label} description={hint} error={error} id={selectId} required={required}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={cn(
            "ds-focus h-11 w-full rounded-sm border bg-surface-interactive px-3",
            "text-body text-text-primary disabled:cursor-not-allowed disabled:opacity-40",
            error ? "border-border-danger" : "border-border-default hover:border-border-active",
          )}
        >
          <option value="">{placeholder}</option>
          {visible.map((option) => (
            // The VALUE is the primary key; the TEXT is what a human reads.
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      {/* The consequences of the choice, stated before submission. */}
      <dl className="rounded-sm border border-border-subtle bg-surface-secondary p-3 text-label">
        <div className="flex flex-wrap items-baseline gap-2">
          <dt className="text-text-secondary">{siteLabel}</dt>
          <dd className="text-text-primary">
            {selected ? (
              <>
                {siteNames[selected.siteId] ?? <TechnicalValue>{selected.siteId}</TechnicalValue>}
                <span className="ms-2 text-text-muted">({siteInheritedHint})</span>
              </>
            ) : (
              <span className="text-text-muted">{siteNotSelectedLabel}</span>
            )}
          </dd>
        </div>
        {selected?.reference ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <dt className="text-text-secondary">{referenceLabel}</dt>
            <dd>
              {/* Shown for recognition, never submitted — the payload carries
                  the primary key above. */}
              <TechnicalValue>{selected.reference}</TechnicalValue>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** The picker could not be read, so registration cannot proceed. */
export function OtParentsUnavailable({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="danger" title={title}>
      <p>{body}</p>
      <p className="mt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      </p>
    </Alert>
  );
}

/** The picker loaded and is genuinely empty — a different fact entirely. */
export function OtParentsEmpty({ title, body }: { title: string; body: string }) {
  return (
    <Alert variant="warning" title={title}>
      <p>{body}</p>
    </Alert>
  );
}
