"use client";

// PHASE 87E — text/email/etc. field for the auth experience: thin wrapper over
// the ds FormField + Input so every auth input gets correct label wiring,
// aria-invalid, aria-describedby and error role="alert" for free. Interactive
// height is 44px (mobile touch target).

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { FormField, Input } from "@/components/ds";

export interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  error?: ReactNode;
  id?: string;
}

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, error, id, required, className, ...props },
  ref,
) {
  return (
    <FormField label={label} error={error} required={required} id={id}>
      <Input ref={ref} error={Boolean(error)} required={required} className={`h-11 ${className ?? ""}`} {...props} />
    </FormField>
  );
});
