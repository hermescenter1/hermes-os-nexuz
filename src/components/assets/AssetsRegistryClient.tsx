"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { enumLabel } from "@/lib/i18n/enum-label";
import { withTenantPrecondition } from "@/lib/client/resource-request";
import type { AssetLocation, AssetRegistrySite, RegistryAssetRecord } from "@/lib/assets/types";

const TYPE_OPTS = ["ALL","PRODUCTION_LINE","MACHINE","PLC","HMI","SCADA_NODE","ELECTRICAL_PANEL","MCC_PANEL","VFD","MOTOR","PUMP","VALVE","SENSOR","INSTRUMENT","ROBOT","CONVEYOR","COMPRESSOR","UTILITY_SYSTEM","SAFETY_SYSTEM","NETWORK_DEVICE","INDUSTRIAL_PC"] as const;
const STATUS_OPTS = ["ALL","IN_SERVICE","DEGRADED","UNDER_MAINTENANCE","STANDBY","PLANNED","COMMISSIONED","RETIRED","REPLACED","DECOMMISSIONED"] as const;
const CRIT_OPTS = ["ALL","CRITICAL","HIGH","MEDIUM","LOW","NON_CRITICAL"] as const;
const LIFECYCLE_OPTS = ["DESIGN","PROCUREMENT","INSTALLATION","COMMISSIONING","IN_SERVICE","DEGRADED","DECOMMISSIONING","RETIRED"] as const;
const RISK_OPTS = ["HEALTHY","MONITOR","AT_RISK","CRITICAL","UNKNOWN"] as const;

function riskBadge(value: string) {
  if (value === "HEALTHY") return "bg-signal/[0.08] text-signal";
  if (value === "MONITOR") return "bg-ice/[0.08] text-ice";
  if (value === "AT_RISK") return "bg-warn/[0.10] text-warn";
  if (value === "CRITICAL") return "bg-danger/[0.10] text-danger";
  return "bg-surface2 text-metadata";
}

function critBadge(value: string) {
  if (value === "CRITICAL") return "bg-danger/[0.10] text-danger";
  if (value === "HIGH") return "bg-warn/[0.10] text-warn";
  if (value === "MEDIUM") return "bg-ice/[0.08] text-ice";
  if (value === "LOW") return "bg-signal/[0.08] text-signal";
  return "bg-surface2 text-metadata";
}

function statusBadge(value: string) {
  if (value === "IN_SERVICE") return "bg-signal/[0.08] text-signal";
  if (value === "DEGRADED") return "bg-warn/[0.10] text-warn";
  if (value === "UNDER_MAINTENANCE") return "bg-ice/[0.08] text-ice";
  return "bg-surface2 text-metadata";
}

function healthColor(value: number) {
  if (value >= 85) return "bg-signal";
  if (value >= 65) return "bg-ice";
  if (value >= 40) return "bg-warn";
  return "bg-danger";
}

interface Draft {
  assetNumber: string;
  name: string;
  nameEn: string;
  nameFa: string;
  description: string;
  assetType: string;
  status: string;
  criticality: string;
  riskState: string;
  lifecycleState: string;
  healthScore: string;
  siteId: string;
  locationId: string;
  parentAssetId: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  installationDate: string;
  commissionDate: string;
  warrantyExpiry: string;
  expectedLifeYears: string;
  tags: string;
  technicalSpecs: string;
}

const EMPTY_DRAFT: Draft = {
  assetNumber: "", name: "", nameEn: "", nameFa: "", description: "",
  assetType: "MACHINE", status: "IN_SERVICE", criticality: "MEDIUM",
  riskState: "HEALTHY", lifecycleState: "IN_SERVICE", healthScore: "100",
  siteId: "", locationId: "", parentAssetId: "", manufacturer: "", model: "",
  serialNumber: "", firmwareVersion: "", installationDate: "", commissionDate: "",
  warrantyExpiry: "", expectedLifeYears: "", tags: "", technicalSpecs: "{}",
};

