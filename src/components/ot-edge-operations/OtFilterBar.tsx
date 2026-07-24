"use client";

// PHASE 94C1 — the filter form for an OT list.
//
// THE DISTINCTION THIS COMPONENT EXISTS TO PRESERVE
// There are three different things an operator could mean by "the filters", and
// conflating them is how a console ends up lying:
//   1. what the controls currently show   (draft — local state)
//   2. what the URL asks for              (requested — the address bar)
//   3. what the displayed rows satisfy    (applied — the loaded response)
// This form owns (1) and submits to (2). It never claims (3): the "applied
// filters" summary is rendered by the list, from the query that produced the
// rows currently on screen.
//
// WHY SUBMIT AND NOT SEARCH-AS-YOU-TYPE
// Every keystroke would be a request against a 120-per-minute budget shared
// with every other OT read, and would race: the response for "PL" can land
// after the response for "PLC". An explicit submit is one request, in order,
// and it also gives the URL a single well-defined state to record.
//
// ONLY SUPPORTED KEYS ARE OFFERED. There is no gateway `category` control and
// no device `vendor` control, because the API supports neither — a control that
// silently does nothing is worse than a missing one.

import { useId, type FormEvent, type ReactNode } from "react";
import { Button, FormField, Input, cn } from "@/components/ds";
import { MAX_SEARCH_LENGTH } from "@/lib/ot-operations/contract";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A native <select>.
 *
 * Native on purpose: it is keyboard- and screen-reader-correct on every
 * platform, works without JavaScript hydration, and on a phone opens the OS
 * picker. A custom listbox would have to re-earn all of that.
 */
export function OtSelect({
  value,
  onChange,
  options,
  anyLabel,
  id,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** The "no filter" choice, whose value is the empty string. */
  anyLabel: string;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "ds-focus h-9 w-full rounded-sm border border-border-default bg-surface-interactive px-3",
        "text-body text-text-primary hover:border-border-active",
      )}
      {...rest}
    >
      <option value="">{anyLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export interface OtFilterBarProps {
  /** The fields, already localized by the caller. */
  children: ReactNode;
  searchLabel: string;
  searchHint: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  legend: string;
  applyLabel: string;
  clearLabel: string;
  /** True while a request is in flight — the controls stay usable, the button does not. */
  busy?: boolean;
  canClear: boolean;
}

export function OtFilterBar({
  children,
  searchLabel,
  searchHint,
  searchValue,
  onSearchChange,
  onSubmit,
  onClear,
  legend,
  applyLabel,
  clearLabel,
  busy = false,
  canClear,
}: OtFilterBarProps) {
  const searchId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    // A real <form>: Enter submits from any field, which is how an operator
    // filtering a list actually behaves.
    <form onSubmit={handleSubmit} className="rounded-lg border border-border-default bg-surface-primary p-4">
      <fieldset className="border-0 p-0">
        <legend className="mb-3 text-label font-semibold text-text-primary">{legend}</legend>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {children}

          <FormField label={searchLabel} description={searchHint} id={searchId}>
            <Input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              // The server refuses a longer term rather than truncating it, so
              // the control stops the operator before the request does.
              maxLength={MAX_SEARCH_LENGTH}
              autoComplete="off"
            />
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {applyLabel}
          </Button>
          <Button type="button" variant="tertiary" size="sm" onClick={onClear} disabled={busy || !canClear}>
            {clearLabel}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
