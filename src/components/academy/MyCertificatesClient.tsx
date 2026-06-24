"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface CertRow {
  id: string;
  courseId: string;
  courseTitle: string;
  verificationToken: string;
  issuedAt: string;
  score: number | null;
}

export function MyCertificatesClient() {
  const [certs,   setCerts]   = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    fetch("/api/academy/certificates")
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((d: { certificates?: CertRow[] }) => {
        setCerts(d.certificates ?? []);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-signal border-t-transparent" />
        <p className="mt-3 text-sm text-muted">Loading certificates…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-6 py-10 text-center">
        <p className="text-sm text-danger">Failed to load certificates. Please refresh or sign in.</p>
      </div>
    );
  }

  if (certs.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-3">
        <div className="text-4xl opacity-30">🎓</div>
        <p className="font-mono text-sm font-semibold text-ink">No certificates earned yet</p>
        <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
          Complete a course and pass its quiz to earn your first certificate.{" "}
          <Link href="/academy" className="text-signal hover:underline">Browse courses →</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="global-ops-strip">
        <div className="global-ops-cell">
          <span className="kpi-label">CERTIFICATES EARNED</span>
          <span className="intel-kpi-value text-signal">{certs.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">LATEST</span>
          <span className="intel-kpi-value text-sm">
            {certs[0] ? new Date(certs[0].issuedAt).toLocaleDateString() : "—"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {certs.map((cert) => (
          <div
            key={cert.id}
            className="relative flex flex-col gap-4 rounded-xl border border-signal/30 bg-surface p-6 overflow-hidden"
          >
            {/* Corner decoration */}
            <span className="absolute top-0 right-0 h-12 w-12 rounded-bl-3xl bg-signal/5 border-l border-b border-signal/20" />

            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-signal mb-1">Certificate of Completion</p>
              <h3 className="font-mono text-sm font-semibold text-ink leading-snug">{cert.courseTitle}</h3>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                <span>Issued</span>
                <span dir="ltr">{new Date(cert.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
              {cert.score !== null && (
                <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                  <span>Final Score</span>
                  <span className="text-signal">{cert.score}%</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                <span>Token</span>
                <span dir="ltr" className="text-muted/60 truncate ml-2 max-w-[120px]">{cert.verificationToken.slice(0, 8)}…</span>
              </div>
            </div>

            <Link
              href={`/academy/certificate/${cert.verificationToken}`}
              className="mt-auto inline-flex items-center gap-1 rounded-lg border border-signal/40 px-3 py-1.5 text-[10px] font-mono text-signal hover:bg-signal/10 transition-colors"
            >
              View &amp; Verify →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
