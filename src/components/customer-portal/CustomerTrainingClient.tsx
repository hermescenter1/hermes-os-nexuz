"use client";

// PHASE 107 STAGE 6-A — a failed load no longer reads as "you are enrolled in
// nothing". With no error state at all, an expired session produced a training
// page that looked complete and said the learner had no courses and no
// certificates. Endpoint and payload shape unchanged.

import { useLocale } from "next-intl";
import { Link }                from "@/i18n/navigation";
import { formatDate } from "@/lib/i18n/format";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { useResource } from "@/lib/client/use-resource";
import { requestJson } from "@/lib/client/resource-request";

interface Course {
  id:             string;
  titleEn:        string;
  titleFa?:       string;
  level?:         string;
  estimatedHours?: number;
  thumbnailUrl?:  string;
}

interface Enrollment {
  id:          string;
  courseId:    string;
  status:      string;
  progress:    number;
  enrolledAt:  string;
  course:      Course;
}

interface Certificate {
  id:         string;
  courseId:   string;
  issuedAt:   string;
  course:     { id: string; titleEn: string };
}

interface TrainingData {
  enrollments:  Enrollment[];
  certificates: Certificate[];
}

const STATUS_COLORS: Record<string, string> = {
  ENROLLED:    "border-ice/30 bg-ice/10 text-ice",
  IN_PROGRESS: "border-signal/30 bg-signal/10 text-signal",
  COMPLETED:   "border-line bg-surface-2 text-muted",
  ARCHIVED:    "border-line text-metadata",
};

export function CustomerTrainingClient() {
  const locale = useLocale();
  const trainingState = useResource<TrainingData | null>(
    (signal) => requestJson(
      "/api/customer/training",
      (body) => (body as { training?: TrainingData | null }).training,
      { signal },
    ),
    [],
  );

  if (trainingState.status === "LOADING") {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} data-async-state="loading" className="h-24 rounded-xl border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (trainingState.status === "ERROR" && trainingState.failure) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <ResourceFailureNotice code={trainingState.failure} onRetry={trainingState.retry} />
      </div>
    );
  }

  const data = trainingState.data;
  const enrollments  = data?.enrollments  ?? [];
  const certificates = data?.certificates ?? [];

  return (
    <div className="space-y-8">
      {/* Certificates */}
      {certificates.length > 0 && (
        <div className="rounded-xl border border-signal/20 bg-signal/5 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-signal mb-4">Certificates Earned</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {certificates.map((cert) => (
              <div key={cert.id} className="rounded-lg border border-signal/20 bg-surface p-4 flex items-center gap-3">
                <span className="text-xl text-signal">◆</span>
                <div>
                  <p className="text-sm font-medium text-ink">{cert.course.titleEn}</p>
                  <p className="text-xs text-metadata">Issued {formatDate(cert.issuedAt, locale)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active enrollments */}
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-metadata mb-4">My Courses</p>
        {enrollments.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-4">
            <h2 className="text-lg font-bold text-ink">No Courses Enrolled</h2>
            <p className="text-sm text-muted">Browse the academy and enroll in courses to develop your skills.</p>
            <Link
              href="/academy"
              className="inline-block rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
            >
              Browse Academy →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {enrollments.map((en) => (
              <Link key={en.id} href={`/academy/courses/${en.courseId}` as "/customer"}>
                <div className="rounded-xl border border-line bg-surface p-5 hover:border-signal/30 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-medium text-ink">{en.course.titleEn}</p>
                      <p className="text-xs text-metadata mt-0.5">
                        {en.course.level ?? "All levels"}
                        {en.course.estimatedHours ? ` · ${en.course.estimatedHours}h` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-mono font-semibold ${STATUS_COLORS[en.status] ?? "border-line text-muted"}`}>
                      {en.status.replace("_", " ")}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-metadata">Progress</span>
                      <span className="text-xs text-muted font-mono">{en.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line">
                      <div className="h-1.5 rounded-full bg-signal transition-all" style={{ width: `${Math.min(en.progress, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Browse CTA */}
      <div className="rounded-xl border border-line bg-surface p-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-ink">Explore More Courses</p>
          <p className="text-sm text-muted">Discover new training content in the Hermes OS Academy.</p>
        </div>
        <Link
          href="/academy"
          className="shrink-0 rounded-lg border border-signal/30 px-5 py-2.5 text-sm font-medium text-signal hover:bg-signal/10 transition-colors"
        >
          Academy →
        </Link>
      </div>
    </div>
  );
}
