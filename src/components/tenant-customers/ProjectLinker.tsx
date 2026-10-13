"use client";

/**
 * Link one of the organization's own projects to this customer, or unlink one.
 * Only projects the server listed for THIS organization are offered; the API
 * and the composite foreign key refuse anything else regardless.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "./request";

export function ProjectLinker(props: {
  customerId: string;
  linked: ReadonlyArray<{ id: string; name: string }>;
  available: ReadonlyArray<{ id: string; name: string }>;
  labels: { title: string; choose: string; link: string; unlink: string; noLinkable: string; elsewhere: string; failed: string };
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(props.available[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function change(projectId: string, linked: boolean) {
    setBusy(true);
    setMessage(null);
    const answer = await sendJson("PUT", `/api/tenant/customers/${props.customerId}/projects`, { projectId, linked });
    setBusy(false);
    if (answer.status === 200) {
      router.refresh();
      return;
    }
    setMessage(answer.body.error === "PROJECT_LINKED_ELSEWHERE" ? props.labels.elsewhere : props.labels.failed);
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-border-default bg-surface-interactive px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal";

  return (
    <div className="space-y-3">
      {props.linked.length > 0 && (
        <ul className="space-y-2 text-sm">
          {props.linked.map(p => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-text-primary">{p.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => change(p.id, false)}
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-text-primary disabled:opacity-60"
              >
                {props.labels.unlink}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs font-medium text-muted">{props.labels.title}</p>
      {props.available.length === 0 ? (
        <p className="text-xs text-muted">{props.labels.noLinkable}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-xs text-muted">
            {props.labels.choose}
            <select value={choice} onChange={e => setChoice(e.target.value)} className={fieldClass}>
              {props.available.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !choice}
            onClick={() => change(choice, true)}
            className="rounded-md border border-signal bg-signalDim px-4 py-2 text-sm text-signal disabled:opacity-60"
          >
            {props.labels.link}
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-warn">
          {message}
        </p>
      )}
    </div>
  );
}
