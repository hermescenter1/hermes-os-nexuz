/**
 * Phase 56B — Engineering Knowledge Graph Builder.
 *
 * Deterministic. No AI calls. No hallucination.
 * Derives every node and edge from:
 *   1. Static vendor catalog (VENDORS)
 *   2. Static engineering cases (cases.json)
 *   3. Static protocol definitions (defined below)
 *   4. Dynamic knowledge articles (knowledge repository — optional enrichment)
 *   5. Dynamic session cases (case repository — optional enrichment)
 *
 * Graph version increments when the static schema changes.
 */

import type {
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  EngGraphSnapshot,
  EngGraphStats,
  GraphNodeType,
  GraphRelationshipType,
} from "./types";
import { VENDORS }          from "@/lib/industrial/vendors";
import casesJson            from "@/lib/industrial/knowledge-data/cases.json";
import { caseRepository }   from "@/lib/storage/case-repository";
import { knowledgeRepository } from "@/lib/storage/knowledge-repository";

const GRAPH_VERSION = "56.1.0";

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(
  id: string,
  type: GraphNodeType,
  label: string,
  sublabel?: string,
  properties: Record<string, string | number | boolean> = {},
): KnowledgeGraphNode {
  return { id, type, label, sublabel, properties, degree: 0, impactScore: 0 };
}

function edge(
  source: string,
  target: string,
  type: GraphRelationshipType,
  weight = 1.0,
  properties: Record<string, string | number | boolean> = {},
): KnowledgeGraphEdge {
  return {
    id:         `${source}⟶${type}⟶${target}`,
    source,
    target,
    type,
    weight,
    label:      type.toLowerCase().replace(/_/g, " "),
    properties,
  };
}

// ── Static Protocol Catalog ───────────────────────────────────────────────────
// Source: IEC 61158, IEC 62541, ISO/IEC 20922, TIA-485, IEEE 1815.

const PROTOCOLS = [
  { id: "profinet",    label: "PROFINET",          standard: "IEC 61158",      layer: "fieldbus"    },
  { id: "profibus",    label: "Profibus DP",        standard: "IEC 61158",      layer: "fieldbus"    },
  { id: "opc-ua",      label: "OPC-UA",             standard: "IEC 62541",      layer: "semantic"    },
  { id: "modbus-tcp",  label: "Modbus TCP",         standard: "IEC 61158-3",    layer: "network"     },
  { id: "modbus-rtu",  label: "Modbus RTU",         standard: "TIA-485",        layer: "serial"      },
  { id: "ethernet-ip", label: "EtherNet/IP",        standard: "IEC 61784-2",    layer: "network"     },
  { id: "mqtt",        label: "MQTT",               standard: "ISO/IEC 20922",  layer: "iot"         },
  { id: "s7comm",      label: "S7Comm",             standard: "Siemens",        layer: "proprietary" },
  { id: "rs485",       label: "RS-485",             standard: "TIA-485",        layer: "serial"      },
  { id: "hart",        label: "HART",               standard: "IEC 61158-2",    layer: "analog"      },
] as const;

type ProtoId = typeof PROTOCOLS[number]["id"];

// ── Vendor × Product Catalog ──────────────────────────────────────────────────
// PRODUCT nodes are product families; PLC/DRIVE/etc. are specific instances.
// caseIds link a specific device to the engineering case it appears in.

type ProductDef = {
  productId:  string;  // PRODUCT node id
  productLabel: string;
  devices: Array<{
    id:        string;
    label:     string;
    type:      GraphNodeType;
    protocols: ProtoId[];
    caseId?:   string;  // engineering case that involves this device
  }>;
};

