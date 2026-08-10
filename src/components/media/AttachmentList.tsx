import { TechnicalValue } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { useTranslations } from "next-intl";
import { formatByteSize } from "./logic";
import type { MediaAttachmentView } from "./view-model";

/**
 * PHASE 102 — downloadable engineering attachments (P&IDs, tag lists, checklists).
 *
 * THE FILE NAME IS AN UNTRUSTED STRING and it is rendered as such. It came from
 * an operator's upload, it can contain Persian, Latin and digits at once, and it
 * routinely contains a Latin extension. Wrapping it in `<bdi>` (via
 * `TechnicalValue`) stops the bidirectional algorithm from reordering
 * "گزارش-2024.pdf" into something that reads as a different extension — which is
 * the classic RTL-override filename spoof, not merely a cosmetic problem.
 *
 * SIZE IS OMITTED WHEN UNKNOWN, never shown as "0 B": an attachment whose length
 * was never recorded is not an empty file, and `formatByteSize` returns null so
 * the component cannot accidentally claim otherwise.
 *
 * `href` is minted server-side and is same-origin — a component never sees a
 * storage key (ADR §7). Server-renderable.
 */
export interface AttachmentListProps {
  attachments: readonly MediaAttachmentView[];
  className?: string;
}

export function AttachmentList({ attachments, className }: AttachmentListProps) {
  const t = useTranslations("mediaHub");

  if (attachments.length === 0) {
    return (
      <section className={cn("flex flex-col gap-2", className)}>
        <h2 className="text-title font-semibold text-text-primary">{t("attachments.title")}</h2>
        <p className="text-body-compact text-text-muted">{t("attachments.empty")}</p>
      </section>
    );
  }

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h2 className="text-title font-semibold text-text-primary">{t("attachments.title")}</h2>
      <ul className="flex list-none flex-col gap-1 p-0">
        {attachments.map((attachment) => {
          const size = formatByteSize(attachment.byteSize);
          return (
            <li key={attachment.id}>
              <a
                href={attachment.href}
                download={attachment.fileName}
                className={cn(
                  "ds-focus flex items-center gap-3 rounded-sm px-2 py-1.5",
                  "text-body-compact text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                )}
              >
                <span aria-hidden="true" className="shrink-0 text-text-muted">
                  ⭳
                </span>
                <TechnicalValue mono={false} className="min-w-0 break-all">
                  {attachment.fileName}
                </TechnicalValue>
                {size ? (
                  <TechnicalValue className="ms-auto shrink-0 text-label-compact text-text-muted">
                    {size}
                  </TechnicalValue>
                ) : null}
                <span className="sr-only">{t("attachments.download")}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
