interface Protocol {
  name:   string;
  status: "online" | "degraded" | "offline";
}

interface AssetContextPanelProps {
  domains:   string[];
  vendors:   string[];
  protocols?: Protocol[];
}

const STATUS_DOT: Record<string, string> = {
  online:   "bg-signal",
  degraded: "bg-[--warn]",
  offline:  "bg-[--danger]",
};

const DEFAULT_PROTOCOLS: Protocol[] = [
  { name: "OPC-UA", status: "online"   },
  { name: "MQTT",   status: "online"   },
  { name: "Modbus", status: "degraded" },
];

/**
 * Industrial asset context panel — shows detected protocols, vendor ecosystem,
 * and domain coverage for the current copilot analysis.
 */
export function AssetContextPanel({
  domains,
  vendors,
  protocols = DEFAULT_PROTOCOLS,
}: AssetContextPanelProps) {
  if (domains.length === 0 && vendors.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted mb-4">
        Industrial Asset Context
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Detected vendors */}
        {vendors.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted/60 mb-2">
              Vendor Ecosystem
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vendors.map((v) => (
                <span
                  key={v}
                  className="px-2 py-0.5 rounded border border-line bg-bg/60 font-mono text-[0.68rem] text-ink"
                  dir="ltr"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Domain coverage */}
        {domains.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted/60 mb-2">
              Domain Coverage
            </p>
            <div className="flex flex-wrap gap-1.5">
              {domains.map((d) => (
                <span
                  key={d}
                  className="px-2 py-0.5 rounded border border-signalDim/30 bg-signal/5 font-mono text-[0.68rem] text-signal"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Protocol status */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted/60 mb-2">
            Protocol Status
          </p>
          <ul className="space-y-1.5">
            {protocols.map((p) => (
              <li key={p.name} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status]}`} />
                <span className="font-mono text-[0.7rem] text-ink" dir="ltr">{p.name}</span>
                <span className="font-mono text-[0.65rem] text-muted ms-auto">{p.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
