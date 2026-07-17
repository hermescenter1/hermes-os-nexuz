"use client";

// PHASE 87E — full-width primary submit for auth forms. Wraps the ds Button so
// loading/disabled states and the focus ring are consistent with the rest of
// the product. `loading` shows the busy label + spinner and disables submit.

import { Button } from "@/components/ds";

export interface AuthSubmitProps {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

export function AuthSubmit({ loading = false, disabled = false, children }: AuthSubmitProps) {
  return (
    <Button type="submit" size="lg" fullWidth loading={loading} disabled={disabled || loading}>
      {children}
    </Button>
  );
}