function draftFor(asset: RegistryAssetRecord): Draft {
  const date = (value: string | null) => value ? value.slice(0, 10) : "";
  return {
    assetNumber: asset.assetNumber,
    name: asset.name,
    nameEn: asset.nameEn ?? "",
    nameFa: asset.nameFa ?? "",
    description: asset.description ?? "",
    assetType: asset.assetType,
    status: asset.status,
    criticality: asset.criticality,
    riskState: asset.riskState,
    lifecycleState: asset.lifecycleState,
    healthScore: String(asset.healthScore),
    siteId: asset.siteId ?? "",
    locationId: asset.locationId ?? "",
    parentAssetId: asset.parentAssetId ?? "",
    manufacturer: asset.manufacturer ?? "",
    model: asset.model ?? "",
    serialNumber: asset.serialNumber ?? "",
    firmwareVersion: asset.firmwareVersion ?? "",
    installationDate: date(asset.installationDate),
    commissionDate: date(asset.commissionDate),
    warrantyExpiry: date(asset.warrantyExpiry),
    expectedLifeYears: asset.expectedLifeYears === null ? "" : String(asset.expectedLifeYears),
    tags: asset.tags.join(", "),
    technicalSpecs: JSON.stringify(asset.technicalSpecs ?? {}, null, 2),
  };
}

interface Props {
  assets: RegistryAssetRecord[];
  locations: AssetLocation[];
  sites: AssetRegistrySite[];
}

