# Persian Terminology Glossary — Hermes OS (PHASE 89)

Authoritative terminology for Persian (`fa`) localization. Internal document —
not exposed as a public route. Product names and protocol names are trademarks
or technical abbreviations and stay untranslated everywhere.

Phase 89 translated **352** genuine English carryover leaves in `messages/fa.json`
(namespaces `assetOperations`, `maintenanceOperations`, `adminOperations`,
`adminGovernance`, `journal`) into professional Persian. ICU placeholders,
protocol tokens, and markup were preserved verbatim.

## Product / protocol names — NEVER translated

| Term | Persian usage |
|---|---|
| Hermes OS | prose: «هرمس او‌اس»; ALL-CAPS eyebrow: «هرمس OS · …» (matches `industrialBrain.hero.eyebrow`) |
| Industrial Brain, Hermes Copilot, Hermes Academy | product names — unchanged / transliterated per existing catalog |
| PLC, HMI, SCADA, VFD, IPC, MCC, OPC UA, MQTT, Modbus TCP | protocols/abbreviations — unchanged |
| CMMS, ERP, CRM, ATS, EDMS, RBAC, SEO, GDPR, GA4, GTM, DOM, PWA | acronyms — unchanged |
| MTBF, MTTR, OEE, SKU, KPI(s) | reliability/enterprise metrics — unchanged |
| Stripe, Visa, Mastercard, Twitter Cards, Open Graph | third-party brands / specs — unchanged |

## Core term choices (Phase 89)

| English | Persian | Notes |
|---|---|---|
| Status | وضعیت | |
| Dashboard | داشبورد | established loanword |
| Overview | نمای کلی | |
| Compliance | انطباق | never left as «Compliance» in fa (unlike German loanword) |
| Privacy request | درخواست حریم خصوصی | |
| Consent | رضایت | consent log: «گزارش رضایت» |
| Legal document | سند حقوقی | |
| Cookie | کوکی | |
| Work Order | دستورکار | WO Type → «نوع دستورکار» |
| Maintenance (equipment upkeep) | نگهداری | **Canonical** (industrial CMMS sense). CMMS surface heading: «داشبورد نگهداری». The variant «نگهداشت» is retired for this concept — Phase 89 unified **all 35 maintenance-sense leaves catalog-wide** (9 in `maintenanceOperations` + 26 in `assetOperations`/`knowledge`/`brain`/`journal`/`library`/`publicSite`/`dashboard`/`architecture`/`adminDocuments`) to «نگهداری», matching the dominant catalog usage, the canonical `assetMaintenance` label source, and the `appShell` nav «نگهداری و تعمیرات (CMMS)». The maintenance noun «نگهداشت» is no longer present in the catalog (verified; the unrelated inflected verb forms «نگهداشتن/نگهداشته» = "to keep/kept" remain valid Persian and are intentionally not guarded by a substring test to avoid false positives). |
| Preventive / predictive maintenance | نگهداری پیشگیرانه / پیش‌بینانه | PM Plans → «طرح‌های نگهداری» |
| Retention / keeping (data, records) | نگهداری | Distinct sense — do NOT rewrite to «نگهداشت»: `documents.nav.retention`, `knowledge.historian`/`audit` (data retention), GDPR «داده‌ها را نگهداری می‌کنیم». |
| Failure / Root Cause Analysis | خرابی / تحلیل علت ریشه‌ای | |
| Downtime | زمان توقف / توقف | |
| Checklist / Template | چک‌لیست / قالب | |
| Spare Parts | قطعات یدکی | |
| Work Center | مرکز کاری | |
| Technician | تکنسین | |
| Asset | دارایی | Asset Registry → «دفتر ثبت دارایی‌ها» |
| Criticality: Critical/High/Medium/Low/Non-Critical | بحرانی / بالا / متوسط / پایین / غیربحرانی | |
| Status: In Service / Under Maintenance / Standby / Retired | در سرویس / در حال تعمیر / آماده‌به‌کار / بازنشسته | |
| Production Line / Conveyor / Valve / Pump | خط تولید / نوار نقاله / شیر / پمپ | |
| Electrical Panel / MCC Panel / SCADA Node | تابلوی برق / تابلوی MCC / گرهٔ SCADA | acronym kept, noun translated |
| Customer Accounts | حساب‌های مشتری | |
| Vendor: Approve/Reject/Suspend/Reinstate | تأیید / رد / تعلیق / بازگردانی | |
| Estimated Hours | ساعت تخمینی | |
| Course Management / Publish / Draft / Archived | مدیریت دوره‌ها / انتشار / پیش‌نویس / بایگانی‌شده | |

## Style rules

- Use Persian `ی` (not Arabic `ي`) and Persian `ک` (not Arabic `ك`).
- Preserve ZWNJ (نیم‌فاصله) in compounds (پیش‌بینانه، به‌روزرسانی، آماده‌به‌کار).
- Persian digits in prose where the source uses digits inside a translated phrase
  («× ۲ زبان»، «مادهٔ ۱۷ GDPR»، «ظرف ۳۰ روز»).
- Keep ICU placeholders (`{date}`), protocol tokens, and symbols
  (✕ ✓ ⚠ 🗑 📦 ← → …) exactly as in the source; only the surrounding words change.
- Never translate database identifiers, enum values, or user-entered free text.
- Example e-mails/URLs stay Latin («you@company.com») — they are placeholders.

## Enforcement (value-level)

All **57** leaves whose Persian value is intentionally identical to English are
individually reviewed and categorized in `src/i18n/fa-identical-allowlist.ts`
(protocol-or-standard · brand-or-product · vendor-or-thirdparty ·
contact-url-or-propernoun · non-linguistic).
`src/i18n/__tests__/fa-identical-audit.test.ts` enforces the list in both
directions — a NEW FA==EN equality fails with the exact key path (translate it
or review+allowlist it), and a stale entry fails until pruned. The same suite
guards that no allowlisted "identical" value contains Persian script and that no
value looks like a raw localization key path.

Outbound auth e-mails (verification / password reset / welcome) are fully
tri-lingual in `src/lib/email/templates/email-locale.ts` (unknown locale falls
back to English).
