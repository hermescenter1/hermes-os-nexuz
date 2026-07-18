// PHASE 87I — shared distribution card: a localized status badge per row with
// its real count. Presentational (server-safe); status is conveyed by the
// badge TEXT, the count is tabular and LTR-pinned.

export function DistributionCard({
  title, rows, nf,
}: {
  title: string;
  rows: { key: string; count: number; badge: React.ReactNode }[];
  nf: Intl.NumberFormat;
}) {
  return (
    <div className="ds-glass-card rounded-lg p-5">
      <h3 className="mb-3 text-title-lg font-semibold text-text-primary">{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-2">
            {r.badge}
            <span className="tabular-nums text-body-compact font-semibold text-text-primary" dir="ltr">
              {nf.format(r.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
