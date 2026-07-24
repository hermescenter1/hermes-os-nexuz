// PHASE 94C1 — "requires review", stated without overstating.
//
// Every item comes from `lib/ot-operations/attention.ts`, whose rules read only
// fields the API genuinely returns. The panel says so in its own body text,
// because a list headed "requires review" invites an operator to read it as an
// alarm feed — and none of these items reports a fault, an outage or a security
// event. The wording, the neutral styling and the explicit note are all there
// to keep that boundary visible at a glance.
//
// It also describes THIS PAGE only. It never fetches, so it can never speak
// about records outside the authorized, filtered response the list received.

import { Card } from "@/components/ds";
import type { AttentionItem } from "@/lib/ot-operations/attention";

export interface OtAttentionPanelProps<R extends string> {
  items: Array<AttentionItem<R>>;
  /** How many rows on this page are flagged, including those not listed. */
  total: number;
  title: string;
  emptyLabel: string;
  note: string;
  /** Already-formatted "N more records require review." */
  moreLabel: string | null;
  reasonLabel: (reason: R) => string;
}

export function OtAttentionPanel<R extends string>({
  items,
  total,
  title,
  emptyLabel,
  note,
  moreLabel,
  reasonLabel,
}: OtAttentionPanelProps<R>) {
  return (
    <Card variant="soft" className="p-5">
      <h2 className="text-title font-semibold text-text-primary">{title}</h2>

      {items.length === 0 ? (
        <p className="mt-2 text-body text-text-secondary">{emptyLabel}</p>
      ) : (
        <>
          <p className="mt-2 text-label text-text-muted">{note}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 border-s-2 border-border-default ps-3">
                <span className="text-body font-medium text-text-primary">{item.label}</span>
                <span className="text-label text-text-secondary">
                  {/* Joined with a separator rather than nested lists: an item
                      with three reasons should read as one sentence. */}
                  {item.reasons.map(reasonLabel).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          {moreLabel && total > items.length ? (
            <p className="mt-3 text-label text-text-muted">{moreLabel}</p>
          ) : null}
        </>
      )}
    </Card>
  );
}
