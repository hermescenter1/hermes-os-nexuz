"use client";

/** Archive or restore a customer. Nothing is ever deleted; the version guards against a stale page. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "./request";

export function ArchiveToggle(props: {
  customerId: string;
  version: number;
  archived: boolean;
  labels: { archive: string; restore: string; working: string; conflict: string; failed: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    const answer = await sendJson("PATCH", `/api/tenant/customers/${props.customerId}`, {
      expectedVersion: props.version,
      archived: !props.archived,
    });
    setBusy(false);
    if (answer.status === 200) {
      router.refresh();
      return;
    }
    setMessage(answer.body.error === "VERSION_CONFLICT" ? props.labels.conflict : props.labels.failed);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-text-primary disabled:opacity-60"
      >
        {busy ? props.labels.working : props.archived ? props.labels.restore : props.labels.archive}
      </button>
      {message && (
        <p role="status" className="text-xs text-warn">
          {message}
        </p>
      )}
    </div>
  );
}
