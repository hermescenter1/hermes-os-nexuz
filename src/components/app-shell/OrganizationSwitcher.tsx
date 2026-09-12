"use client";

/**
 * PHASE 110-A1.0b — the organization switcher.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE CHIP BESIDE IT
 * `OrganizationSelector` displays the context the server resolved. This one
 * CHANGES it, against a real endpoint, and it is the first control on this
 * surface that does. The chip's own comment used to say "no client-facing
 * endpoint exists today that lists a user's organizations or switches sites",
 * which was true when it was written and is not any more.
 *
 * THE RULES THIS COMPONENT FOLLOWS
 *   - It fetches the option list from the server. It never derives one from
 *     anything it was rendered with, and it holds no organization the server
 *     did not just prove.
 *   - Nothing is shown as successful until the server says so. There is no
 *     optimistic rename of the chip, no local "current" that leads the server,
 *     and a failed switch leaves the previous state exactly as it was.
 *   - On success it performs a FULL same-origin navigation rather than a
 *     client-side refresh. A router refresh would leave already-fetched client
 *     caches and in-flight responses from the previous tenant alive in the
 *     page; reloading the document is the one way to be certain that the API,
 *     the server components and this shell are all looking at the same
 *     organization. It costs a page load on an action taken a few times a day.
 *   - The destination is `window.location.pathname` — the page the reader is
 *     already on, taken from the browser rather than from any parameter, so
 *     there is no open-redirect surface and no locale to get wrong.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, cn } from "@/components/ds";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { classifyFailure, type ResourceFailureCode } from "@/lib/client/resource-request";
import type { TenantOption } from "@/lib/tenant-selection/contract";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; options: readonly TenantOption[] }
  | { kind: "saving"; options: readonly TenantOption[]; pending: string }
  | { kind: "failed"; code: ResourceFailureCode };

export interface OrganizationSwitcherProps {
  /**
   * True when the server said a selection is REQUIRED — several memberships and
   * none chosen. The list opens by itself in that state, because the reader
   * cannot proceed without choosing and hiding the choice behind a click would
   * be hiding the only way forward.
   */
  required?: boolean;
  className?: string;
}

export function OrganizationSwitcher({ required = false, className }: OrganizationSwitcherProps) {
  const t = useTranslations("appShell.organizationSwitcher");
  const [open, setOpen] = useState(required);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    try {
      const res = await fetch("/api/tenant/context", {
        // Same-origin only, credentials included so the session cookie travels,
        // and never from a cache: the answer names this reader's memberships.
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await res.json().catch(() => undefined);

      /*
       * A 409 carrying ORGANIZATION_SELECTION_REQUIRED is not a failure here —
       * it is the state this component exists for, and it carries the options.
       * Treating every non-2xx as an error would make the switcher unusable in
       * exactly the situation that requires it.
       */
      const options =
        body && typeof body === "object" && Array.isArray((body as { options?: unknown }).options)
          ? ((body as { options: TenantOption[] }).options)
          : null;

      if (options && options.length > 0) {
        setPhase({ kind: "ready", options });
        return;
      }

      if (res.ok) {
        // Resolved, and the server offered no alternatives. Nothing to choose.
        setPhase({ kind: "ready", options: [] });
        return;
      }

      const code = (body as { code?: unknown } | undefined)?.code;
      setPhase({ kind: "failed", code: classifyFailure(res.status, code) });
    } catch {
      // A thrown fetch is a transport failure, never a statement about the
      // account. `OFFLINE` is the one code with a retry that means something.
      setPhase({ kind: "failed", code: "OFFLINE" });
    }
  }, []);

  useEffect(() => {
    if (open && phase.kind === "idle") void load();
  }, [open, phase.kind, load]);

  const choose = useCallback(
    async (organizationId: string) => {
      const options = phase.kind === "ready" ? phase.options : [];
      setPhase({ kind: "saving", options, pending: organizationId });
      try {
        const res = await fetch("/api/tenant/context", {
          method: "PUT",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ organizationId }),
        });

        if (!res.ok) {
          const body: unknown = await res.json().catch(() => undefined);
          const code = (body as { code?: unknown } | undefined)?.code;
          // The previous state is left intact. Nothing was switched, and the
          // component says so instead of showing a success it did not get.
          setPhase({ kind: "failed", code: classifyFailure(res.status, code) });
          return;
        }

        /*
         * Accepted by the server. Only now does anything change, and it changes
         * by reloading the document rather than by re-rendering with a new name.
         */
        window.location.assign(window.location.pathname);
      } catch {
        setPhase({ kind: "failed", code: "OFFLINE" });
      }
    },
    [phase],
  );

  const close = useCallback(() => {
    setOpen(false);
    setPhase({ kind: "idle" });
    // Focus returns to the control that opened the list, so a keyboard reader
    // is not dropped at the top of the document.
    triggerRef.current?.focus();
  }, []);

  if (!open) {
    return (
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn("min-h-11 w-full", className)}
      >
        {t("switch")}
      </Button>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-2", className)} data-async-state={phase.kind}>
      <p className="text-label-compact font-semibold uppercase text-text-muted">{t("heading")}</p>

      {phase.kind === "loading" || phase.kind === "idle" ? (
        <p className="text-label text-text-muted">{t("loading")}</p>
      ) : null}

      {phase.kind === "failed" ? (
        <ResourceFailureNotice code={phase.code} onRetry={() => void load()} />
      ) : null}

      {phase.kind === "ready" && phase.options.length === 0 ? (
        <p className="text-label text-text-muted">{t("none")}</p>
      ) : null}

      {(phase.kind === "ready" || phase.kind === "saving") && phase.options.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {phase.options.map((option) => {
            const busy = phase.kind === "saving" && phase.pending === option.organizationId;
            return (
              <li key={option.organizationId}>
                <Button
                  variant="secondary"
                  size="sm"
                  // 44px: this is the only way out of the selection state.
                  className="min-h-11 w-full justify-start"
                  disabled={phase.kind === "saving"}
                  onClick={() => void choose(option.organizationId)}
                >
                  {/* The slug is user data, not UI copy — rendered as it is
                      stored, never translated and never reformatted. */}
                  <span className="truncate">{option.organizationSlug}</span>
                  {busy ? <span className="ml-2 shrink-0">{t("saving")}</span> : null}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Cancel exists only when the reader HAS a context to go back to. In the
          required state there is nothing to cancel to, and a dismiss control
          that leaves the page unusable is worse than no control. */}
      {!required ? (
        <Button variant="tertiary" size="sm" className="min-h-11" onClick={close}>
          {t("cancel")}
        </Button>
      ) : null}
    </div>
  );
}
