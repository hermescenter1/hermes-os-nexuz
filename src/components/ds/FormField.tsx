"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";
import { describedBy, fieldIds } from "./logic";

export { fieldIds };

export interface FormFieldProps {
  label: ReactNode;
  /** The single control element (Input, Textarea, Select, …). */
  children: ReactElement;
  description?: ReactNode;
  /** When set, renders the error message, associates it, and marks invalid. */
  error?: ReactNode;
  required?: boolean;
  /** Provide a stable id; otherwise one is generated. */
  id?: string;
  className?: string;
}

/**
 * FormField — label + control + description/error with correct wiring:
 * `label htmlFor` → control id, `aria-describedby` → description + error ids,
 * `aria-invalid` when in error. The error message carries `role="alert"`.
 * The control's own props win over the injected ones.
 */
export function FormField({
  label,
  children,
  description,
  error,
  required,
  id,
  className,
}: FormFieldProps) {
  const generated = useId();
  const { controlId, descriptionId, errorId } = fieldIds(id ?? generated);
  const hasError = Boolean(error);

  const childProps = isValidElement(children)
    ? (children.props as { id?: string; "aria-describedby"?: string })
    : {};

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: childProps.id ?? controlId,
        "aria-describedby": describedBy(
          description ? descriptionId : null,
          hasError ? errorId : null,
          childProps["aria-describedby"],
        ),
        ...(hasError ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={childProps.id ?? controlId} className="text-label font-medium text-text-primary">
        {label}
        {required ? (
          <span className="ms-1 text-status-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {control}

      {description && !hasError ? (
        <p id={descriptionId} className="text-caption text-text-muted">
          {description}
        </p>
      ) : null}

      {hasError ? (
        <p id={errorId} role="alert" className="text-caption text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