const VENDOR_CATALOG: Record<string, ProductDef[]> = {
  siemens: [
    {
      productId: "prod-siemens-s7",
      productLabel: "SIMATIC S7 PLC Series",
      devices: [
        { id: "plc-siemens-1200",   label: "S7-1200 CPU",       type: "PLC",   protocols: ["profinet", "s7comm"], caseId: "case-siemens-1200-bf"   },
        { id: "plc-siemens-1500",   label: "S7-1500 CPU",       type: "PLC",   protocols: ["profinet", "opc-ua", "s7comm"], caseId: "case-siemens-1500-scan" },
      ],
    },
    {
      productId: "prod-siemens-wincc",
      productLabel: "WinCC SCADA Platform",
      devices: [
        { id: "scada-siemens-wincc", label: "WinCC Unified",    type: "SCADA", protocols: ["opc-ua", "s7comm"]          },
      ],
    },
    {
      productId: "prod-siemens-sinamics",
      productLabel: "SINAMICS Drive Family",
      devices: [
        { id: "drive-siemens-g120",  label: "SINAMICS G120",    type: "DRIVE", protocols: ["profinet", "profibus"]       },
      ],
    },
  ],
  abb: [
    {
      productId: "prod-abb-acs",
      productLabel: "ABB ACS Drive Series",
      devices: [
        { id: "drive-abb-acs580",    label: "ABB ACS580",       type: "DRIVE", protocols: ["modbus-tcp", "ethernet-ip"], caseId: "case-abb-acs580-oc" },
        { id: "drive-abb-acs880",    label: "ABB ACS880",       type: "DRIVE", protocols: ["profinet", "ethernet-ip"]    },
      ],
    },
    {
      productId: "prod-abb-motor",
      productLabel: "ABB IE Motor Series",
      devices: [
        { id: "motor-abb-ie3",       label: "ABB IE3 Motor",    type: "MOTOR", protocols: [],                           caseId: "case-abb-motor-imbalance" },
      ],
    },
    {
      productId: "prod-abb-ac500",
      productLabel: "ABB AC500 PLC",
      devices: [
        { id: "plc-abb-ac500",       label: "ABB AC500 PLC",    type: "PLC",   protocols: ["modbus-tcp", "profinet"]    },
      ],
    },
  ],
  schneider: [
    {
      productId: "prod-schneider-altivar",
      productLabel: "Altivar Drive Family",
      devices: [
        { id: "drive-schneider-atv320", label: "Altivar ATV320", type: "DRIVE", protocols: ["modbus-tcp", "profinet"],  caseId: "case-schneider-atv-ocf" },
        { id: "drive-schneider-atv630", label: "Altivar ATV630", type: "DRIVE", protocols: ["ethernet-ip", "profinet"] },
      ],
    },
    {
      productId: "prod-schneider-modicon",
      productLabel: "Modicon PLC Family",
      devices: [
        { id: "plc-schneider-m580",  label: "Modicon M580",     type: "PLC",   protocols: ["ethernet-ip", "modbus-tcp"], caseId: "case-schneider-m580-timeout" },
        { id: "plc-schneider-m340",  label: "Modicon M340",     type: "PLC",   protocols: ["modbus-tcp", "profibus"]    },
      ],
    },
  ],
  phoenix: [
    {
      productId: "prod-phoenix-plcnext",
      productLabel: "PLCnext Technology",
      devices: [
        { id: "plc-phoenix-axcf",    label: "PLCnext AXC F 2152", type: "PLC", protocols: ["mqtt", "opc-ua", "profinet"], caseId: "case-phoenix-mqtt-drop" },
      ],
    },
    {
      productId: "prod-phoenix-axioline",
      productLabel: "Axioline I/O System",
      devices: [
        { id: "asset-phoenix-axioline", label: "Axioline F I/O", type: "ASSET", protocols: ["profinet", "modbus-tcp"],    caseId: "case-phoenix-di-chatter" },
      ],
    },
  ],
  delta: [
    {
      productId: "prod-delta-vfd",
      productLabel: "Delta VFD Series",
      devices: [
        { id: "drive-delta-vfd-m",   label: "Delta VFD-M",      type: "DRIVE", protocols: ["modbus-rtu", "rs485"],       caseId: "case-delta-vfd-oh" },
        { id: "drive-delta-ms300",   label: "Delta MS300",       type: "DRIVE", protocols: ["modbus-tcp", "profinet"]    },
      ],
    },
    {
      productId: "prod-delta-dop",
      productLabel: "Delta DOP HMI Series",
      devices: [
        { id: "scada-delta-dop",     label: "Delta DOP-B HMI",  type: "SCADA", protocols: ["rs485", "modbus-rtu"],       caseId: "case-delta-hmi-rs485" },
      ],
    },
  ],
  mitsubishi: [
    {
      productId: "prod-mitsubishi-melsec",
      productLabel: "MELSEC PLC Family",
      devices: [
        { id: "plc-mitsubishi-fx5u",  label: "MELSEC FX5U",     type: "PLC",   protocols: ["modbus-tcp", "ethernet-ip"], caseId: "case-mitsubishi-fx5-coil" },
        { id: "plc-mitsubishi-iq-r",  label: "MELSEC iQ-R",     type: "PLC",   protocols: ["profinet", "modbus-tcp"]    },
      ],
    },
    {
      productId: "prod-mitsubishi-mr",
      productLabel: "MR-J Servo Drive Series",
      devices: [
        { id: "drive-mitsubishi-mrj4", label: "MR-J4 Servo",    type: "DRIVE", protocols: ["rs485"],                    caseId: "case-mitsubishi-mrj4-al16" },
      ],
    },
    {
      productId: "prod-mitsubishi-got",
      productLabel: "GOT HMI Series",
      devices: [
        { id: "scada-mitsubishi-got", label: "GOT2000 HMI",     type: "SCADA", protocols: ["ethernet-ip", "modbus-tcp"] },
      ],
    },
  ],
  omron: [
    {
      productId: "prod-omron-sysmac",
      productLabel: "Sysmac PLC Platform",
      devices: [
        { id: "plc-omron-nx1p",      label: "Sysmac NX1P2",     type: "PLC",   protocols: ["ethernet-ip", "opc-ua"],    caseId: "case-omron-nx-estop-reset" },
        { id: "plc-omron-cj2",       label: "Omron CJ2 PLC",    type: "PLC",   protocols: ["ethernet-ip", "modbus-tcp"] },
      ],
    },
    {
      productId: "prod-omron-sensor",
      productLabel: "Omron Temperature Control",
      devices: [
        { id: "sensor-omron-e5cc",   label: "E5CC Temp Controller", type: "SENSOR", protocols: ["modbus-rtu", "rs485"], caseId: "case-omron-e5cc-drift" },
      ],
    },
    {
      productId: "prod-omron-hmi",
      productLabel: "Omron NB HMI Series",
      devices: [
        { id: "scada-omron-nb",      label: "Omron NB HMI",     type: "SCADA", protocols: ["rs485", "modbus-rtu"]       },
      ],
    },
  ],
};

