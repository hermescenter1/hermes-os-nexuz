"use client";

// PHASE 94C2 — what a successful write is allowed to say.
//
// REGISTRATION MEANS A RECORD WAS CREATED. NOTHING ELSE.
// It does not mean the gateway is connected, that its signature verified, that
// the device is online, that telemetry is flowing, or that anything was
// commissioned. None of those is knowable at this moment, and an operator who
// reads "registered" as "working" will stop looking for the reason it is not.
// The body text says so explicitly rather than relying on the absence of a
// claim, and a test forbids the vocabulary outright.
//
// The identifier is echoed because it is what the operator needs to correlate
// the record with their own paperwork — bidi-isolated, because a reordered
// identifier is a wrong identifier, not merely an ugly one.

import { useState } from "react";
import { Alert, Button, TechnicalValue } from "@/components/ds";
import { Link } from "@/i18n/navigation";

export interface OtRegistrationSuccessProps {
  title: string;
  body: string;
  identifierLabel: string;
  identifier: string;
  detailHref: string;
  detailLabel: string;
  listHref: string;
  listLabel: string;
  copyLabel: string;
  copiedLabel: string;
}

export function OtRegistrationSuccess({
  title,
  body,
  identifierLabel,
  identifier,
  detailHref,
  detailLabel,
  listHref,
  listLabel,
  copyLabel,
  copiedLabel,
}: OtRegistrationSuccessProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(identifier);
      setCopied(true);
    } catch {
      // Clipboard access can be refused by the browser. The identifier is
      // already on screen and selectable, so this is not worth an error state.
      setCopied(false);
    }
  }

  return (
    // `role="status"` with a polite live region: the outcome of a submission is
    // exactly the kind of change a screen-reader user must be told about
    // without having to go looking for it.
    <div role="status" aria-live="polite">
      <Alert variant="success" title={title}>
        <p>{body}</p>

        <dl className="mt-4 flex flex-wrap items-baseline gap-2">
          <dt className="text-label text-text-secondary">{identifierLabel}</dt>
          <dd>
            <TechnicalValue>{identifier}</TechnicalValue>
          </dd>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={copy}>
            {copied ? copiedLabel : copyLabel}
          </Button>
          <Link
            href={detailHref}
            className="ds-focus font-medium text-brand-primary underline-offset-2 hover:underline"
          >
            {detailLabel}
          </Link>
          <Link
            href={listHref}
            className="ds-focus font-medium text-brand-primary underline-offset-2 hover:underline"
          >
            {listLabel}
          </Link>
        </div>
      </Alert>
    </div>
  );
}
