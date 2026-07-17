"use client";

// PHASE 87E — status message for auth forms. Wraps the ds Alert so error and
// success states share one accessible treatment (role="alert" for danger via
// the ds Alert). Used for submission errors and recovery/verification states.

import type { ReactNode } from "react";
import { Alert } from "@/components/ds";

export interface AuthStatusProps {
  variant: "danger" | "success" | "information";
  title?: ReactNode;
  children?: ReactNode;
}

export function AuthStatus({ variant, title, children }: AuthStatusProps) {
  return (
    <Alert variant={variant} title={title}>
      {children}
    </Alert>
  );
}