// ── Static Alarm Definitions (derived from engineering cases) ─────────────────
// Each alarm maps to: the device that GENERATES it, the case that documents it.

const STATIC_ALARMS = [
  { id: "alarm-profinet-bf",   label: "PROFINET Bus Fault",        category: "Communication", deviceId: "plc-siemens-1200",       caseId: "case-siemens-1200-bf"      },
  { id: "alarm-scan-overrun",  label: "PLC Scan Overrun",          category: "CPU",           deviceId: "plc-siemens-1500",       caseId: "case-siemens-1500-scan"    },
  { id: "alarm-drive-oc",      label: "Drive Overcurrent 2310",    category: "Power",         deviceId: "drive-abb-acs580",       caseId: "case-abb-acs580-oc"        },
  { id: "alarm-motor-imbal",   label: "Motor Current Imbalance",   category: "Motor",         deviceId: "motor-abb-ie3",          caseId: "case-abb-motor-imbalance"  },
  { id: "alarm-drive-ocf",     label: "Drive Output Current Fault",category: "Power",         deviceId: "drive-schneider-atv320", caseId: "case-schneider-atv-ocf"    },
  { id: "alarm-comm-timeout",  label: "Communication Timeout",     category: "Network",       deviceId: "plc-schneider-m580",     caseId: "case-schneider-m580-timeout"},
  { id: "alarm-mqtt-drop",     label: "MQTT Connection Drop",      category: "IoT Network",   deviceId: "plc-phoenix-axcf",       caseId: "case-phoenix-mqtt-drop"    },
  { id: "alarm-di-chatter",    label: "Digital Input Chatter",     category: "I/O",           deviceId: "asset-phoenix-axioline", caseId: "case-phoenix-di-chatter"   },
  { id: "alarm-drive-oh",      label: "Drive Overheat (OH)",       category: "Thermal",       deviceId: "drive-delta-vfd-m",      caseId: "case-delta-vfd-oh"         },
  { id: "alarm-rs485-fault",   label: "RS-485 Communication Fault",category: "Serial",        deviceId: "scada-delta-dop",        caseId: "case-delta-hmi-rs485"      },
  { id: "alarm-coil-conflict", label: "Output Coil Conflict",      category: "Programming",   deviceId: "plc-mitsubishi-fx5u",    caseId: "case-mitsubishi-fx5-coil"  },
  { id: "alarm-encoder-loss",  label: "Encoder Feedback Loss AL16",category: "Feedback",      deviceId: "drive-mitsubishi-mrj4",  caseId: "case-mitsubishi-mrj4-al16" },
  { id: "alarm-safety-estop",  label: "Safety E-Stop Active",      category: "Safety",        deviceId: "plc-omron-nx1p",         caseId: "case-omron-nx-estop-reset" },
  { id: "alarm-temp-drift",    label: "Temperature Sensor Drift",  category: "Measurement",   deviceId: "sensor-omron-e5cc",      caseId: "case-omron-e5cc-drift"     },
] as const;

