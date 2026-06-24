"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface CertData {
  certificate: {
    id: string;
    certificateNumber: string;
    verificationToken: string;
    issuedAt: string;
    expiresAt: string | null;
    metadata: Record<string, unknown>;
  };
  course: {
    id: string;
    title: string;
    category: string;
    level: string;
    instructorName: string | null;
  } | null;
  userName: string;
  valid: boolean;
}

export function CertificateViewClient({ token }: { token: string }) {
  const [data, setData]     = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    fetch(`/api/academy/certificates/${token}`)
      .then((r) => r.json())
      .then((d: CertData & { error?: string }) => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load certificate"); setLoading(false); });
  }, [token]);

  if (loading) return <div className="py-20 text-center text-muted text-sm">Verifying certificate…</div>;

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8 rounded-xl border border-danger/30 bg-danger/5">
          <div className="text-4xl">✗</div>
          <h2 className="font-mono text-lg text-danger">Invalid Certificate</h2>
          <p className="text-sm text-muted">{error || "This certificate could not be verified."}</p>
          <Link href="/academy" className="text-signal text-sm hover:underline">← Back to Academy</Link>
        </div>
      </div>
    );
  }

  const cert   = data.certificate;
  const course = data.course;
  const issued = new Date(cert.issuedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12">
      <div className="w-full max-w-2xl">
        {/* Certificate */}
        <div className="relative rounded-2xl border-2 border-signal/30 bg-surface p-10 text-center space-y-6 overflow-hidden">
          {/* Decorative corner accents */}
          <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-signal/40 rounded-tl-lg" />
          <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-signal/40 rounded-tr-lg" />
          <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-signal/40 rounded-bl-lg" />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-signal/40 rounded-br-lg" />

          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-signal/70">
              HERMES OS · TRAINING ACADEMY
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted/60">
              Certificate of Completion
            </p>
          </div>

          <div className="text-5xl">🎓</div>

          <div className="space-y-2">
            <p className="text-xs text-muted font-mono uppercase tracking-widest">This certifies that</p>
            <h1 className="text-2xl font-bold text-ink">{data.userName}</h1>
            <p className="text-xs text-muted font-mono uppercase tracking-widest">has successfully completed</p>
            <h2 className="text-lg font-semibold text-signal">{course?.title ?? "Industrial Training Course"}</h2>
          </div>

          <div className="flex items-center justify-center gap-6 text-xs">
            {course && (
              <div className="text-center">
                <p className="text-muted font-mono uppercase text-[9px] tracking-widest">Category</p>
                <p className="text-ink capitalize">{course.category}</p>
              </div>
            )}
            {course && (
              <div className="text-center">
                <p className="text-muted font-mono uppercase text-[9px] tracking-widest">Level</p>
                <p className="text-ink capitalize">{course.level}</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-muted font-mono uppercase text-[9px] tracking-widest">Issued</p>
              <p className="text-ink">{issued}</p>
            </div>
          </div>

          {course?.instructorName && (
            <div className="border-t border-line pt-4">
              <p className="text-xs text-muted">Issued by</p>
              <p className="text-sm font-mono text-ink">{course.instructorName}</p>
              <p className="text-[10px] text-muted/60 font-mono">Hermes Training Academy</p>
            </div>
          )}
        </div>

        {/* Verification block */}
        <div className="mt-4 rounded-xl border border-signal/20 bg-signal/5 p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-signal flex items-center justify-center text-bg text-xs font-bold shrink-0">✓</div>
          <div className="flex-1">
            <p className="text-xs font-mono text-signal">Verified Authentic</p>
            <p className="text-[10px] text-muted font-mono mt-0.5">Certificate #{cert.certificateNumber}</p>
          </div>
          {cert.expiresAt && (
            <div className="text-right">
              <p className="text-[10px] text-muted font-mono">Expires</p>
              <p className="text-[10px] text-ink">{new Date(cert.expiresAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[10px] text-muted font-mono">
          Verification URL: /academy/certificate/{token}
        </p>
      </div>
    </div>
  );
}
