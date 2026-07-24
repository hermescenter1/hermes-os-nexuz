"use client";

// PHASE 94C2 — the shared controls the OT onboarding forms are built from.
//
// WHY THESE EXIST RATHER THAN RAW MARKUP IN EACH FORM
// Four requirements have to hold on every single field, and each is easy to
// lose one field at a time: the label must point at the control, an error must
// be announced AND programmatically associated, an invalid control must say so
// to assistive technology, and an enum must render its localized label while
// submitting its raw value. Centralising them means a new field inherits all
// four instead of re-earning them.
//
// Every control is native. A native <select> and <input type="checkbox"> are
// keyboard- and screen-reader-correct on every platform, work before hydration,
// and open the OS picker on a phone — none of which a custom listbox gets free.

import { useId, type ReactNode } from "react";
import { Alert, Button, FormField, Input, cn } from "@/components/ds";

export interface EnumOption {
  /** The RAW enum value. Submitted verbatim; never translated on the wire. */
  value: string;
  /** The localized label. Display only. */
  label: string;
}

/**
 * A single-choice enum control.
 *
 * `allowEmpty` distinguishes "the operator has not chosen" from "the operator
 * chose the first option" — which matters because an omitted optional field
 * takes the server's default, and that is not the same as pinning a value.
 */
export function OtEnumSelect({
  label,
  value,
  onChange,
  options,
  description,
  error,
  placeholder,
  allowEmpty = true,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: EnumOption[];
  description?: ReactNode;
  error?: string;
  placeholder: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  return (
    <FormField label={label} description={description} error={error} id={id} required={required}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={cn(
          // 44px minimum target height.
          "ds-focus h-11 w-full rounded-sm border bg-surface-interactive px-3",
          "text-body text-text-primary disabled:cursor-not-allowed disabled:opacity-40",
          error ? "border-border-danger" : "border-border-default hover:border-border-active",
        )}
      >
        {allowEmpty ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/**
 * A bounded multi-select for gateway capabilities.
 *
 * Checkboxes rather than a multiple <select>: multi-select listboxes are a
 * well-known usability failure (invisible ctrl-click requirement, accidental
 * deselection of everything), and with six fixed options a checkbox group costs
 * nothing. The group is a fieldset so its legend names the whole set.
 */
export function OtCapabilitySelector({
  legend,
  description,
  options,
  selected,
  onToggle,
  error,
  disabled,
}: {
  legend: string;
  description?: string;
  options: EnumOption[];
  selected: readonly string[];
  onToggle: (value: string, checked: boolean) => void;
  error?: string;
  disabled?: boolean;
}) {
  const errorId = useId();
  const descriptionId = useId();

  return (
    <fieldset
      className="border-0 p-0"
      aria-invalid={error ? true : undefined}
      aria-describedby={cn(description && descriptionId, error && errorId) || undefined}
    >
      <legend className="text-label font-medium text-text-primary">{legend}</legend>
      {description ? (
        <p id={descriptionId} className="mt-1 text-label text-text-muted">
          {description}
        </p>
      ) : null}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-3 py-2",
                "text-body text-text-primary transition-colors duration-fast",
                checked ? "border-brand-border bg-brand-subtle" : "border-border-default hover:border-border-active",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onToggle(option.value, event.target.checked)}
                className="ds-focus h-4 w-4 shrink-0 accent-[--color-brand-primary]"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-label text-status-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** A bounded text field, with the server's own length limit applied. */
export function OtTextField({
  label,
  value,
  onChange,
  maxLength,
  description,
  error,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  description?: ReactNode;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  return (
    <FormField label={label} description={description} error={error} id={id} required={required}>
      <Input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Mirrors the server bound, so the control stops the operator before
        // the request does — a 422 here carries no field detail to show them.
        maxLength={maxLength}
        disabled={disabled}
        error={Boolean(error)}
        autoComplete="off"
        className="h-11"
      />
    </FormField>
  );
}

/** A boolean, rendered as a labelled checkbox rather than a bare toggle. */
export function OtBooleanField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-center gap-2 text-label font-medium text-text-primary"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? descriptionId : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="ds-focus h-4 w-4 shrink-0 accent-[--color-brand-primary]"
        />
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="ms-6 text-label text-text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The form-level failure banner.
 *
 * Form-level rather than field-level on purpose: a server 422 carries no field
 * information at all (`errorResponse` drops the service hint), so attaching it
 * to a field would point the operator at a value that may be perfectly fine.
 */
export function OtFormError({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="danger" title={title}>
      <p>{message}</p>
    </Alert>
  );
}

/**
 * Submit and cancel.
 *
 * The pending state is announced through a live region rather than only through
 * a disabled button, because a disabled control communicates nothing to a
 * screen-reader user who did not already know it was enabled.
 */
export function OtFormActions({
  submitLabel,
  submitting,
  submittingLabel,
  disabled,
  onCancel,
  cancelLabel,
}: {
  submitLabel: string;
  submitting: boolean;
  submittingLabel: string;
  disabled?: boolean;
  onCancel: () => void;
  cancelLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <Button type="submit" variant="primary" disabled={submitting || disabled}>
        {submitting ? submittingLabel : submitLabel}
      </Button>
      <Button type="button" variant="tertiary" onClick={onCancel} disabled={submitting}>
        {cancelLabel}
      </Button>
      <p role="status" aria-live="polite" className="text-label text-text-secondary">
        {submitting ? submittingLabel : ""}
      </p>
    </div>
  );
}