// ── Static Signal Definitions (from OT telemetry domain) ────────────────────

const STATIC_SIGNALS = [
  { id: "sig-current",   label: "Motor Current",     unit: "A",      deviceId: "motor-abb-ie3",          alarmId: "alarm-motor-imbal"  },
  { id: "sig-speed",     label: "Drive Speed",       unit: "RPM",    deviceId: "drive-abb-acs580",       alarmId: "alarm-drive-oc"     },
  { id: "sig-temp",      label: "Process Temperature", unit: "°C",   deviceId: "sensor-omron-e5cc",      alarmId: "alarm-temp-drift"   },
  { id: "sig-estop",     label: "E-Stop Status",     unit: "binary", deviceId: "plc-omron-nx1p",         alarmId: "alarm-safety-estop" },
  { id: "sig-profinet",  label: "PROFINET Link State", unit: "binary", deviceId: "plc-siemens-1200",     alarmId: "alarm-profinet-bf"  },
] as const;

// ── Builder ───────────────────────────────────────────────────────────────────

type RawCase = {
  id: string;
  vendor: string;
  category: string;
  keywords: string[];
  en: { symptoms: string; rootCause: string; resolution: string };
};

export async function buildEngGraph(): Promise<EngGraphSnapshot> {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const addedNodeIds = new Set<string>();

  function addNode(n: KnowledgeGraphNode) {
    if (!addedNodeIds.has(n.id)) { nodes.push(n); addedNodeIds.add(n.id); }
  }

  // ── 1. SITE ────────────────────────────────────────────────────────────────
  addNode(node("site-hermes", "SITE", "Hermes Industrial Site", "Global Operations", {
    status: "operational",
    location: "Global",
  }));

  // ── 2. PROTOCOLS ──────────────────────────────────────────────────────────
  for (const p of PROTOCOLS) {
    addNode(node(`proto-${p.id}`, "PROTOCOL", p.label, p.standard, {
      standard: p.standard,
      layer:    p.layer,
    }));
  }

  // ── 3. VENDORS + PRODUCTS + DEVICES ───────────────────────────────────────
  for (const vendor of VENDORS) {
    const vendorId = `vendor-${vendor.id}`;
    addNode(node(vendorId, "VENDOR", vendor.name, `${vendor.id.toUpperCase()} · Industrial Vendor`, {
      vendorId: vendor.id,
    }));
    edges.push(edge(vendorId, "site-hermes", "BELONGS_TO"));

    const catalog = VENDOR_CATALOG[vendor.id] ?? [];
    for (const productDef of catalog) {
      // PRODUCT node (product family)
      addNode(node(productDef.productId, "PRODUCT", productDef.productLabel, `${vendor.name} · Product Family`, {
        vendor: vendor.id,
      }));
      edges.push(edge(vendorId, productDef.productId, "USES"));

      // DEVICE nodes (PLC, DRIVE, SCADA, MOTOR, SENSOR, ASSET)
      for (const dev of productDef.devices) {
        addNode(node(dev.id, dev.type, dev.label, `${vendor.name} · ${dev.type}`, {
          vendor: vendor.id,
        }));
        edges.push(edge(productDef.productId, dev.id, "USES"));
        edges.push(edge(dev.id, "site-hermes", "BELONGS_TO"));

        // DEVICE → PROTOCOL (COMMUNICATES_WITH)
        for (const pid of dev.protocols) {
          const protoNodeId = `proto-${pid}`;
          if (addedNodeIds.has(protoNodeId)) {
            edges.push(edge(dev.id, protoNodeId, "COMMUNICATES_WITH"));
          }
        }
      }
    }
  }

  // ── 4. SIGNALS ────────────────────────────────────────────────────────────
  for (const sig of STATIC_SIGNALS) {
    addNode(node(sig.id, "SIGNAL", sig.label, sig.unit, { unit: sig.unit }));
    // Device MONITORS signal
    if (addedNodeIds.has(sig.deviceId)) {
      edges.push(edge(sig.deviceId, sig.id, "MONITORS"));
    }
  }

  // ── 5. ALARMS ─────────────────────────────────────────────────────────────
  for (const alarm of STATIC_ALARMS) {
    addNode(node(alarm.id, "ALARM", alarm.label, alarm.category, { category: alarm.category }));
    // Device GENERATES alarm
    if (addedNodeIds.has(alarm.deviceId)) {
      edges.push(edge(alarm.deviceId, alarm.id, "GENERATES"));
    }
  }
  // Signal TRIGGERS alarm
  for (const sig of STATIC_SIGNALS) {
    if (sig.alarmId && addedNodeIds.has(sig.alarmId)) {
      edges.push(edge(sig.id, sig.alarmId as string, "TRIGGERS"));
    }
  }

  // ── 6. CASES + ROOT CAUSES + RESOLUTIONS (static corpus) ──────────────────
  const casesData = casesJson as { cases: RawCase[] };
  const alarmByCaseId = new Map(STATIC_ALARMS.map(a => [a.caseId, a.id]));

  for (const c of casesData.cases) {
    const caseNodeId = c.id;
    const rcId       = `rc-${c.id}`;
    const resId      = `res-${c.id}`;

    addNode(node(caseNodeId, "CASE",
      c.en.symptoms.length > 70 ? c.en.symptoms.slice(0, 70) + "…" : c.en.symptoms,
      `${c.vendor.toUpperCase()} · ${c.category}`,
      { vendor: c.vendor, category: c.category, caseId: c.id, confidence: 85 },
    ));
    addNode(node(rcId, "ROOT_CAUSE",
      c.en.rootCause.length > 70 ? c.en.rootCause.slice(0, 70) + "…" : c.en.rootCause,
      `Root Cause · ${c.category}`,
      { vendor: c.vendor, category: c.category, caseId: c.id },
    ));
    addNode(node(resId, "RESOLUTION",
      c.en.resolution.length > 70 ? c.en.resolution.slice(0, 70) + "…" : c.en.resolution,
      `Resolution · ${c.vendor}`,
      { vendor: c.vendor, caseId: c.id },
    ));

    // Alarm TRIGGERS case
    const alarmId = alarmByCaseId.get(c.id as typeof STATIC_ALARMS[number]["caseId"]);
    if (alarmId && addedNodeIds.has(alarmId)) {
      edges.push(edge(alarmId, caseNodeId, "TRIGGERS"));
    }

    // Vendor REFERENCES case
    const vendorNodeId = `vendor-${c.vendor}`;
    if (addedNodeIds.has(vendorNodeId)) {
      edges.push(edge(vendorNodeId, caseNodeId, "REFERENCES"));
    }

    // Case CAUSED_BY root cause → RESOLVED_BY resolution
    edges.push(edge(caseNodeId, rcId, "CAUSED_BY"));
    edges.push(edge(rcId, resId, "RESOLVED_BY"));
  }

  // ── 7. Dynamic enrichment: knowledge articles ──────────────────────────────
  try {
    const articles = await knowledgeRepository().list();
    for (const a of articles.filter(x => x.status === "published")) {
      const artId = `article-${a.id}`;
      addNode(node(artId, "KNOWLEDGE_ARTICLE",
        a.title.length > 70 ? a.title.slice(0, 70) + "…" : a.title,
        `${a.domain} · Knowledge Article`,
        { domain: a.domain, confidence: a.confidence, vendor: a.vendor ?? "", status: a.status },
      ));
      // Link to matching cases by vendor + domain
      for (const c of casesData.cases) {
        if (c.vendor === a.vendor && c.category === a.domain) {
          edges.push(edge(`res-${c.id}`, artId, "REFERENCES", 0.8));
        }
      }
      if (a.vendor && addedNodeIds.has(`vendor-${a.vendor}`)) {
        edges.push(edge(`vendor-${a.vendor}`, artId, "REFERENCES", 0.6));
      }
    }
  } catch { /* knowledge repository unavailable — static graph is complete */ }

  // ── 8. Dynamic enrichment: published session cases ──────────────────────────
  try {
    const dynCases = await caseRepository().list();
    for (const dc of dynCases.filter(x => x.status === "published")) {
      const dcId  = `dyn-case-${dc.id}`;
      const rcId  = `dyn-rc-${dc.id}`;
      const resId = `dyn-res-${dc.id}`;

      addNode(node(dcId, "CASE",
        dc.title.length > 70 ? dc.title.slice(0, 70) + "…" : dc.title,
        `${dc.vendor} · ${dc.domain} · Dynamic`,
        { vendor: dc.vendor, category: dc.domain, caseId: dc.id, dynamic: true, confidence: dc.confidence },
      ));
      if (dc.rootCause) {
        addNode(node(rcId, "ROOT_CAUSE",
          dc.rootCause.length > 70 ? dc.rootCause.slice(0, 70) + "…" : dc.rootCause,
          `Dynamic Root Cause`,
          { caseId: dc.id, dynamic: true },
        ));
        edges.push(edge(dcId, rcId, "CAUSED_BY"));

        if (dc.correctiveActions?.[0]) {
          addNode(node(resId, "RESOLUTION",
            dc.correctiveActions[0].length > 70 ? dc.correctiveActions[0].slice(0, 70) + "…" : dc.correctiveActions[0],
            `Dynamic Resolution`,
            { caseId: dc.id, dynamic: true },
          ));
          edges.push(edge(rcId, resId, "RESOLVED_BY"));
        }
      }
      if (dc.vendor && addedNodeIds.has(`vendor-${dc.vendor}`)) {
        edges.push(edge(`vendor-${dc.vendor}`, dcId, "REFERENCES"));
      }
    }
  } catch { /* case repository unavailable — static graph is complete */ }

  // ── 9. Deduplicate edges ───────────────────────────────────────────────────
  const seenEdges = new Set<string>();
  const finalEdges = edges.filter(e => {
    if (seenEdges.has(e.id)) return false;
    seenEdges.add(e.id);
    // Skip edges referencing non-existent nodes
    return addedNodeIds.has(e.source) && addedNodeIds.has(e.target);
  });

  // ── 10. Degree + impact scores ─────────────────────────────────────────────
  const degreeMap = new Map<string, number>();
  for (const e of finalEdges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
  }

  const TYPE_BASE_SCORE: Partial<Record<GraphNodeType, number>> = {
    KNOWLEDGE_ARTICLE: 40,
    RESOLUTION:        30,
    CASE:              25,
    VENDOR:            20,
    PROTOCOL:          15,
    ALARM:             20,
    ROOT_CAUSE:        15,
    PLC:               12,
    DRIVE:             10,
    SITE:              50,
  };

  const finalNodes: KnowledgeGraphNode[] = nodes.map(n => {
    const deg    = degreeMap.get(n.id) ?? 0;
    const base   = TYPE_BASE_SCORE[n.type] ?? 5;
    return { ...n, degree: deg, impactScore: Math.min(100, base + deg * 4) };
  });

  // ── 11. Stats ──────────────────────────────────────────────────────────────
  const nodesByType: Partial<Record<GraphNodeType, number>> = {};
  for (const n of finalNodes) nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;

  const edgesByType: Partial<Record<GraphRelationshipType, number>> = {};
  for (const e of finalEdges) edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;

  const N = finalNodes.length;
  const E = finalEdges.length;
  const maxEdges = N * (N - 1);

  const stats: EngGraphStats = {
    totalNodes:     N,
    totalEdges:     E,
    vendors:        nodesByType["VENDOR"]   ?? 0,
    protocols:      nodesByType["PROTOCOL"] ?? 0,
    assets:         (nodesByType["PLC"] ?? 0) + (nodesByType["SCADA"] ?? 0) + (nodesByType["DRIVE"] ?? 0) + (nodesByType["MOTOR"] ?? 0) + (nodesByType["SENSOR"] ?? 0) + (nodesByType["ASSET"] ?? 0),
    cases:          nodesByType["CASE"]     ?? 0,
    knowledgeLinks: (nodesByType["KNOWLEDGE_ARTICLE"] ?? 0) + (nodesByType["RESOLUTION"] ?? 0),
    graphDensity:   maxEdges > 0 ? parseFloat((E / maxEdges).toFixed(5)) : 0,
    nodesByType,
    edgesByType,
  };

  return {
    nodes: finalNodes,
    edges: finalEdges,
    stats,
    builtAt: new Date().toISOString(),
    version: GRAPH_VERSION,
  };
}
