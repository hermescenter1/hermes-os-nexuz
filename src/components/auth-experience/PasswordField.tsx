"use client";

// PHASE 87E — password input with an accessible visibility toggle.
//
// Self-wires label/description/error like ds FormField (label htmlFor →
// input id, aria-describedby → error id, aria-invalid on error), plus a
// keyboard-accessible show/hide button (type="button", localized aria-label,
// aria-pressed). The technical value stays LTR (dir="ltr") for both locales.

import { useId, useState, forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ds";
import { FOCUS_RING } from "@/components/ds/logic";

export interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  error?: ReactNode;
  id?: string;
}

const INPUT_BASE =
  "w-full h-11 rounded-sm bg-surface-interactive ps-3 pe-11 text-body text-text-primary " +
  "placeholder:text-text-muted border transition-colors duration-fast " +
  FOCUS_RING +
  " disabled:opacity-40 disabled:cursor-not-allowed";

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, id, className, required, ...props }, ref) {
    const t = useTranslations("authExperience");
    const generated = useId();
    const controlId = id ?? generated;
    const errorId = `${controlId}-error`;
    const [visible, setVisible] = useState(false);
    const hasError = Boolean(error);

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={controlId} className="text-label font-medium text-text-primary">
          {label}
          {required ? (
            <span className="ms-1 text-status-danger" aria-hidden="true">*</span>
          ) : null}
        </label>

        <div className="relative">
          <input
            ref={ref}
            id={controlId}
            type={visible ? "text" : "password"}
            dir="ltr"
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : undefined}
            className={cn(
              INPUT_BASE,
              hasError ? "border-border-danger" : "border-border-default hover:border-border-active",
              className,
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t("hidePassword") : t("showPassword")}
            aria-pressed={visible}
            className={cn(
              "absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-sm",
              "text-text-muted transition-colors duration-fast hover:text-text-primary",
              FOCUS_RING,
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
              {visible ? (
                <>
                  <path
                    d="M3 3l14 14M8.5 8.6a2 2 0 002.8 2.8M6.2 6.3C4.4 7.4 3 9 2.3 10c1.4 2.6 4.3 4.5 7.7 4.5 1.3 0 2.5-.3 3.6-.8M11 5.6c3 .5 5.4 2.3 6.7 4.4-.4.8-1 1.5-1.7 2.2"
                    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
                  />
                </>
              ) : (
                <>
                  <path d="M2.3 10C3.7 7.4 6.6 5.5 10 5.5s6.3 1.9 7.7 4.5c-1.4 2.6-4.3 4.5-7.7 4.5S3.7 12.6 2.3 10z"
                    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                </>
              )}
            </svg>
          </button>
        </div>

        {hasError ? (
          <p id={errorId} role="alert" className="text-caption text-status-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