export function AssetsRegistryClient({ assets, locations, sites }: Props) {
  const t = useTranslations("assetOperations");
  const tAm = useTranslations("assetMaintenance");
  const locale = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState(assets);
  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("ALL");
  const [statF, setStatF] = useState("ALL");
  const [critF, setCritF] = useState("ALL");
  const [editing, setEditing] = useState<RegistryAssetRecord | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const typeLabel = (value: string) => t.has(`enums.typeCompact.${value}`) ? t(`enums.typeCompact.${value}`) : value;
  const riskLabel = (value: string) => {
    const key = value === "AT_RISK" ? "atRisk" : value.toLocaleLowerCase().replace("_", "");
    return t(`dashboard.${key}`);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return rows.filter(asset => {
      if (typeF !== "ALL" && asset.assetType !== typeF) return false;
      if (statF !== "ALL" && asset.status !== statF) return false;
      if (critF !== "ALL" && asset.criticality !== critF) return false;
      if (query && ![
        asset.name, asset.nameEn, asset.nameFa, asset.assetNumber,
        asset.description, asset.manufacturer, asset.model, asset.serialNumber,
      ].some(value => value?.toLocaleLowerCase(locale).includes(query))) return false;
      return true;
    });
  }, [critF, locale, rows, search, statF, typeF]);

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT });
    setFormError(null);
  };

  const openEdit = (asset: RegistryAssetRecord) => {
    setEditing(asset);
    setDraft(draftFor(asset));
    setFormError(null);
  };

  const closeForm = () => {
    if (submitting) return;
    setEditing(undefined);
    setFormError(null);
  };

  const change = (field: keyof Draft, value: string) =>
    setDraft(current => ({ ...current, [field]: value }));

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    setNotice(null);

    let technicalSpecs: Record<string, unknown>;
    try {
      const parsed = JSON.parse(draft.technicalSpecs || "{}");
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("object required");
      technicalSpecs = parsed as Record<string, unknown>;
    } catch {
      setFormError(t("form.invalidTechnicalSpecs"));
      setSubmitting(false);
      return;
    }

    const nullable = (value: string) => value.trim() || null;
    const body = {
      assetNumber: draft.assetNumber.trim(),
      name: draft.name.trim(),
      nameEn: nullable(draft.nameEn),
      nameFa: nullable(draft.nameFa),
      description: nullable(draft.description),
      assetType: draft.assetType,
      status: draft.status,
      criticality: draft.criticality,
      riskState: draft.riskState,
      lifecycleState: draft.lifecycleState,
      healthScore: Number(draft.healthScore),
      siteId: nullable(draft.siteId),
      locationId: nullable(draft.locationId),
      parentAssetId: nullable(draft.parentAssetId),
      manufacturer: nullable(draft.manufacturer),
      model: nullable(draft.model),
      serialNumber: nullable(draft.serialNumber),
      firmwareVersion: nullable(draft.firmwareVersion),
      installationDate: nullable(draft.installationDate),
      commissionDate: nullable(draft.commissionDate),
      warrantyExpiry: nullable(draft.warrantyExpiry),
      expectedLifeYears: draft.expectedLifeYears ? Number(draft.expectedLifeYears) : null,
      tags: draft.tags.split(",").map(value => value.trim()).filter(Boolean),
      technicalSpecs,
    };

    const url = editing ? `/api/assets/${encodeURIComponent(editing.id)}` : "/api/assets";
    try {
      const response = await fetch(url, withTenantPrecondition({
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }));
      const result = await response.json().catch(() => ({})) as { asset?: RegistryAssetRecord; code?: string };
      if (!response.ok || !result.asset) {
        setFormError(result.code === "ASSET_NUMBER_CONFLICT" ? t("form.duplicateNumber") : t("form.saveFailed"));
        return;
      }

      setRows(current => editing
        ? current.map(asset => asset.id === result.asset?.id ? result.asset as RegistryAssetRecord : asset)
        : [result.asset as RegistryAssetRecord, ...current]);
      setNotice(editing ? t("form.updated") : t("form.created"));
      setEditing(undefined);
      router.refresh();
    } catch {
      setFormError(t("form.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  const selectCls = "bg-surface border border-line text-sm text-muted rounded-lg px-3 py-2 focus:outline-none focus:border-ice/50";
  const inputCls = "w-full bg-surface border border-line text-sm text-ink rounded-lg px-3 py-2 focus:outline-none focus:border-ice/50";
  const labelCls = "block text-xs text-metadata mb-1.5";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow-mono text-ice mb-1">{t("registry.eyebrow")}</p>
          <h1 className="text-xl font-semibold text-ink">{t("registry.title")}</h1>
          <p className="text-sm text-muted mt-1">{filtered.length} {t("registry.assetsUnit")}</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-lg bg-ice px-4 py-2 text-sm font-semibold text-void transition-opacity hover:opacity-90">
          {t("form.createAction")}
        </button>
      </div>

      {notice && <div role="status" className="rounded-lg border border-signal/30 bg-signal/[0.08] px-4 py-3 text-sm text-signal">{notice}</div>}

      <div className="flex flex-wrap gap-3 items-center">
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} aria-label={t("registry.searchPh")} placeholder={t("registry.searchPh")} className={`${inputCls} w-56`} />
        <select aria-label={t("registry.allTypes")} value={typeF} onChange={event => setTypeF(event.target.value)} className={selectCls}>
          {TYPE_OPTS.map(value => <option key={value} value={value}>{value === "ALL" ? t("registry.allTypes") : typeLabel(value)}</option>)}
        </select>
        <select aria-label={t("registry.allStatus")} value={statF} onChange={event => setStatF(event.target.value)} className={selectCls}>
          {STATUS_OPTS.map(value => <option key={value} value={value}>{value === "ALL" ? t("registry.allStatus") : enumLabel(tAm, "assetStatus", value)}</option>)}
        </select>
        <select aria-label={t("registry.allCriticality")} value={critF} onChange={event => setCritF(event.target.value)} className={selectCls}>
          {CRIT_OPTS.map(value => <option key={value} value={value}>{value === "ALL" ? t("registry.allCriticality") : t(`enums.criticality.${value}`)}</option>)}
        </select>
      </div>

      <div className="card-surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2">
                {[t("registry.colNumber"), t("registry.colName"), t("registry.colType"), t("registry.colStatus"), t("registry.colCriticality"), t("registry.colHealth"), t("registry.colLocation"), ""].map((heading, index) => (
                  <th key={index} className="text-start px-4 py-3 text-xs font-medium text-metadata whitespace-nowrap">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-muted">{t("common.noAssetsFound")}</td></tr>}
              {filtered.map(asset => (
                <tr key={asset.id} className="border-b border-line/50 hover:bg-surface2/40 transition-colors">
                  <td className="px-4 py-3 text-ice font-mono text-xs whitespace-nowrap">{asset.assetNumber}</td>
                  <td className="px-4 py-3"><p className="font-medium text-ink whitespace-nowrap">{asset.name}</p>{asset.manufacturer && <p className="text-xs text-metadata">{asset.manufacturer}</p>}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{typeLabel(asset.assetType)}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(asset.status)}`}>{enumLabel(tAm, "assetStatus", asset.status)}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${critBadge(asset.criticality)}`}>{t(`enums.criticality.${asset.criticality}`)}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-[80px]"><div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden"><div className={`h-full rounded-full ${healthColor(asset.healthScore)}`} style={{ width: `${asset.healthScore}%` }} /></div><span className="text-xs text-muted tabular-nums w-8 text-end">{asset.healthScore}%</span></div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${riskBadge(asset.riskState)}`}>{riskLabel(asset.riskState)}</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{asset.location?.name ?? "—"}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-3 whitespace-nowrap"><Link href={`/${locale}/assets/${asset.id}`} className="text-xs text-ice hover:underline">{t("registry.details")}</Link><button type="button" onClick={() => openEdit(asset)} className="text-xs text-muted hover:text-ink">{t("form.editAction")}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="asset-form-title">
          <form className="my-6 w-full max-w-5xl rounded-2xl border border-line bg-surface shadow-2xl" onSubmit={event => { event.preventDefault(); void submit(); }}>
            <div className="flex items-start justify-between border-b border-line p-5">
              <div><p className="eyebrow-mono text-ice mb-1">{t("form.eyebrow")}</p><h2 id="asset-form-title" className="text-lg font-semibold text-ink">{editing ? t("form.editTitle") : t("form.createTitle")}</h2><p className="mt-1 text-sm text-muted">{t("form.subtitle")}</p></div>
              <button type="button" onClick={closeForm} aria-label={t("form.close")} className="rounded-lg px-3 py-1 text-xl text-muted hover:bg-surface2 hover:text-ink">×</button>
            </div>

            <div className="space-y-6 p-5">
              {formError && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/[0.08] px-4 py-3 text-sm text-danger">{formError}</div>}

              <section>
                <h3 className="mb-3 text-sm font-semibold text-ink">{t("form.identitySection")}</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label><span className={labelCls}>{t("form.assetNumber")} *</span><input required value={draft.assetNumber} onChange={event => change("assetNumber", event.target.value)} className={inputCls} /></label>
                  <label className="lg:col-span-2"><span className={labelCls}>{t("form.name")} *</span><input required value={draft.name} onChange={event => change("name", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("form.nameFa")}</span><input dir="rtl" value={draft.nameFa} onChange={event => change("nameFa", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("form.nameEn")}</span><input dir="ltr" value={draft.nameEn} onChange={event => change("nameEn", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("form.assetType")} *</span><select value={draft.assetType} onChange={event => change("assetType", event.target.value)} className={inputCls}>{TYPE_OPTS.filter(value => value !== "ALL").map(value => <option key={value} value={value}>{typeLabel(value)}</option>)}</select></label>
                  <label className="md:col-span-2 lg:col-span-3"><span className={labelCls}>{t("form.description")}</span><textarea rows={3} value={draft.description} onChange={event => change("description", event.target.value)} className={inputCls} /></label>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-ink">{t("form.classificationSection")}</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <label><span className={labelCls}>{t("form.status")}</span><select value={draft.status} onChange={event => change("status", event.target.value)} className={inputCls}>{STATUS_OPTS.filter(value => value !== "ALL").map(value => <option key={value} value={value}>{enumLabel(tAm, "assetStatus", value)}</option>)}</select></label>
                  <label><span className={labelCls}>{t("form.criticality")}</span><select value={draft.criticality} onChange={event => change("criticality", event.target.value)} className={inputCls}>{CRIT_OPTS.filter(value => value !== "ALL").map(value => <option key={value} value={value}>{t(`enums.criticality.${value}`)}</option>)}</select></label>
                  <label><span className={labelCls}>{t("form.lifecycle")}</span><select value={draft.lifecycleState} onChange={event => change("lifecycleState", event.target.value)} className={inputCls}>{LIFECYCLE_OPTS.map(value => <option key={value} value={value}>{enumLabel(tAm, "lifecycle", value)}</option>)}</select></label>
                  <label><span className={labelCls}>{t("form.healthScore")}</span><input type="number" min="0" max="100" value={draft.healthScore} onChange={event => change("healthScore", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("form.riskState")}</span><select value={draft.riskState} onChange={event => change("riskState", event.target.value)} className={inputCls}>{RISK_OPTS.map(value => <option key={value} value={value}>{riskLabel(value)}</option>)}</select></label>
                  <label><span className={labelCls}>{t("form.site")}</span><select value={draft.siteId} onChange={event => change("siteId", event.target.value)} className={inputCls}><option value="">{t("form.unassigned")}</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
                  <label><span className={labelCls}>{t("form.location")}</span><select value={draft.locationId} onChange={event => change("locationId", event.target.value)} className={inputCls}><option value="">{t("form.unassigned")}</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
                  <label><span className={labelCls}>{t("form.parentAsset")}</span><select value={draft.parentAssetId} onChange={event => change("parentAssetId", event.target.value)} className={inputCls}><option value="">{t("form.noParent")}</option>{rows.filter(asset => asset.id !== editing?.id).map(asset => <option key={asset.id} value={asset.id}>{asset.assetNumber} — {asset.name}</option>)}</select></label>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-ink">{t("form.technicalSection")}</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <label><span className={labelCls}>{t("detail.manufacturer")}</span><input value={draft.manufacturer} onChange={event => change("manufacturer", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("detail.model")}</span><input value={draft.model} onChange={event => change("model", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("detail.serialNumber")}</span><input value={draft.serialNumber} onChange={event => change("serialNumber", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("detail.firmware")}</span><input value={draft.firmwareVersion} onChange={event => change("firmwareVersion", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("detail.installationDate")}</span><input type="date" value={draft.installationDate} onChange={event => change("installationDate", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("detail.commissionDate")}</span><input type="date" value={draft.commissionDate} onChange={event => change("commissionDate", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("detail.warrantyExpiry")}</span><input type="date" value={draft.warrantyExpiry} onChange={event => change("warrantyExpiry", event.target.value)} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("detail.expectedLife")}</span><input type="number" min="1" max="200" value={draft.expectedLifeYears} onChange={event => change("expectedLifeYears", event.target.value)} className={inputCls} /></label>
                  <label className="md:col-span-2"><span className={labelCls}>{t("form.tags")}</span><input value={draft.tags} onChange={event => change("tags", event.target.value)} placeholder={t("form.tagsHint")} className={inputCls} /></label>
                  <label className="md:col-span-2"><span className={labelCls}>{t("form.technicalSpecs")}</span><textarea dir="ltr" rows={4} value={draft.technicalSpecs} onChange={event => change("technicalSpecs", event.target.value)} className={`${inputCls} font-mono text-xs`} /></label>
                </div>
              </section>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line p-5">
              <button type="button" onClick={closeForm} disabled={submitting} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink disabled:opacity-50">{t("form.cancel")}</button>
              <button type="submit" disabled={submitting || !draft.assetNumber.trim() || !draft.name.trim()} className="rounded-lg bg-ice px-5 py-2 text-sm font-semibold text-void hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? t("form.saving") : t("form.save")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
