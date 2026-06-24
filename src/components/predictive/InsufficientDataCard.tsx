"use client";

interface Props {
  reason?: string;
  banner?: string;
}

export default function InsufficientDataCard({ reason, banner }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center space-y-2">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="font-mono text-xs uppercase tracking-widest text-ink/30">
          Insufficient Data
        </span>
      </div>
      <p className="text-ink/60 text-sm">
        {banner ?? "Not enough data yet — this panel will populate once sufficient history accumulates."}
      </p>
      {reason && (
        <p className="text-ink/30 font-mono text-xs mt-2 break-all">{reason}</p>
      )}
    </div>
  );
}
