import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { enumLabel, humanizeEnum, type EnumTranslator } from "../enum-label";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";

/**
 * PHASE 87L.5 — closed-enum values must reach the UI as curated, localized
 * labels. The catalogs already carried them; several legacy module clients
 * rendered `value.replace(/_/g, " ")` instead, which shows SCREAMING ENGLISH
 * inside the Persian UI and discards the curated English wording.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const translator = (locale: "en" | "fa", namespace: string) =>
  createTranslator({
    locale,
    messages: (locale === "en" ? en : fa) as never,
    namespace: namespace as never,
  }) as unknown as EnumTranslator;

describe("humanizeEnum — safe fallback for values the catalog does not know", () => {
  it("title-cases a SCREAMING_SNAKE value and keeps connector words lowercase", () => {
    expect(humanizeEnum("OUT_OF_SERVICE")).toBe("Out of service");
    expect(humanizeEnum("IN_PROGRESS")).toBe("In progress");
    expect(humanizeEnum("PENDING")).toBe("Pending");
    expect(humanizeEnum("WORK_ORDER_CREATED")).toBe("Work order created");
  });

  it("never returns the raw shouted constant", () => {
    for (const v of ["IN_SERVICE", "HIGH_PRIORITY", "DOCUMENT_CONTROLLED"]) {
      expect(humanizeEnum(v)).not.toBe(v);
      expect(humanizeEnum(v)).not.toContain("_");
    }
  });
});

describe("enumLabel — catalog first, safe fallback second", () => {
  it("returns the curated EN label for a known asset status", () => {
    const t = translator("en", "assetMaintenance");
    expect(enumLabel(t, "assetStatus", "IN_SERVICE")).toBe(en.assetMaintenance.assetStatus.IN_SERVICE);
    expect(enumLabel(t, "assetStatus", "IN_SERVICE")).not.toBe("IN_SERVICE");
  });

  it("returns real Persian for the same value — no English leaks into the FA UI", () => {
    const t = translator("fa", "assetMaintenance");
    const label = enumLabel(t, "assetStatus", "IN_SERVICE");
    expect(label).toBe((fa as unknown as typeof en).assetMaintenance.assetStatus.IN_SERVICE);
    expect(label).not.toMatch(/[A-Za-z]/);
    expect(label).not.toContain("_");
  });

  it("the FA-bearing namespaces really do carry Persian for every migrated enum", () => {
    // `assetOperations` was translated to GERMAN only — its `fa` entries are an
    // English carryover, which is exactly why the migrated surfaces read status,
    // criticality, risk and lifecycle from `assetMaintenance` instead.
    const faDoc = (fa as unknown as typeof en);
    expect(faDoc.assetOperations.enums.status.IN_SERVICE).toBe(en.assetOperations.enums.status.IN_SERVICE);
    for (const [ns, path] of [
      ["assetMaintenance", "assetStatus"], ["assetMaintenance", "criticality"],
      ["assetMaintenance", "risk"], ["assetMaintenance", "lifecycle"],
      ["assetMaintenance", "maintenanceStatus"], ["engineeringDocuments", "docType"],
    ] as const) {
      const tree = (faDoc as unknown as Record<string, Record<string, Record<string, string>>>)[ns][path];
      const persianValues = Object.values(tree).filter((v) => /[؀-ۿ]/.test(v));
      expect(persianValues.length, `${ns}.${path} must be genuinely Persian`).toBeGreaterThan(0);
    }
  });

  it("covers every key of the closed enums the migrated surfaces render", () => {
    const cases: [string, string, Record<string, string>][] = [
      ["assetMaintenance", "assetStatus", en.assetMaintenance.assetStatus],
      ["assetMaintenance", "criticality", en.assetMaintenance.criticality],
      ["assetMaintenance", "lifecycle", en.assetMaintenance.lifecycle],
      ["assetMaintenance", "risk", en.assetMaintenance.risk],
      ["assetMaintenance", "maintenanceStatus", en.assetMaintenance.maintenanceStatus],
      ["engineeringDocuments", "docType", en.engineeringDocuments.docType],
    ];
    for (const [ns, path, tree] of cases) {
      for (const locale of ["en", "fa"] as const) {
        const t = translator(locale, ns);
        for (const key of Object.keys(tree)) {
          const label = enumLabel(t, path, key);
          // an acronym label may legitimately equal its key (FAT, PID, SAT);
          // what must never happen is an underscore reaching the UI
          expect(label, `${locale} ${ns}.${path}.${key}`).not.toContain("_");
          if (key.includes("_")) {
            expect(label, `${locale} ${ns}.${path}.${key}`).not.toBe(key);
          }
        }
      }
    }
  });

  it("falls back to a humanized label for a value the catalog has not added yet", () => {
    const t = translator("en", "assetMaintenance");
    // a plausible future enum member
    expect(enumLabel(t, "assetStatus", "AWAITING_PARTS")).toBe("Awaiting parts");
  });

  it("renders a localized placeholder for absent values instead of an empty cell", () => {
    const t = translator("en", "assetMaintenance");
    expect(enumLabel(t, "assetStatus", null)).toBe("—");
    expect(enumLabel(t, "assetStatus", undefined)).toBe("—");
    expect(enumLabel(t, "assetStatus", "")).toBe("—");
    expect(enumLabel(t, "assetStatus", null, { emptyLabel: "بدون وضعیت" })).toBe("بدون وضعیت");
  });

  it("never builds a lookup key from a value that is not an enum identifier", () => {
    const t = translator("en", "assetMaintenance");
    for (const hostile of ["../../secret", "a.b.c", "<script>", "key with spaces", "1_LEADING_DIGIT"]) {
      // returned verbatim, never used to index the catalog
      expect(enumLabel(t, "assetStatus", hostile)).toBe(hostile);
    }
  });

  it("degrades safely when the translator cannot answer", () => {
    const throwing = Object.assign(() => { throw new Error("missing namespace"); }, {
      has: () => { throw new Error("missing namespace"); },
    }) as unknown as EnumTranslator;
    expect(enumLabel(throwing, "assetStatus", "IN_SERVICE")).toBe("In service");
  });

  it("is presentation-only — it never mutates or reformats the persisted value", () => {
    const src = read("src/lib/i18n/enum-label.ts");
    expect(src).not.toMatch(/fetch\(|prisma|api\//i);
    // the raw value is only read, and only ever returned as a fallback
    expect(src).not.toMatch(/value\s*=\s*[^=]/);
  });
});

describe("asset type — a closed 20-value code set, exhaustively localized", () => {
  // `IndustrialAssetType` (src/lib/assets/types.ts) is a closed union, not a
  // database taxonomy and not user-entered text, so 87L.5 §8 case A applies:
  // exhaustive typed fa/en labels with a safe unknown fallback.
  const VALUES = [
    "PRODUCTION_LINE", "MACHINE", "PLC", "HMI", "SCADA_NODE", "ELECTRICAL_PANEL",
    "MCC_PANEL", "VFD", "MOTOR", "PUMP", "VALVE", "SENSOR", "INSTRUMENT", "ROBOT",
    "CONVEYOR", "COMPRESSOR", "UTILITY_SYSTEM", "SAFETY_SYSTEM", "NETWORK_DEVICE",
    "INDUSTRIAL_PC",
  ] as const;

  it("the union in the type contract and the label tree cover exactly the same values", () => {
    const types = read("src/lib/assets/types.ts");
    const union = types.match(/export type IndustrialAssetType\s*=\s*([^;]+);/)![1];
    const declared = [...union.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(new Set(declared)).toEqual(new Set(VALUES));
    expect(Object.keys(en.assetMaintenance.assetType).sort()).toEqual([...VALUES].sort());
  });

  it("resolves in both locales, with real Persian for non-acronyms", () => {
    const ACRONYMS = new Set(["PLC", "HMI", "VFD"]);
    for (const v of VALUES) {
      const label = enumLabel(translator("en", "assetMaintenance"), "assetType", v);
      const labelFa = enumLabel(translator("fa", "assetMaintenance"), "assetType", v);
      expect(label, `en ${v}`).not.toContain("_");
      expect(labelFa, `fa ${v}`).not.toContain("_");
      if (!ACRONYMS.has(v)) {
        expect(labelFa, `fa ${v} must be translated`).not.toBe(label);
        expect(labelFa, `fa ${v} must be Persian`).toMatch(/[؀-ۿ]/);
      }
    }
  });

  it("an unknown or future type degrades to a readable label, never a crash", () => {
    const t = translator("fa", "assetMaintenance");
    expect(enumLabel(t, "assetType", "QUANTUM_REACTOR")).toBe("Quantum reactor");
    expect(enumLabel(t, "assetType", null)).toBe("—");
  });

  it("the detail surface reads the type from the Persian-bearing namespace", () => {
    const src = read("src/components/assets/AssetDetailClient.tsx");
    expect(src).toContain('enumLabel(tAm, "assetType", asset.assetType)');
    // NOT from assetOperations, whose `fa` entries are an English carryover
    expect(src).not.toContain('"enums.typeFull"');
  });
});

describe("migrated surfaces no longer leak raw enums", () => {
  const MIGRATED = [
    "src/components/assets/AssetDetailClient.tsx",
    "src/components/assets/AssetLifecycleClient.tsx",
    "src/components/assets/AssetAnalyticsClient.tsx",
    "src/components/assets/AssetsRegistryClient.tsx",
    "src/components/assets/AssetsDashboardClient.tsx",
    "src/components/assets/AssetMaintenanceClient.tsx",
    "src/app/[locale]/cmms/tasks/[id]/page.tsx",
    "src/components/cmms/CmmsDashboardClient.tsx",
    "src/components/cmms/MaintenanceTasksClient.tsx",
    "src/components/cmms/SchedulesClient.tsx",
    "src/components/cmms/DowntimeClient.tsx",
    "src/components/cmms/HistoryClient.tsx",
    "src/components/document/DocumentDetailClient.tsx",
    "src/components/document/DocumentExplorerClient.tsx",
    "src/components/document/SearchClient.tsx",
    "src/components/document/TemplateGalleryClient.tsx",
    "src/components/document/ShareClient.tsx",
  ];

  it("no migrated surface still uses the underscore formatter", () => {
    for (const rel of MIGRATED) {
      expect(read(rel), rel).not.toMatch(/replace\(\/_\/g/);
      expect(read(rel), rel).not.toMatch(/replaceAll\("_"/);
    }
  });

  it("each one routes its enums through the shared formatter", () => {
    for (const rel of MIGRATED) {
      expect(read(rel), rel).toContain('from "@/lib/i18n/enum-label"');
      expect(read(rel), rel).toContain("enumLabel(");
    }
  });

  it("the formatter is not duplicated per module", () => {
    for (const rel of MIGRATED) {
      expect(read(rel), rel).not.toMatch(/const\s+\w*(STATUS|TYPE)_LABELS?\s*[:=]\s*\{/);
    }
  });
});
