"use client";

/**
 * ATS-M1 — create or edit a position.
 *
 * Saving never publishes: a new position is always a private DRAFT, and an
 * edit keeps the lifecycle state (opening is a separate, gated action). The
 * form sends the WHOLE position on save, with the version it loaded; the
 * server validates every field (the same Zod contract this form imports),
 * refuses protected characteristics in anything a candidate is judged on, and
 * answers a stale form with 409 instead of merging over someone's change.
 *
 * A role template (the reviewed catalogue) can prefill the criteria, rubric,
 * interview kit, assessment, approval owner and SLA; everything it fills stays
 * editable, and nothing it cannot know (owner, location, public copy) is filled.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ds/Button";
import { buttonVariants } from "@/components/ds/logic";
import { Input } from "@/components/ds/Input";
import { Textarea } from "@/components/ds/Textarea";
import { Switch } from "@/components/ds/Switch";
import { Alert } from "@/components/ds/Alert";
import { DIMENSIONS, type Dimension } from "@/lib/ats/review/report-schema";
import { ROLE_CODES, ROLE_PROFILES, qualifiedCriterionCode, type RoleCode } from "@/lib/ats/review/catalog";
import {
  APPROVAL_OWNER_ROLES,
  ASSESSMENT_FORMATS,
  EMPLOYMENT_TYPES,
  INTERVIEW_OWNER_ROLES,
  INTERVIEW_STAGE_KINDS,
  MOBILITY_POLICIES,
  WORK_MODES,
  type PositionLocale,
} from "@/lib/ats/positions/contract";
import { atsMutate, atsRead } from "./client-api";
import { ToastRegion, useRefusalMessage, useToasts } from "./feedback";

// ── Form model ───────────────────────────────────────────────────────────────

interface CriterionDraft {
  code?: string;
  label: string;
  dimension: Dimension;
  weight: number;
  keywords: string;
  minYears: string;
  hardGate: boolean;
}

interface RubricItem {
  item: string;
  anchors: { low: string; mid: string; high: string };
}

interface StageDraft {
  code: string;
  kind: (typeof INTERVIEW_STAGE_KINDS)[number];
  label: string;
  ownerRole: (typeof INTERVIEW_OWNER_ROLES)[number];
  slaDays: number;
  durationMinutes: number;
  questions: string;
  rubric: RubricItem[];
  policyGated?: boolean;
}

interface CopyDraft {
  title: string;
  summary: string;
  description: string;
  responsibilities: string;
  requirements: string;
  preferredExperience: string;
}

interface FormState {
  requisitionKey: string;
  internalTitle: string;
  publicTitle: string;
  department: string;
  employmentType: string;
  workMode: string;
  location: string;
  addressLocality: string;
  addressCountry: string;
  sponsorshipPolicy: string;
  relocationPolicy: string;
  salaryConfidential: boolean;
  salaryCurrency: string;
  salaryMin: string;
  salaryMax: string;
  internalBrief: string;
  evidenceRequirements: string;
  copy: Record<PositionLocale, CopyDraft>;
  mustHave: CriterionDraft[];
  niceToHave: CriterionDraft[];
  disqualifiers: CriterionDraft[];
  rubricEnabled: boolean;
  rubric: Record<Dimension, number>;
  stages: StageDraft[];
  assessmentEnabled: boolean;
  assessment: { title: string; format: (typeof ASSESSMENT_FORMATS)[number]; durationMinutes: number; evaluates: string; submission: string };
  hiringOwnerMemberId: string;
  approvalOwnerRole: string;
  decisionSlaDays: string;
  closingDate: string;
  roleProfileCode: string;
}

const emptyCopy = (): CopyDraft => ({ title: "", summary: "", description: "", responsibilities: "", requirements: "", preferredExperience: "" });
const zeroRubric = (): Record<Dimension, number> => Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;

function emptyForm(): FormState {
  return {
    requisitionKey: "",
    internalTitle: "",
    publicTitle: "",
    department: "",
    employmentType: "",
    workMode: "",
    location: "",
    addressLocality: "",
    addressCountry: "",
    sponsorshipPolicy: "",
    relocationPolicy: "",
    salaryConfidential: true,
    salaryCurrency: "",
    salaryMin: "",
    salaryMax: "",
    internalBrief: "",
    evidenceRequirements: "",
    copy: { en: emptyCopy(), fa: emptyCopy(), de: emptyCopy() },
    mustHave: [],
    niceToHave: [],
    disqualifiers: [],
    rubricEnabled: false,
    rubric: zeroRubric(),
    stages: [],
    assessmentEnabled: false,
    assessment: { title: "", format: "TAKE_HOME", durationMinutes: 60, evaluates: "", submission: "" },
    hiringOwnerMemberId: "",
    approvalOwnerRole: "",
    decisionSlaDays: "",
    closingDate: "",
    roleProfileCode: "",
  };
}

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const joinLines = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n") : "");
const orNull = (v: string) => (v.trim() ? v.trim() : null);
const intOrNull = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

function criterionPayload(c: CriterionDraft) {
  return {
    ...(c.code ? { code: c.code } : {}),
    label: c.label.trim(),
    dimension: c.dimension,
    weight: Math.max(0, Math.min(100, Math.trunc(c.weight) || 0)),
    keywords: c.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    minYears: intOrNull(c.minYears),
    hardGate: c.hardGate,
  };
}

function toPayload(f: FormState, mode: "create" | "edit", version: number) {
  const copy = (locale: PositionLocale) => ({
    title: f.copy[locale].title.trim(),
    summary: f.copy[locale].summary.trim(),
    description: f.copy[locale].description.trim(),
    responsibilities: lines(f.copy[locale].responsibilities),
    requirements: lines(f.copy[locale].requirements),
    preferredExperience: lines(f.copy[locale].preferredExperience),
  });
  const body: Record<string, unknown> = {
    internalTitle: f.internalTitle.trim(),
    publicTitle: f.publicTitle.trim(),
    department: f.department.trim(),
    employmentType: orNull(f.employmentType),
    workMode: orNull(f.workMode),
    location: f.location.trim(),
    addressLocality: orNull(f.addressLocality),
    addressCountry: orNull(f.addressCountry.toUpperCase()),
    sponsorshipPolicy: orNull(f.sponsorshipPolicy),
    relocationPolicy: orNull(f.relocationPolicy),
    salary: {
      confidential: f.salaryConfidential,
      currency: orNull(f.salaryCurrency.toUpperCase()),
      min: intOrNull(f.salaryMin),
      max: intOrNull(f.salaryMax),
    },
    internalBrief: orNull(f.internalBrief),
    evidenceRequirements: lines(f.evidenceRequirements),
    criteria: {
      mustHave: f.mustHave.filter((c) => c.label.trim()).map(criterionPayload),
      niceToHave: f.niceToHave.filter((c) => c.label.trim()).map(criterionPayload),
      disqualifiers: f.disqualifiers.filter((c) => c.label.trim()).map(criterionPayload),
    },
    interviewKit: f.stages.map((s) => ({
      code: s.code,
      kind: s.kind,
      label: s.label.trim(),
      ownerRole: s.ownerRole,
      slaDays: s.slaDays,
      durationMinutes: s.durationMinutes,
      questions: lines(s.questions),
      rubric: s.rubric,
      ...(s.policyGated !== undefined ? { policyGated: s.policyGated } : {}),
    })),
    hiringOwnerMemberId: orNull(f.hiringOwnerMemberId),
    approvalOwnerRole: orNull(f.approvalOwnerRole),
    decisionSlaDays: intOrNull(f.decisionSlaDays),
    closingDate: f.closingDate ? new Date(`${f.closingDate}T23:59:59Z`).toISOString() : null,
    roleProfileCode: orNull(f.roleProfileCode),
    copy: { en: copy("en"), fa: copy("fa"), ...(f.copy.de.title.trim() ? { de: copy("de") } : {}) },
  };
  // In an edit, switching a section OFF clears what is stored (null); in a
  // create, "off" simply sends nothing.
  if (f.rubricEnabled) body.scoringRubric = { weights: f.rubric };
  else if (mode === "edit") body.scoringRubric = null;
  if (!f.assessmentEnabled && mode === "edit") body.assessment = null;
  if (f.assessmentEnabled) {
    body.assessment = {
      title: f.assessment.title.trim(),
      format: f.assessment.format,
      durationMinutes: f.assessment.durationMinutes,
      evaluates: lines(f.assessment.evaluates),
      submission: f.assessment.submission.trim(),
    };
  }
  if (mode === "create") {
    if (f.requisitionKey.trim()) body.requisitionKey = f.requisitionKey.trim();
  } else {
    body.expectedVersion = version;
  }
  return body;
}

interface DetailResponse {
  position: {
    requisitionKey: string | null;
    internalTitle: string | null;
    publicTitle: string;
    department: string;
    employmentType: string | null;
    workMode: string | null;
    location: string;
    addressLocality: string | null;
    addressCountry: string | null;
    sponsorshipPolicy: string | null;
    relocationPolicy: string | null;
    salary: { confidential: boolean; currency: string | null; min: number | null; max: number | null };
    internalBrief: string | null;
    evidenceRequirements: unknown;
    scoringRubric: unknown;
    interviewKit: unknown;
    assessment: unknown;
    roleProfileCode: string | null;
    approvalOwnerRole: string | null;
    decisionSlaDays: number | null;
    hiringOwnerMemberId: string | null;
    closingDate: string | null;
    copy: Record<
      PositionLocale,
      { title: string; summary: string; description: string; responsibilities: string[]; requirements: string[]; preferredExperience: string[] } | null
    >;
    criteria: { code: string; kind: string; label: string; dimension: string; weight: number; keywords: unknown; minYears: number | null; hardGate: boolean }[];
    actions: { canEdit: boolean };
    version: number;
  };
}

function fromDetail(p: DetailResponse["position"]): FormState {
  const f = emptyForm();
  const crit = (kind: string) =>
    p.criteria
      .filter((c) => c.kind === kind)
      .map((c) => ({
        code: c.code,
        label: c.label,
        dimension: ((DIMENSIONS as readonly string[]).includes(c.dimension) ? c.dimension : "skill") as Dimension,
        weight: c.weight,
        keywords: Array.isArray(c.keywords) ? c.keywords.filter((k) => typeof k === "string").join(", ") : "",
        minYears: c.minYears == null ? "" : String(c.minYears),
        hardGate: c.hardGate,
      }));
  const rubric = (p.scoringRubric as { weights?: Record<string, number> } | null)?.weights;
  const assessment = p.assessment as FormState["assessment"] & { evaluates?: string[] } | null;
  return {
    ...f,
    requisitionKey: p.requisitionKey ?? "",
    internalTitle: p.internalTitle ?? "",
    publicTitle: p.publicTitle,
    department: p.department,
    employmentType: p.employmentType ?? "",
    workMode: p.workMode ?? "",
    location: p.location,
    addressLocality: p.addressLocality ?? "",
    addressCountry: p.addressCountry ?? "",
    sponsorshipPolicy: p.sponsorshipPolicy ?? "",
    relocationPolicy: p.relocationPolicy ?? "",
    salaryConfidential: p.salary.confidential,
    salaryCurrency: p.salary.currency ?? "",
    salaryMin: p.salary.min == null ? "" : String(p.salary.min),
    salaryMax: p.salary.max == null ? "" : String(p.salary.max),
    internalBrief: p.internalBrief ?? "",
    evidenceRequirements: joinLines(p.evidenceRequirements),
    copy: {
      en: p.copy.en
        ? {
            ...p.copy.en,
            responsibilities: joinLines(p.copy.en.responsibilities),
            requirements: joinLines(p.copy.en.requirements),
            preferredExperience: joinLines(p.copy.en.preferredExperience),
          }
        : emptyCopy(),
      fa: p.copy.fa
        ? {
            ...p.copy.fa,
            responsibilities: joinLines(p.copy.fa.responsibilities),
            requirements: joinLines(p.copy.fa.requirements),
            preferredExperience: joinLines(p.copy.fa.preferredExperience),
          }
        : emptyCopy(),
      de: p.copy.de
        ? {
            ...p.copy.de,
            responsibilities: joinLines(p.copy.de.responsibilities),
            requirements: joinLines(p.copy.de.requirements),
            preferredExperience: joinLines(p.copy.de.preferredExperience),
          }
        : emptyCopy(),
    },
    mustHave: crit("MUST_HAVE"),
    niceToHave: crit("NICE_TO_HAVE"),
    disqualifiers: crit("DISQUALIFIER"),
    rubricEnabled: !!rubric,
    rubric: rubric ? ({ ...zeroRubric(), ...rubric } as Record<Dimension, number>) : zeroRubric(),
    stages: Array.isArray(p.interviewKit)
      ? (p.interviewKit as (StageDraft & { questions: string[] })[]).map((s) => ({ ...s, questions: joinLines(s.questions), rubric: s.rubric ?? [] }))
      : [],
    assessmentEnabled: !!assessment,
    assessment: assessment
      ? { title: assessment.title, format: assessment.format, durationMinutes: assessment.durationMinutes, evaluates: joinLines(assessment.evaluates), submission: assessment.submission }
      : f.assessment,
    hiringOwnerMemberId: p.hiringOwnerMemberId ?? "",
    approvalOwnerRole: p.approvalOwnerRole ?? "",
    decisionSlaDays: p.decisionSlaDays == null ? "" : String(p.decisionSlaDays),
    closingDate: p.closingDate ? p.closingDate.slice(0, 10) : "",
    roleProfileCode: p.roleProfileCode ?? "",
  };
}

function applyTemplate(f: FormState, code: RoleCode): FormState {
  const p = ROLE_PROFILES[code];
  const crit = (kind: string) =>
    p.criteria
      .filter((c) => c.kind === kind)
      .map((c) => ({
        code: qualifiedCriterionCode(p.code, c.code),
        label: c.label,
        dimension: c.dimension,
        weight: c.weight,
        keywords: c.keywords.join(", "),
        minYears: c.minYears == null ? "" : String(c.minYears),
        hardGate: c.hardGate,
      }));
  return {
    ...f,
    roleProfileCode: p.code,
    department: f.department || p.department,
    mustHave: crit("MUST_HAVE"),
    niceToHave: crit("NICE_TO_HAVE"),
    disqualifiers: crit("DISQUALIFIER"),
    rubricEnabled: true,
    rubric: { ...zeroRubric(), ...p.weights },
    stages: p.interviewKit.map((s) => ({
      code: s.code,
      kind: s.kind,
      label: s.label,
      ownerRole: (INTERVIEW_OWNER_ROLES as readonly string[]).includes(s.ownerRole) ? (s.ownerRole as StageDraft["ownerRole"]) : "HR_MANAGER",
      slaDays: s.slaDays,
      durationMinutes: s.durationMinutes,
      questions: s.questions.join("\n"),
      rubric: s.rubric.map((r) => ({ item: r.item, anchors: { ...r.anchors } })),
      ...(s.policyGated !== undefined ? { policyGated: s.policyGated } : {}),
    })),
    assessmentEnabled: true,
    assessment: {
      title: p.assessment.title,
      format: p.assessment.format,
      durationMinutes: p.assessment.durationMinutes,
      evaluates: p.assessment.evaluates.join("\n"),
      submission: p.assessment.submission,
    },
    approvalOwnerRole: p.approvalOwnerRole,
    decisionSlaDays: String(p.decisionSlaDays),
  };
}

// ── Small field helpers ──────────────────────────────────────────────────────

function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="kpi-label">
        {label}
        {required ? <span className="text-rose-300"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-sm border border-border-default bg-surface-interactive px-2 text-body text-text-primary"
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-body text-sm font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function PositionEditorClient({ mode, positionId }: { mode: "create" | "edit"; positionId?: string }) {
  const t = useTranslations("ats.mgmt");
  const tf = useTranslations("ats.mgmt.form");
  const router = useRouter();
  const refusal = useRefusalMessage();
  const { toasts, push, dismiss } = useToasts();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [version, setVersion] = useState(0);
  const [load, setLoad] = useState<"loading" | "ready" | "denied" | "notFound" | "error">(mode === "edit" ? "loading" : "ready");
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [protectedTerms, setProtectedTerms] = useState<string[]>([]);
  const [owners, setOwners] = useState<{ memberId: string; role: string; name: string | null }[] | null>(null);

  useEffect(() => {
    atsRead<{ owners: { memberId: string; role: string; name: string | null }[] }>("/api/ats/jobs/owners").then((r) => {
      setOwners(r.ok && r.data ? r.data.owners : null);
    });
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !positionId) return;
    atsRead<DetailResponse>(`/api/ats/jobs/${encodeURIComponent(positionId)}`).then((r) => {
      if (r.status === 401 || r.status === 403) return setLoad("denied");
      if (r.status === 404) return setLoad("notFound");
      if (!r.ok || !r.data) return setLoad("error");
      if (!r.data.position.actions.canEdit) return setLoad("denied");
      setForm(fromDetail(r.data.position));
      setVersion(r.data.position.version);
      setLoad("ready");
    });
  }, [mode, positionId]);

  const rubricTotal = useMemo(() => Object.values(form.rubric).reduce((a, b) => a + (Number(b) || 0), 0), [form.rubric]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setCopy = (locale: PositionLocale, key: keyof CopyDraft, value: string) =>
    setForm((f) => ({ ...f, copy: { ...f.copy, [locale]: { ...f.copy[locale], [key]: value } } }));

  const save = async () => {
    setSaving(true);
    setIssues([]);
    setProtectedTerms([]);
    const body = toPayload(form, mode, version);
    const res =
      mode === "create"
        ? await atsMutate<{ jobId: string }>("/api/ats/jobs", "POST", body)
        : await atsMutate<{ jobId: string; version: number }>(`/api/ats/jobs/${encodeURIComponent(positionId ?? "")}`, "PATCH", body);
    setSaving(false);
    if (res.ok && res.data) {
      push({ kind: "success", message: mode === "create" ? tf("created") : tf("saved"), correlationId: res.correlationId });
      router.push(`/dashboard/ats/jobs/${res.data.jobId}`);
      return;
    }
    const detail = res.detail ?? {};
    if (Array.isArray(detail.issues)) setIssues(detail.issues as { path: string; message: string }[]);
    if (Array.isArray(detail.protectedTerms)) setProtectedTerms(detail.protectedTerms as string[]);
    const missing = Array.isArray(detail.missing) ? (detail.missing as string[]) : [];
    push({
      kind: "error",
      message: missing.length ? `${refusal(res)} ${missing.map((m) => t(`readiness.${m}`)).join(" · ")}` : refusal(res),
      correlationId: res.correlationId,
    });
  };

  if (load === "loading") return <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" aria-busy="true" />;
  if (load === "denied")
    return (
      <Alert variant="warning" title={t("permission.title")}>
        {t("permission.manageRequired")}
      </Alert>
    );
  if (load === "notFound")
    return (
      <Alert variant="warning" title={t("errors.NOT_FOUND")}>
        <Link href="/dashboard/ats/jobs" className="underline">
          {t("actions.BACK")}
        </Link>
      </Alert>
    );
  if (load === "error")
    return (
      <Alert variant="danger" title={t("states.errorTitle")}>
        {t("errors.GENERIC")}
      </Alert>
    );

  const dimensionOptions = DIMENSIONS.map((d) => ({ value: d, label: tf(`dimension.${d}`) }));

  const criteriaEditor = (group: "mustHave" | "niceToHave" | "disqualifiers") => (
    <div className="md:col-span-2 flex flex-col gap-2">
      <p className="kpi-label">{tf(`criteria.${group}`)}</p>
      {form[group].map((c, i) => (
        <div key={`${group}-${i}`} className="grid grid-cols-1 gap-2 rounded-lg border border-line p-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <Input aria-label={tf("criteria.label")} placeholder={tf("criteria.label")} value={c.label} onChange={(e) => set(group, form[group].map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          </div>
          <div className="md:col-span-2">
            <Select value={c.dimension} onChange={(v) => set(group, form[group].map((x, j) => (j === i ? { ...x, dimension: v as Dimension } : x)))} options={dimensionOptions} />
          </div>
          <div className="md:col-span-3">
            <Input aria-label={tf("criteria.keywords")} placeholder={tf("criteria.keywords")} value={c.keywords} onChange={(e) => set(group, form[group].map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))} />
          </div>
          <div className="md:col-span-1">
            <Input aria-label={tf("criteria.minYears")} placeholder={tf("criteria.minYears")} inputMode="numeric" value={c.minYears} onChange={(e) => set(group, form[group].map((x, j) => (j === i ? { ...x, minYears: e.target.value } : x)))} />
          </div>
          <div className="md:col-span-1">
            <Input aria-label={tf("criteria.weight")} placeholder={tf("criteria.weight")} inputMode="numeric" value={String(c.weight)} onChange={(e) => set(group, form[group].map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) || 0 } : x)))} />
          </div>
          <div className="md:col-span-1 flex items-center justify-end">
            <Button size="sm" variant="tertiary" onClick={() => set(group, form[group].filter((_, j) => j !== i))} aria-label={tf("remove")}>
              ×
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button size="sm" variant="secondary" onClick={() => set(group, [...form[group], { label: "", dimension: "skill", weight: 0, keywords: "", minYears: "", hardGate: group === "disqualifiers" }])}>
          {tf("criteria.add")}
        </Button>
      </div>
    </div>
  );

  const copyEditor = (locale: PositionLocale) => (
    <div className="md:col-span-2 grid grid-cols-1 gap-3 rounded-lg border border-line p-4 md:grid-cols-2" dir={locale === "fa" ? "rtl" : "ltr"} lang={locale}>
      <p className="md:col-span-2 kpi-label">{tf(`copy.locale.${locale}`)}</p>
      <Field label={tf("copy.title")} required={locale !== "de"}>
        <Input value={form.copy[locale].title} onChange={(e) => setCopy(locale, "title", e.target.value)} maxLength={200} />
      </Field>
      <Field label={tf("copy.summary")}>
        <Input value={form.copy[locale].summary} onChange={(e) => setCopy(locale, "summary", e.target.value)} maxLength={500} />
      </Field>
      <div className="md:col-span-2">
        <Field label={tf("copy.description")}>
          <Textarea value={form.copy[locale].description} onChange={(e) => setCopy(locale, "description", e.target.value)} rows={5} />
        </Field>
      </div>
      <Field label={tf("copy.responsibilities")} hint={tf("onePerLine")}>
        <Textarea value={form.copy[locale].responsibilities} onChange={(e) => setCopy(locale, "responsibilities", e.target.value)} rows={4} />
      </Field>
      <Field label={tf("copy.requirements")} hint={tf("onePerLine")}>
        <Textarea value={form.copy[locale].requirements} onChange={(e) => setCopy(locale, "requirements", e.target.value)} rows={4} />
      </Field>
      <div className="md:col-span-2">
        <Field label={tf("copy.preferredExperience")} hint={tf("onePerLine")}>
          <Textarea value={form.copy[locale].preferredExperience} onChange={(e) => setCopy(locale, "preferredExperience", e.target.value)} rows={3} />
        </Field>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-section-title text-ink">{mode === "create" ? tf("createTitle") : tf("editTitle")}</h2>
        <div className="flex gap-2">
          <Link href={mode === "edit" && positionId ? `/dashboard/ats/jobs/${positionId}` : "/dashboard/ats/jobs"} className={buttonVariants("secondary", "sm")}>
            {t("feedback.cancel")}
          </Link>
          <Button size="sm" loading={saving} onClick={save}>
            {mode === "create" ? tf("saveDraft") : tf("save")}
          </Button>
        </div>
      </div>

      <Alert variant="information">{mode === "create" ? tf("draftNotice") : tf("editNotice")}</Alert>

      {issues.length > 0 ? (
        <Alert variant="danger" title={tf("issuesTitle")}>
          <ul className="list-disc ps-5 text-xs">
            {issues.map((i, n) => (
              <li key={n}>
                <span dir="ltr" className="font-mono">{i.path || "—"}</span>: {i.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {protectedTerms.length > 0 ? (
        <Alert variant="danger" title={t("errors.PROTECTED_TERM")}>
          {tf("protectedTerms", { terms: protectedTerms.join(", ") })}
        </Alert>
      ) : null}

      <Section title={tf("template.title")} description={tf("template.description")}>
        <Field label={tf("template.select")}>
          <Select
            value=""
            placeholder={tf("template.placeholder")}
            onChange={(v) => v && setForm((f) => applyTemplate(f, v as RoleCode))}
            options={ROLE_CODES.map((c) => ({ value: c, label: tf(`template.roles.${c}`) }))}
          />
        </Field>
        {form.roleProfileCode ? <p className="self-end text-xs text-muted">{tf("template.applied", { role: tf(`template.roles.${form.roleProfileCode}`) })}</p> : null}
      </Section>

      <Section title={tf("sections.identity")}>
        <Field label={tf("internalTitle")} required hint={tf("internalTitleHint")}>
          <Input value={form.internalTitle} onChange={(e) => set("internalTitle", e.target.value)} maxLength={200} />
        </Field>
        <Field label={tf("publicTitle")} required>
          <Input value={form.publicTitle} onChange={(e) => set("publicTitle", e.target.value)} maxLength={200} />
        </Field>
        {mode === "create" ? (
          <Field label={tf("requisitionKey")} hint={tf("requisitionKeyHint")}>
            <Input dir="ltr" value={form.requisitionKey} onChange={(e) => set("requisitionKey", e.target.value)} maxLength={120} />
          </Field>
        ) : (
          <Field label={tf("requisitionKey")}>
            <Input dir="ltr" value={form.requisitionKey} disabled readOnly />
          </Field>
        )}
        <Field label={tf("department")} required>
          <Input value={form.department} onChange={(e) => set("department", e.target.value)} maxLength={120} />
        </Field>
        <Field label={tf("employmentType")}>
          <Select value={form.employmentType} onChange={(v) => set("employmentType", v)} placeholder={tf("notSet")} options={EMPLOYMENT_TYPES.map((v) => ({ value: v, label: tf(`employment.${v}`) }))} />
        </Field>
        <Field label={tf("workMode")}>
          <Select value={form.workMode} onChange={(v) => set("workMode", v)} placeholder={tf("notSet")} options={WORK_MODES.map((v) => ({ value: v, label: tf(`workModes.${v}`) }))} />
        </Field>
        <Field label={tf("location")} required>
          <Input value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={200} />
        </Field>
        <Field label={tf("addressCountry")} hint={tf("addressCountryHint")}>
          <Input dir="ltr" value={form.addressCountry} onChange={(e) => set("addressCountry", e.target.value)} maxLength={2} />
        </Field>
      </Section>

      <Section title={tf("sections.copy")} description={tf("copyDescription")}>
        {copyEditor("fa")}
        {copyEditor("en")}
        {copyEditor("de")}
      </Section>

      <Section title={tf("sections.compensation")}>
        <div className="md:col-span-2 flex items-center gap-3">
          <Switch checked={form.salaryConfidential} onCheckedChange={(v) => set("salaryConfidential", v)} aria-label={tf("salaryConfidential")} />
          <span className="text-sm text-ink">{tf("salaryConfidential")}</span>
        </div>
        <Field label={tf("salaryCurrency")} hint={tf("salaryCurrencyHint")}>
          <Input dir="ltr" value={form.salaryCurrency} onChange={(e) => set("salaryCurrency", e.target.value)} maxLength={3} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tf("salaryMin")}>
            <Input dir="ltr" inputMode="numeric" value={form.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} />
          </Field>
          <Field label={tf("salaryMax")}>
            <Input dir="ltr" inputMode="numeric" value={form.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} />
          </Field>
        </div>
        <Field label={tf("sponsorshipPolicy")}>
          <Select value={form.sponsorshipPolicy} onChange={(v) => set("sponsorshipPolicy", v)} placeholder={tf("notSet")} options={MOBILITY_POLICIES.map((v) => ({ value: v, label: tf(`mobility.${v}`) }))} />
        </Field>
        <Field label={tf("relocationPolicy")}>
          <Select value={form.relocationPolicy} onChange={(v) => set("relocationPolicy", v)} placeholder={tf("notSet")} options={MOBILITY_POLICIES.map((v) => ({ value: v, label: tf(`mobility.${v}`) }))} />
        </Field>
      </Section>

      <Section title={tf("sections.internal")} description={tf("internalDescription")}>
        <div className="md:col-span-2">
          <Field label={tf("internalBrief")}>
            <Textarea value={form.internalBrief} onChange={(e) => set("internalBrief", e.target.value)} rows={4} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label={tf("evidenceRequirements")} hint={tf("onePerLine")}>
            <Textarea value={form.evidenceRequirements} onChange={(e) => set("evidenceRequirements", e.target.value)} rows={3} />
          </Field>
        </div>
      </Section>

      <Section title={tf("sections.criteria")} description={tf("criteriaDescription")}>
        {criteriaEditor("mustHave")}
        {criteriaEditor("niceToHave")}
        {criteriaEditor("disqualifiers")}
      </Section>

      <Section title={tf("sections.rubric")} description={tf("rubricDescription")}>
        <div className="md:col-span-2 flex items-center gap-3">
          <Switch checked={form.rubricEnabled} onCheckedChange={(v) => set("rubricEnabled", v)} aria-label={tf("rubricEnabled")} />
          <span className="text-sm text-ink">{tf("rubricEnabled")}</span>
          <span className={`ms-auto hs-badge ${rubricTotal === 100 ? "hs--reasoning" : "hs--risk"}`}>{tf("rubricTotal", { total: rubricTotal })}</span>
        </div>
        {form.rubricEnabled
          ? DIMENSIONS.map((d) => (
              <Field key={d} label={tf(`dimension.${d}`)}>
                <Input dir="ltr" inputMode="numeric" value={String(form.rubric[d])} onChange={(e) => set("rubric", { ...form.rubric, [d]: Number(e.target.value) || 0 })} />
              </Field>
            ))
          : null}
      </Section>

      <Section title={tf("sections.interviewKit")} description={tf("interviewKitDescription")}>
        {form.stages.map((s, i) => (
          <div key={`${s.code}-${i}`} className="md:col-span-2 grid grid-cols-1 gap-2 rounded-lg border border-line p-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Field label={tf("stage.label")}>
                <Input value={s.label} onChange={(e) => set("stages", form.stages.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              </Field>
            </div>
            <Field label={tf("stage.kind")}>
              <Select value={s.kind} onChange={(v) => set("stages", form.stages.map((x, j) => (j === i ? { ...x, kind: v as StageDraft["kind"] } : x)))} options={INTERVIEW_STAGE_KINDS.map((k) => ({ value: k, label: tf(`stageKinds.${k}`) }))} />
            </Field>
            <Field label={tf("stage.owner")}>
              <Select value={s.ownerRole} onChange={(v) => set("stages", form.stages.map((x, j) => (j === i ? { ...x, ownerRole: v as StageDraft["ownerRole"] } : x)))} options={INTERVIEW_OWNER_ROLES.map((r) => ({ value: r, label: tf(`roles.${r}`) }))} />
            </Field>
            <Field label={tf("stage.slaDays")}>
              <Input dir="ltr" inputMode="numeric" value={String(s.slaDays)} onChange={(e) => set("stages", form.stages.map((x, j) => (j === i ? { ...x, slaDays: Number(e.target.value) || 1 } : x)))} />
            </Field>
            <Field label={tf("stage.duration")}>
              <Input dir="ltr" inputMode="numeric" value={String(s.durationMinutes)} onChange={(e) => set("stages", form.stages.map((x, j) => (j === i ? { ...x, durationMinutes: Number(e.target.value) || 30 } : x)))} />
            </Field>
            <div className="md:col-span-5">
              <Field label={tf("stage.questions")} hint={tf("onePerLine")}>
                <Textarea value={s.questions} onChange={(e) => set("stages", form.stages.map((x, j) => (j === i ? { ...x, questions: e.target.value } : x)))} rows={3} />
              </Field>
            </div>
            <div className="flex flex-col items-end justify-between gap-2">
              <span className="text-xs text-muted">{tf("stage.rubricItems", { count: s.rubric.length })}</span>
              <Button size="sm" variant="tertiary" onClick={() => set("stages", form.stages.filter((_, j) => j !== i))}>
                {tf("remove")}
              </Button>
            </div>
          </div>
        ))}
        <div className="md:col-span-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              set("stages", [
                ...form.stages,
                { code: `stage-${form.stages.length + 1}`, kind: "RECRUITER_SCREEN", label: "", ownerRole: "RECRUITER", slaDays: 5, durationMinutes: 45, questions: "", rubric: [] },
              ])
            }
          >
            {tf("stage.add")}
          </Button>
        </div>
      </Section>

      <Section title={tf("sections.assessment")}>
        <div className="md:col-span-2 flex items-center gap-3">
          <Switch checked={form.assessmentEnabled} onCheckedChange={(v) => set("assessmentEnabled", v)} aria-label={tf("assessmentEnabled")} />
          <span className="text-sm text-ink">{tf("assessmentEnabled")}</span>
        </div>
        {form.assessmentEnabled ? (
          <>
            <Field label={tf("assessment.title")}>
              <Input value={form.assessment.title} onChange={(e) => set("assessment", { ...form.assessment, title: e.target.value })} />
            </Field>
            <Field label={tf("assessment.format")}>
              <Select value={form.assessment.format} onChange={(v) => set("assessment", { ...form.assessment, format: v as FormState["assessment"]["format"] })} options={ASSESSMENT_FORMATS.map((a) => ({ value: a, label: tf(`assessmentFormats.${a}`) }))} />
            </Field>
            <Field label={tf("assessment.duration")}>
              <Input dir="ltr" inputMode="numeric" value={String(form.assessment.durationMinutes)} onChange={(e) => set("assessment", { ...form.assessment, durationMinutes: Number(e.target.value) || 60 })} />
            </Field>
            <Field label={tf("assessment.evaluates")} hint={tf("onePerLine")}>
              <Textarea value={form.assessment.evaluates} onChange={(e) => set("assessment", { ...form.assessment, evaluates: e.target.value })} rows={3} />
            </Field>
            <div className="md:col-span-2">
              <Field label={tf("assessment.submission")}>
                <Textarea value={form.assessment.submission} onChange={(e) => set("assessment", { ...form.assessment, submission: e.target.value })} rows={2} />
              </Field>
            </div>
          </>
        ) : null}
      </Section>

      <Section title={tf("sections.ownership")} description={tf("ownershipDescription")}>
        <Field label={tf("hiringOwner")} hint={owners === null ? tf("hiringOwnerUnavailable") : undefined}>
          <Select
            value={form.hiringOwnerMemberId}
            onChange={(v) => set("hiringOwnerMemberId", v)}
            placeholder={tf("notSet")}
            options={(owners ?? []).map((o) => ({ value: o.memberId, label: `${o.name ?? o.memberId} · ${tf(`roles.${o.role}`)}` }))}
          />
        </Field>
        <Field label={tf("approvalOwner")}>
          <Select value={form.approvalOwnerRole} onChange={(v) => set("approvalOwnerRole", v)} placeholder={tf("notSet")} options={APPROVAL_OWNER_ROLES.map((r) => ({ value: r, label: tf(`roles.${r}`) }))} />
        </Field>
        <Field label={tf("decisionSla")} hint={tf("decisionSlaHint")}>
          <Input dir="ltr" inputMode="numeric" value={form.decisionSlaDays} onChange={(e) => set("decisionSlaDays", e.target.value)} />
        </Field>
        <Field label={tf("closingDate")}>
          <Input dir="ltr" type="date" value={form.closingDate} onChange={(e) => set("closingDate", e.target.value)} />
        </Field>
      </Section>

      <div className="flex justify-end gap-2">
        <Button loading={saving} onClick={save}>
          {mode === "create" ? tf("saveDraft") : tf("save")}
        </Button>
      </div>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
