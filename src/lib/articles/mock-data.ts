// Phase 72.5 — Industrial Journal mock data (Prisma-ready fallback)

import type {
  ArticleAuthorProfile,
  ArticleCategory,
  ArticleTag,
  ArticleListItem,
  ArticleDetail,
} from "./types";

export const MOCK_AUTHORS: ArticleAuthorProfile[] = [
  {
    id: "author-001", userId: "user-a01",
    handle: "dr-karimi",
    displayName: "Dr. Ahmad Karimi",
    headline: "Senior Automation Engineer · Siemens Certified Trainer · 18+ yrs Industrial Automation",
    bio: "Dr. Ahmad Karimi is a senior automation engineer with over 18 years of experience in PLC programming, SCADA systems, and industrial network design. He has led automation projects across petrochemical, power generation, and steel industries across Iran and the wider MENA region.",
    company: "Siemens AG",
    roleTitle: "Senior Automation Engineer",
    expertiseAreas: ["PLC Programming", "SCADA & HMI", "TIA Portal", "Siemens S7", "Industrial Networks"],
    location: "Tehran, Iran",
    avatarUrl: null, bannerUrl: null,
    followerCount: 2847, articleCount: 23, totalViews: 189420, totalSaves: 4231,
    verifiedExpert: true, industrialCredibilityScore: 9.4, isActive: true,
    createdAt: "2024-01-15T08:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "author-002", userId: "user-a02",
    handle: "m-hosseini-plc",
    displayName: "Maryam Hosseini",
    headline: "PLC/SCADA Specialist · ABB Industrial Automation · IOSH Member",
    bio: "Maryam Hosseini is a PLC and SCADA specialist with deep expertise in ABB industrial systems, process control, and industrial network architecture. She has commissioned automation systems across the GCC and MENA region.",
    company: "ABB",
    roleTitle: "Industrial Automation Specialist",
    expertiseAreas: ["ABB PLC", "SCADA & HMI", "Industrial Networks", "OPC-UA", "Process Control"],
    location: "Dubai, UAE",
    avatarUrl: null, bannerUrl: null,
    followerCount: 1932, articleCount: 17, totalViews: 134218, totalSaves: 2987,
    verifiedExpert: true, industrialCredibilityScore: 8.9, isActive: true,
    createdAt: "2024-03-10T08:00:00.000Z", updatedAt: "2026-05-20T10:00:00.000Z",
  },
  {
    id: "author-003", userId: "user-a03",
    handle: "r-mohammadi-reliability",
    displayName: "Reza Mohammadi",
    headline: "Reliability Engineer · CMMS Specialist · Predictive Maintenance Expert",
    bio: "Reza Mohammadi is a reliability engineer at MAPNA Group with 14 years of experience in condition monitoring, predictive maintenance, and CMMS implementation for heavy industrial assets including gas turbines and large rotating equipment.",
    company: "MAPNA Group",
    roleTitle: "Lead Reliability Engineer",
    expertiseAreas: ["Predictive Maintenance", "Vibration Analysis", "CMMS", "Asset Reliability", "ISO 55000"],
    location: "Tehran, Iran",
    avatarUrl: null, bannerUrl: null,
    followerCount: 1654, articleCount: 19, totalViews: 98720, totalSaves: 2341,
    verifiedExpert: true, industrialCredibilityScore: 8.7, isActive: true,
    createdAt: "2024-02-20T08:00:00.000Z", updatedAt: "2026-06-10T10:00:00.000Z",
  },
  {
    id: "author-004", userId: "user-a04",
    handle: "s-chen-industrial-ai",
    displayName: "Sarah Chen",
    headline: "Industrial AI Lead · Schneider Electric · IIoT Architecture · Edge Intelligence",
    bio: "Sarah Chen leads industrial AI initiatives at Schneider Electric, focusing on IIoT architecture, edge intelligence, and machine learning applications for industrial asset management and predictive analytics platforms.",
    company: "Schneider Electric",
    roleTitle: "Industrial AI Lead",
    expertiseAreas: ["Industrial AI", "IIoT", "Digital Twin", "Machine Learning", "EcoStruxure"],
    location: "Paris, France",
    avatarUrl: null, bannerUrl: null,
    followerCount: 3421, articleCount: 28, totalViews: 267890, totalSaves: 6124,
    verifiedExpert: true, industrialCredibilityScore: 9.6, isActive: true,
    createdAt: "2023-11-05T08:00:00.000Z", updatedAt: "2026-06-15T10:00:00.000Z",
  },
  {
    id: "author-005", userId: "user-a05",
    handle: "a-tehrani-electrical",
    displayName: "Ali Reza Tehrani",
    headline: "Senior Electrical Engineer · IEC 61850 Specialist · Power Systems · Offshore",
    bio: "Ali Reza Tehrani is a senior electrical engineer specializing in power systems protection, IEC 61850 protocol implementation, and offshore electrical infrastructure. He has designed electrical systems for offshore platforms and onshore high-voltage substations.",
    company: "Iranian Offshore Engineering Co.",
    roleTitle: "Senior Electrical Engineer",
    expertiseAreas: ["Electrical Engineering", "IEC 61850", "Power Systems", "Protective Relaying", "HV/MV Switchgear"],
    location: "Ahvaz, Iran",
    avatarUrl: null, bannerUrl: null,
    followerCount: 1128, articleCount: 12, totalViews: 72430, totalSaves: 1876,
    verifiedExpert: true, industrialCredibilityScore: 8.5, isActive: true,
    createdAt: "2024-04-01T08:00:00.000Z", updatedAt: "2026-05-30T10:00:00.000Z",
  },
  {
    id: "author-006", userId: "user-a06",
    handle: "prof-mueller-dt",
    displayName: "Prof. David Mueller",
    headline: "Digital Twin Research · TU Munich · Industry 4.0 · Cyber-Physical Systems",
    bio: "Prof. David Mueller is a researcher at Technical University Munich specializing in digital twin frameworks, cyber-physical systems, and Industry 4.0 architectures. He has published over 60 peer-reviewed papers on industrial digital transformation.",
    company: "Technical University Munich",
    roleTitle: "Professor of Industrial Informatics",
    expertiseAreas: ["Digital Twin", "Industry 4.0", "Cyber-Physical Systems", "IIoT", "AI for Manufacturing"],
    location: "Munich, Germany",
    avatarUrl: null, bannerUrl: null,
    followerCount: 4209, articleCount: 34, totalViews: 312740, totalSaves: 8932,
    verifiedExpert: true, industrialCredibilityScore: 9.8, isActive: true,
    createdAt: "2023-09-01T08:00:00.000Z", updatedAt: "2026-06-20T10:00:00.000Z",
  },
];

export const MOCK_CATEGORIES: ArticleCategory[] = [
  { id: "cat-001", slug: "plc-programming",     name: "PLC Programming",        nameFa: "برنامه‌نویسی PLC",             color: "signal",      isActive: true, sortOrder: 1,  articleCount: 42, description: "Ladder logic, structured text, function block programming" },
  { id: "cat-002", slug: "scada-hmi",           name: "SCADA & HMI",            nameFa: "اسکادا و HMI",                  color: "ice",         isActive: true, sortOrder: 2,  articleCount: 38, description: "SCADA systems, HMI design, process visualization" },
  { id: "cat-003", slug: "industrial-automation",name: "Industrial Automation",  nameFa: "اتوماسیون صنعتی",               color: "signal",      isActive: true, sortOrder: 3,  articleCount: 67, description: "Automation architecture, system integration, control systems" },
  { id: "cat-004", slug: "electrical-engineering",name: "Electrical Engineering",nameFa: "مهندسی برق",                    color: "warn",        isActive: true, sortOrder: 4,  articleCount: 31, description: "Power systems, protection, HV/MV equipment" },
  { id: "cat-005", slug: "maintenance-cmms",    name: "Maintenance & CMMS",     nameFa: "نگهداری و تعمیرات",              color: "signal",      isActive: true, sortOrder: 5,  articleCount: 54, description: "Maintenance management, CMMS systems, work orders" },
  { id: "cat-006", slug: "asset-management",    name: "Asset Management",       nameFa: "مدیریت دارایی‌های صنعتی",       color: "ice",         isActive: true, sortOrder: 6,  articleCount: 29, description: "Asset lifecycle, ISO 55000, asset intelligence" },
  { id: "cat-007", slug: "predictive-maintenance",name: "Predictive Maintenance",nameFa: "نگهداری پیش‌بینانه",             color: "signal",      isActive: true, sortOrder: 7,  articleCount: 45, description: "Condition monitoring, vibration analysis, CBM" },
  { id: "cat-008", slug: "drives-motors",       name: "Drives & Motors",        nameFa: "درایوها و موتورها",               color: "warn",        isActive: true, sortOrder: 8,  articleCount: 22, description: "VFDs, AC/DC motors, drive tuning and troubleshooting" },
  { id: "cat-009", slug: "instrumentation",     name: "Instrumentation",        nameFa: "ابزار دقیق",                     color: "ice",         isActive: true, sortOrder: 9,  articleCount: 18, description: "Process instruments, calibration, field devices" },
  { id: "cat-010", slug: "industrial-networks", name: "Industrial Networks",    nameFa: "شبکه‌های صنعتی",                 color: "signal",      isActive: true, sortOrder: 10, articleCount: 26, description: "PROFINET, EtherNet/IP, OPC-UA, Modbus TCP" },
  { id: "cat-011", slug: "safety-systems",      name: "Safety Systems",         nameFa: "سیستم‌های ایمنی",                color: "danger",      isActive: true, sortOrder: 11, articleCount: 19, description: "SIL, functional safety, IEC 61511, safety PLCs" },
  { id: "cat-012", slug: "digital-twin",        name: "Digital Twin",           nameFa: "دوقلوی دیجیتال",                 color: "ice",         isActive: true, sortOrder: 12, articleCount: 23, description: "Digital twin frameworks, simulation, virtual commissioning" },
  { id: "cat-013", slug: "industrial-ai",       name: "Industrial AI",          nameFa: "هوش مصنوعی صنعتی",              color: "signal",      isActive: true, sortOrder: 13, articleCount: 31, description: "Machine learning for manufacturing, AI-driven analytics" },
  { id: "cat-014", slug: "troubleshooting",     name: "Troubleshooting",        nameFa: "عیب‌یابی",                       color: "warn",        isActive: true, sortOrder: 14, articleCount: 48, description: "Fault diagnosis, root cause analysis, troubleshooting guides" },
  { id: "cat-015", slug: "case-studies",        name: "Case Studies",           nameFa: "مطالعات موردی",                  color: "hermes-gold", isActive: true, sortOrder: 15, articleCount: 37, description: "Real-world industrial project case studies" },
  { id: "cat-016", slug: "project-reports",     name: "Project Reports",        nameFa: "گزارش پروژه",                    color: "ice",         isActive: true, sortOrder: 16, articleCount: 28, description: "Project documentation, commissioning reports, milestones" },
  { id: "cat-017", slug: "energy-utilities",    name: "Energy & Utilities",     nameFa: "انرژی و تأسیسات",                color: "signal",      isActive: true, sortOrder: 17, articleCount: 21, description: "Energy management, power quality, utilities automation" },
  { id: "cat-018", slug: "factory-operations",  name: "Factory Operations",     nameFa: "عملیات کارخانه",                 color: "ice",         isActive: true, sortOrder: 18, articleCount: 24, description: "MES, production optimization, OEE, lean manufacturing" },
  { id: "cat-019", slug: "cybersecurity-ot",    name: "Cybersecurity for OT",   nameFa: "امنیت سایبری صنعتی",             color: "danger",      isActive: true, sortOrder: 19, articleCount: 16, description: "OT cybersecurity, IEC 62443, network segmentation" },
];

export const MOCK_TAGS: ArticleTag[] = [
  { id: "tag-001", slug: "siemens-s7",       name: "Siemens S7",        nameFa: null,               articleCount: 34 },
  { id: "tag-002", slug: "tia-portal",       name: "TIA Portal",        nameFa: null,               articleCount: 28 },
  { id: "tag-003", slug: "abb-plc",          name: "ABB PLC",           nameFa: null,               articleCount: 19 },
  { id: "tag-004", slug: "opc-ua",           name: "OPC-UA",            nameFa: null,               articleCount: 23 },
  { id: "tag-005", slug: "iec-61850",        name: "IEC 61850",         nameFa: null,               articleCount: 15 },
  { id: "tag-006", slug: "profinet",         name: "PROFINET",          nameFa: null,               articleCount: 27 },
  { id: "tag-007", slug: "scada",            name: "SCADA",             nameFa: null,               articleCount: 45 },
  { id: "tag-008", slug: "hmi",              name: "HMI",               nameFa: null,               articleCount: 38 },
  { id: "tag-009", slug: "vibration-analysis",name: "Vibration Analysis",nameFa: "آنالیز ارتعاشات", articleCount: 21 },
  { id: "tag-010", slug: "industry-40",      name: "Industry 4.0",      nameFa: "صنعت ۴.۰",         articleCount: 52 },
  { id: "tag-011", slug: "digital-twin",     name: "Digital Twin",      nameFa: "دوقلوی دیجیتال",   articleCount: 31 },
  { id: "tag-012", slug: "machine-learning", name: "Machine Learning",  nameFa: null,               articleCount: 28 },
  { id: "tag-013", slug: "cmms",             name: "CMMS",              nameFa: null,               articleCount: 44 },
  { id: "tag-014", slug: "iso-55000",        name: "ISO 55000",         nameFa: null,               articleCount: 16 },
  { id: "tag-015", slug: "vfd",              name: "VFD",               nameFa: "درایو فرکانس متغیر",articleCount: 19 },
];

const cat = (slug: string) => MOCK_CATEGORIES.find(c => c.slug === slug)!;
const tags = (...slugs: string[]) => MOCK_TAGS.filter(t => slugs.includes(t.slug));
const auth = (id: string) => MOCK_AUTHORS.find(a => a.id === id)!;

const BASE: Omit<ArticleListItem, "id"|"title"|"slug"|"subtitle"|"excerpt"|"contentType"|"authorId"|"author"|"categoryId"|"category"|"tags"|"readingTimeMinutes"|"publishedAt"|"viewCount"|"saveCount"|"reactionCount"|"commentCount"|"shareCount"|"createdAt"|"updatedAt"> = {
  coverImageUrl: null,
  language: "EN",
  status: "PUBLISHED",
  visibility: "PUBLIC",
};

export const MOCK_ARTICLES: ArticleDetail[] = [
  {
    ...BASE,
    id: "art-001",
    title: "Siemens S7-1500 PLC Programming Best Practices for Industrial Automation",
    slug: "siemens-s7-1500-programming-best-practices",
    subtitle: "A comprehensive guide to structuring, documenting, and optimizing TIA Portal V18 projects for production environments",
    excerpt: "Explore proven programming patterns, naming conventions, and safety considerations for large-scale S7-1500 PLC projects in demanding industrial environments.",
    content: `# Siemens S7-1500 PLC Programming Best Practices

## Introduction

The Siemens S7-1500 PLC series represents the current benchmark for high-performance industrial automation controllers. When implementing complex automation projects using TIA Portal V18, a disciplined approach to program architecture is essential to ensure reliability, maintainability, and long-term scalability.

## Program Block Organization

Organize your program using a layered block structure. Use Organization Blocks (OBs) only for program entry points — OB1 for cyclic execution, OB35 for cyclic interrupt tasks, and hardware interrupt OBs for event-driven I/O. All business logic belongs in Function Blocks (FBs) or Functions (FCs), never directly in OBs.

A reliable naming convention is critical in multi-engineer projects. Prefix blocks by functional area: \`FB_CONVEYOR_CONTROL\`, \`FC_TEMPERATURE_SCALING\`, \`DB_CONVEYOR_01_PARAMS\`. Avoid generic names like \`FC1\` or \`FB_MAIN\` that become unmaintainable at scale.

## Safety and Fault Handling

Every FB should implement an explicit fault state. Use a \`xFault\` output BOOL combined with a \`wFaultCode\` WORD to propagate errors up the call hierarchy. Never suppress faults silently. This makes HMI integration and remote diagnostics dramatically more effective.

For fail-safe applications, use F-CPU variants and separate the standard and safety programs into distinct CPU domains. Never mix safety-rated I/O with standard I/O in the same hardware module unless the module explicitly supports mixed-mode operation.

## Communication Architecture

Use OPC-UA server functionality built into the S7-1500 for SCADA integration. Configure data access with appropriate access rights — avoid exposing write access to SCADA unless required for setpoint control. Define explicit OPC-UA node IDs in your PLC project to ensure stable SCADA tag references across firmware updates.

For inter-PLC communication in multi-CPU architectures, use S7 communication FBs (PUT/GET) only for non-critical data exchange. For synchronized production data, PROFINET IRT (Isochronous Real-Time) ensures sub-millisecond determinism.

## Conclusion

Disciplined block organization, consistent naming conventions, explicit fault propagation, and a well-structured communication architecture are the foundations of robust S7-1500 programming. These practices reduce commissioning time, minimize production stoppages, and significantly lower long-term maintenance cost.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-001",
    author: auth("author-001"),
    categoryId: "cat-001",
    category: cat("plc-programming"),
    tags: tags("siemens-s7", "tia-portal", "profinet"),
    readingTimeMinutes: 12,
    publishedAt: "2026-05-15T09:00:00.000Z",
    viewCount: 8432, saveCount: 412, reactionCount: 287, commentCount: 34, shareCount: 89,
    seoTitle: "Siemens S7-1500 PLC Programming Best Practices — Hermes Industrial Journal",
    seoDescription: "Comprehensive guide to TIA Portal V18 programming for S7-1500 PLCs: block organization, naming conventions, fault handling, and OPC-UA integration.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-05-10T08:00:00.000Z", updatedAt: "2026-05-15T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 9.1, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "AUTOMATION", linkedAssetType: "PLC", linkedFailureMode: null, linkedTechnology: "Siemens S7-1500", linkedStandard: "IEC 61131-3", linkedVendor: "Siemens", linkedPLCPlatform: "TIA Portal", linkedMaintenanceDomain: null, safetyCritical: false, humanReviewed: true },
  },
  {
    ...BASE,
    id: "art-002",
    title: "SCADA System Modernization at Tehran Refinery: A Case Study",
    slug: "scada-modernization-tehran-refinery-case-study",
    subtitle: "18-month migration from legacy DCS to modern SCADA with zero production interruption",
    excerpt: "A detailed account of how MAPNA Group replaced a 25-year-old DCS with a modern SCADA platform across a 150,000 BPD crude distillation unit, maintaining full production throughout.",
    content: `# SCADA Modernization at Tehran Refinery

## Project Background

The Tehran Refinery crude distillation unit (CDU) had been operating on a proprietary DCS installed in 1998 — a system for which spare parts were no longer manufactured and for which vendor support had ended in 2021. The decision to modernize was driven by three concurrent pressures: rising fault frequency, inability to source replacement cards, and new regulatory requirements for data logging and alarm management.

## Scope and Constraints

The project covered 4,200 I/O points across 14 field panels, 8 control rooms, and 3 compressor stations. The non-negotiable constraint was continuous operation — the CDU processes 150,000 barrels per day and an unplanned shutdown carries a revenue impact exceeding $8 million per day.

## Migration Strategy

We adopted a parallel-running strategy using a temporary marshaling cabinet approach. New SCADA I/O modules were installed in parallel to the existing DCS I/O, sharing the same field wiring through junction boxes. This allowed both systems to read the same field signals simultaneously.

Migration was executed in 14 phases — one functional area per phase — with each phase running on the new system in monitoring-only mode for 72 hours before the old system was disconnected from that section. Control switchover for each section was performed during planned rate reduction windows.

## Results

The migration completed in 18 months with zero unplanned shutdowns. Total project cost was $4.2 million against an estimated cost of $9.1 million for a traditional shutdown-based migration. MTTR for instrumentation faults improved by 61% due to the new system's integrated diagnostic capability.

## Lessons Learned

Invest 25% of the project budget in pre-engineering. A thorough P&ID review before any hardware is purchased eliminates the majority of field surprises. Ensure your SCADA vendor has experience with parallel migration — not all vendors support dual-running configurations.`,
    contentType: "INDUSTRIAL_CASE_STUDY",
    authorId: "author-003",
    author: auth("author-003"),
    categoryId: "cat-015",
    category: cat("case-studies"),
    tags: tags("scada", "hmi", "industry-40"),
    readingTimeMinutes: 15,
    publishedAt: "2026-05-22T10:00:00.000Z",
    viewCount: 12840, saveCount: 891, reactionCount: 524, commentCount: 67, shareCount: 213,
    seoTitle: "SCADA Modernization Case Study — Tehran Refinery — Hermes Industrial Journal",
    seoDescription: "18-month SCADA migration case study at Tehran Refinery: zero-interruption DCS replacement strategy, 150,000 BPD unit, $4.2M project cost.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-05-18T08:00:00.000Z", updatedAt: "2026-05-22T10:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: true, articleQualityScore: 9.7, sourceReliability: "VERY_HIGH", evidenceLevel: "FIELD_VERIFIED", industrialDomain: "PROCESS", linkedAssetType: "SCADA_NODE", linkedFailureMode: null, linkedTechnology: "SCADA", linkedStandard: null, linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: null, safetyCritical: true, humanReviewed: true },
  },
  {
    ...BASE,
    id: "art-003",
    title: "Predictive Maintenance Using Vibration Analysis: 18-Month Field Results",
    slug: "predictive-maintenance-vibration-analysis-field-results",
    subtitle: "Quantified outcomes from deploying online vibration monitoring across 64 rotating machines at a steel mill",
    excerpt: "After 18 months of continuous vibration monitoring on 64 critical rotating assets, we present the fault detection rates, false alarm rates, and maintenance cost savings achieved at Mobarakeh Steel Company.",
    content: `# Predictive Maintenance — 18-Month Vibration Monitoring Results

## Background

Mobarakeh Steel Company operates over 800 rotating machines across its hot rolling, cold rolling, and slab casting facilities. Traditional time-based maintenance was generating significant costs without adequate fault prevention. In early 2024, we deployed online vibration monitoring sensors across 64 critical assets identified through criticality ranking.

## Sensor Configuration

Each machine was fitted with triaxial MEMS accelerometers at bearing locations, with 4–8 measurement points per machine depending on machine type. Data collection occurs at 25.6 kHz for spectral analysis and 1 kHz for overall RMS trending. All data streams to an on-premise edge server running ISO 10816-compliant alarm thresholds.

## Results After 18 Months

Out of 64 monitored assets, the system successfully detected early-stage defects in 31 cases before they reached the P-F interval threshold. Of these 31 early detections, 28 were confirmed fault conditions at inspection — a 90.3% precision rate.

False alarm rate was 9.7%, which required calibration of alarm thresholds for specific high-speed machines where normal operation produces broadband vibration signatures that triggered generic ISO alarms.

The most significant result was three avoided catastrophic failures in gearboxes driving roughing mill stands — failures that historically cause 14–21 day unplanned downtime events. Conservative savings from avoided downtime alone: $3.2M.

## Challenges

Collecting meaningful baseline data required a minimum 6-week run period after installation, during which the system operated in data collection mode only. Multi-speed machines with variable load profiles required multi-baseline configurations — a feature not available in the initial software version.

## Recommendation

Online vibration monitoring delivers measurable value only when combined with a disciplined response process. Detecting faults early has no value if maintenance planning cannot act within the P-F interval. Integrate your monitoring system directly with your CMMS work order engine.`,
    contentType: "MAINTENANCE_INSIGHT",
    authorId: "author-003",
    author: auth("author-003"),
    categoryId: "cat-007",
    category: cat("predictive-maintenance"),
    tags: tags("vibration-analysis", "cmms", "iso-55000"),
    readingTimeMinutes: 18,
    publishedAt: "2026-06-01T09:00:00.000Z",
    viewCount: 9821, saveCount: 743, reactionCount: 398, commentCount: 52, shareCount: 167,
    seoTitle: "Predictive Maintenance Vibration Analysis — 18 Month Field Results",
    seoDescription: "Field results from 18 months of online vibration monitoring on 64 rotating machines at Mobarakeh Steel: 90.3% precision, $3.2M avoided downtime.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-05-25T08:00:00.000Z", updatedAt: "2026-06-01T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: true, articleQualityScore: 9.5, sourceReliability: "VERY_HIGH", evidenceLevel: "FIELD_VERIFIED", industrialDomain: "MAINTENANCE", linkedAssetType: "MOTOR", linkedFailureMode: "BEARING_FAILURE", linkedTechnology: "Vibration Monitoring", linkedStandard: "ISO 10816", linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: "Predictive", safetyCritical: false, humanReviewed: true },
  },
  {
    ...BASE,
    id: "art-004",
    title: "IEC 61850 Protocol Implementation in Electrical Substation Protection",
    slug: "iec-61850-substation-protection-implementation",
    subtitle: "Practical implementation guide for GOOSE messaging and sampled values in modern protection schemes",
    excerpt: "A step-by-step guide to IEC 61850 implementation in high-voltage substation automation systems, covering GOOSE messaging, sampled values, and IED configuration using SCL files.",
    content: `# IEC 61850 in Substation Protection Systems

## Why IEC 61850?

The IEC 61850 standard defines a communication architecture for electrical substations that replaces hardwired protection schemes and proprietary communication protocols with standardized digital communication. The primary benefits are elimination of copper wiring between IEDs, interoperability between vendors, and standardized configuration through SCL files.

## GOOSE Messaging for Protection

GOOSE (Generic Object-Oriented Substation Event) messages provide sub-4ms latency for protection-critical signals — a requirement that conventional TCP/IP cannot satisfy. Implementing GOOSE requires careful attention to VLAN configuration, multicast filtering, and redundant Ethernet paths using HSR or PRP protocols.

Each protection IED publishes a GOOSE dataset containing protection status bits, fault values, and interlocking signals. Subscribing IEDs must be configured with the publisher's dataset structure — this is managed through the SCD (Substation Configuration Description) file.

## SCL Configuration Workflow

1. Define the substation topology in the SSD (System Specification Description) file
2. Import vendor-specific ICD (IED Capability Description) files for each protection relay
3. Configure logical nodes and datasets in the SCD tool
4. Export device-specific CID (Configured IED Description) files for each relay
5. Commission and test each GOOSE subscription using a GOOSE analyzer tool

## Sampled Values for Merging Units

Non-conventional instrument transformers (NCITs) output digital sampled values using IEC 61850-9-2 — a significant change from conventional CT/VT circuits. The merging unit (MU) aggregates voltage and current samples at 80 or 256 samples per cycle and publishes them on the process bus.

Protection relays subscribing to sampled values must be synchronized using IEEE 1588 PTP — clock accuracy better than 1μs is required for differential protection applications.

## Commissioning Observations

The most frequent commissioning issue is incorrect APPID configuration — duplicate APPIDs on the same Ethernet segment cause GOOSE message conflicts that are difficult to diagnose without a dedicated IEC 61850 protocol analyzer. Always validate the APPID allocation in the SCD before any physical commissioning.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-005",
    author: auth("author-005"),
    categoryId: "cat-004",
    category: cat("electrical-engineering"),
    tags: tags("iec-61850", "scada"),
    readingTimeMinutes: 14,
    publishedAt: "2026-05-28T11:00:00.000Z",
    viewCount: 6219, saveCount: 521, reactionCount: 312, commentCount: 28, shareCount: 94,
    seoTitle: "IEC 61850 Implementation Guide — Substation Protection — Hermes Journal",
    seoDescription: "Practical IEC 61850 implementation guide: GOOSE messaging, sampled values, SCL configuration workflow, and commissioning observations for HV substations.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-05-20T08:00:00.000Z", updatedAt: "2026-05-28T11:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 8.8, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "ELECTRICAL", linkedAssetType: "ELECTRICAL_PANEL", linkedFailureMode: null, linkedTechnology: "IEC 61850", linkedStandard: "IEC 61850", linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: null, safetyCritical: true, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-005",
    title: "VFD Motor Overheating in High-Temperature Environments: Root Cause and Solutions",
    slug: "vfd-motor-overheating-high-temperature-troubleshooting",
    subtitle: "Systematic fault diagnosis for recurring motor thermal trips in a desert cement plant",
    excerpt: "A troubleshooting case study of recurring thermal overload trips on 250kW VFD-driven kiln auxiliary motors operating in 52°C ambient conditions.",
    content: `# VFD Motor Overheating Troubleshooting

## Fault Description

A cement plant in Bandar Abbas, Iran, experienced recurring thermal overload trips on five 250kW squirrel-cage induction motors driving kiln auxiliary fans. The trips occurred exclusively during afternoon shifts when ambient temperature exceeded 48°C, despite the motors being rated for 55°C ambient.

## Initial Investigation

Standard troubleshooting — checking motor winding insulation resistance, verifying VFD carrier frequency settings, and inspecting cooling ducts — revealed no obvious deficiencies. Motor temperatures at the time of trip were measured at 84°C on the frame, below the Class F insulation limit of 155°C.

## Root Cause: VFD Carrier Frequency and Harmonic Heating

Thermal imaging during operation revealed non-uniform hotspots in stator windings — characteristic of harmonic-induced eddy current losses. The VFDs were operating at 8 kHz carrier frequency to reduce audible noise. At this carrier frequency, the PWM output generates significant 5th and 7th harmonic currents that do not appear in standard protection CT measurements but cause measurable additional heating in the stator core.

Reducing carrier frequency to 4 kHz reduced stator temperature by 11°C and eliminated the trips. The trade-off — increased audible noise — was accepted since the motors are located in an enclosed fan house with restricted access.

## Secondary Finding: Motor Derating

Motors operated through VFDs in high-ambient environments must be derated. The manufacturer's derating curve showed a 12% torque derating at 52°C when operating at speeds below 25Hz. The affected motors were running at 18–22Hz for 60% of the day — precisely in the derating zone — during periods when the process required reduced airflow.

## Resolution Summary

1. Reduce VFD carrier frequency from 8kHz to 4kHz
2. Apply manufacturer derating curve to VFD current limit settings
3. Install auxiliary motor frame cooling fans for operation below 30Hz
4. Set thermal model pre-trip alarm at 70% to allow operator intervention

## Lessons

Thermal overload relays in VFD systems measure output current only. They cannot detect harmonic heating contributions. For motors operating in adverse ambient conditions, a combination of thermal imaging, winding temperature probes (PT100 or NTC), and VFD thermal model parameters is required for reliable protection.`,
    contentType: "TROUBLESHOOTING_REPORT",
    authorId: "author-002",
    author: auth("author-002"),
    categoryId: "cat-008",
    category: cat("drives-motors"),
    tags: tags("vfd"),
    readingTimeMinutes: 10,
    publishedAt: "2026-06-05T09:00:00.000Z",
    viewCount: 7341, saveCount: 589, reactionCount: 423, commentCount: 41, shareCount: 128,
    seoTitle: "VFD Motor Overheating Troubleshooting — Desert Climate — Hermes Journal",
    seoDescription: "Root cause analysis of VFD-driven motor thermal trips in 52°C ambient: carrier frequency harmonics, derating curves, and solutions for harsh environments.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-05-30T08:00:00.000Z", updatedAt: "2026-06-05T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: true, articleQualityScore: 9.2, sourceReliability: "VERY_HIGH", evidenceLevel: "FIELD_VERIFIED", industrialDomain: "DRIVES", linkedAssetType: "VFD", linkedFailureMode: "THERMAL_OVERLOAD", linkedTechnology: "VFD", linkedStandard: null, linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: "Corrective", safetyCritical: false, humanReviewed: true },
  },
  {
    ...BASE,
    id: "art-006",
    title: "OPC-UA Server Implementation for Real-Time Process Data Integration",
    slug: "opc-ua-server-implementation-process-integration",
    subtitle: "Building a secure, scalable OPC-UA server architecture for plant-wide data integration",
    excerpt: "A practical guide to implementing OPC-UA servers in industrial environments: address space design, security model selection, session management, and performance tuning for high-tag-count deployments.",
    content: `# OPC-UA Implementation for Plant-Wide Integration

## Architecture Overview

OPC-UA (IEC 62541) has become the de facto standard for plant-wide data integration, replacing OPC-DA COM/DCOM with a platform-independent, security-capable protocol. A well-designed OPC-UA architecture separates PLC-level data sources (via OPC-UA servers embedded in PLCs or gateway software) from plant-level consumers (historians, MES, SCADA, ERP).

## Address Space Design

The OPC-UA address space is a semantic model, not a flat tag list. Organize nodes in a hierarchy that mirrors physical plant structure: Plant > Area > Unit > Equipment > Parameter. This enables client discovery without prior configuration knowledge and supports OPC-UA's built-in browsing capability.

Avoid excessively deep hierarchies — more than 6 levels creates navigation performance issues. Use Organizes and HasComponent references appropriately. Always assign meaningful BrowseNames and DisplayNames; OPC-UA clients display these in engineering interfaces.

## Security Configuration

OPC-UA security modes:
- **None**: Only for development/test networks; never in production
- **Sign**: Message signing without encryption; acceptable for internal plant networks behind a firewall
- **SignAndEncrypt**: Full encryption using TLS 1.2/1.3; mandatory for internet-facing or cross-site communication

Configure certificate-based authentication for all production deployments. Self-signed certificates are acceptable for plant-local deployments; use a PKI with a plant CA for multi-site environments.

## Performance Tuning

For high-tag-count deployments (>10,000 tags), configure subscription monitoring intervals no faster than required. A 1-second publish interval with 500ms monitoring interval is appropriate for process variables; 100ms is rarely justified and increases server CPU load significantly.

Enable server-side value filtering to prevent unnecessary notifications for unchanged values. This alone typically reduces network traffic by 70% on a stable process.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-002",
    author: auth("author-002"),
    categoryId: "cat-010",
    category: cat("industrial-networks"),
    tags: tags("opc-ua", "scada", "profinet"),
    readingTimeMinutes: 11,
    publishedAt: "2026-06-08T10:00:00.000Z",
    viewCount: 5928, saveCount: 467, reactionCount: 289, commentCount: 23, shareCount: 102,
    seoTitle: "OPC-UA Server Implementation Guide — Industrial Process Integration",
    seoDescription: "Practical OPC-UA server architecture guide: address space design, security model selection, and performance tuning for plant-wide industrial data integration.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-02T08:00:00.000Z", updatedAt: "2026-06-08T10:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 8.6, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "NETWORKS", linkedAssetType: "SCADA_NODE", linkedFailureMode: null, linkedTechnology: "OPC-UA", linkedStandard: "IEC 62541", linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: null, safetyCritical: false, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-007",
    title: "AI-Driven Anomaly Detection in Gas Turbine Systems",
    slug: "ai-anomaly-detection-gas-turbine",
    subtitle: "How machine learning models are transforming early fault detection in multi-variable turbine sensor streams",
    excerpt: "We describe the architecture and 6-month operational results of an LSTM-based anomaly detection model deployed on a 50MW gas turbine, achieving 94% fault detection recall with a 2.1% false positive rate.",
    content: `# AI-Driven Anomaly Detection for Gas Turbines

## Motivation

Gas turbines in power generation and oil & gas applications generate thousands of sensor streams — temperatures, vibrations, pressures, flow rates, and shaft dynamics — sampled at 1Hz to 100Hz depending on the parameter. Human operators and threshold-based alarms cannot process this data density effectively. Machine learning offers the ability to model normal turbine behavior and detect deviations that precede failures.

## Model Architecture

We deployed a Long Short-Term Memory (LSTM) autoencoder architecture. The encoder compresses a 120-second sliding window of 148 normalized sensor streams into a 32-dimensional latent representation. The decoder reconstructs the original window, and the reconstruction error provides the anomaly score.

The model was trained on 14 months of normal operation data — approximately 9,800 hours of labeled healthy operation. Training was performed offline on a GPU cluster; inference runs on an on-premise edge server (Intel Xeon Silver, no GPU required) at 300ms latency per prediction cycle.

## 6-Month Operational Results

In a 6-month validation period, the model processed 4,320 hours of operational data. 23 actual fault conditions were recorded (verified through maintenance records). The model detected 22 of 23 faults with a median lead time of 18 hours before operator or threshold alarm — time sufficient for planned maintenance intervention.

False positive rate was 2.1%, generating 94 spurious anomaly alerts over the 6-month period. These were primarily associated with non-fault operational transitions (planned load changes, startup sequences) that the model had not seen in sufficient variety during training.

## Integration Considerations

The anomaly score is published via OPC-UA to the plant DCS/SCADA as a standard analog tag. The system does not generate work orders automatically — all alerts require human verification before maintenance action. This deliberate design choice reflects the current state of model confidence and regulatory requirements for critical equipment.

## Future Work

The next phase will integrate failure mode classification — not just anomaly detection, but labeling the likely fault type from the sensor pattern. This requires labeled fault data, which is being collected systematically from the maintenance verification process.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-004",
    author: auth("author-004"),
    categoryId: "cat-013",
    category: cat("industrial-ai"),
    tags: tags("machine-learning", "industry-40", "digital-twin"),
    readingTimeMinutes: 16,
    publishedAt: "2026-06-10T09:00:00.000Z",
    viewCount: 14521, saveCount: 1243, reactionCount: 798, commentCount: 89, shareCount: 342,
    seoTitle: "AI Anomaly Detection Gas Turbine — LSTM Model Field Results",
    seoDescription: "LSTM autoencoder for gas turbine anomaly detection: 94% recall, 2.1% false positive, 18-hour lead time. 6-month field results from 50MW turbine deployment.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-05T08:00:00.000Z", updatedAt: "2026-06-10T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: true, articleQualityScore: 9.8, sourceReliability: "VERY_HIGH", evidenceLevel: "FIELD_VERIFIED", industrialDomain: "AI", linkedAssetType: "COMPRESSOR", linkedFailureMode: null, linkedTechnology: "LSTM / AI", linkedStandard: null, linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: "Predictive", safetyCritical: false, humanReviewed: true },
  },
  {
    ...BASE,
    id: "art-008",
    title: "Digital Twin for Pump Station: ROI Analysis After 24 Months",
    slug: "digital-twin-pump-station-roi-analysis",
    subtitle: "Quantified return on investment from a high-fidelity pump station digital twin with real-time hydraulic simulation",
    excerpt: "We present the 24-month ROI analysis for a digital twin deployed at an 8-pump water transmission station, covering energy savings, predictive maintenance impact, and operator training outcomes.",
    content: `# Digital Twin ROI Analysis — 24 Month Review

## Twin Architecture

The digital twin for Mashhad Water Authority's Golshan pump station consists of a high-fidelity hydraulic simulation model (200ms update cycle) synchronized with the real pump station via OPC-UA data bridges. The model computes hydraulic efficiency, wear-adjusted performance curves, and optimal pump staging configurations in real time.

## Energy Optimization: €240k/year Savings

The twin's optimization engine continuously recommends the optimal combination of active pumps and speed setpoints for the required flow rate. During the first 24 months, implementing these recommendations reduced station energy consumption by 18.3%, translating to €240k/year savings at current electricity tariffs.

## Predictive Maintenance Impact

The hydraulic simulation flags performance curve deviations that indicate impeller wear or seal degradation before vibration sensors detect anomalies. In 24 months, this capability generated 7 early maintenance interventions that avoided 3 pump failures — the 3 avoided failures had an estimated combined repair cost of €180k.

## Operator Training Value

The digital twin runs in simulation mode disconnected from live data, enabling realistic operator training scenarios including abnormal conditions (pipe burst, pump cavitation, check valve failure). Training time for new operators was reduced from 6 months to 11 weeks. Two near-miss incidents were attributed to operator training exercises that could not have been performed safely on the live station.

## Total 24-Month ROI

- Energy savings: €480k
- Avoided failure costs: €180k
- Training cost reduction: €42k
- Implementation cost: €380k

Net ROI at 24 months: 7.4x (742% return on investment)`,
    contentType: "INDUSTRIAL_CASE_STUDY",
    authorId: "author-006",
    author: auth("author-006"),
    categoryId: "cat-012",
    category: cat("digital-twin"),
    tags: tags("digital-twin", "industry-40", "opc-ua"),
    readingTimeMinutes: 14,
    publishedAt: "2026-06-12T09:00:00.000Z",
    viewCount: 11243, saveCount: 934, reactionCount: 612, commentCount: 78, shareCount: 287,
    seoTitle: "Digital Twin Pump Station ROI — 24 Month Analysis — Hermes Journal",
    seoDescription: "24-month ROI analysis of pump station digital twin: 18.3% energy savings, €480k total savings, 7.4x ROI. Real-time hydraulic simulation integration.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-08T08:00:00.000Z", updatedAt: "2026-06-12T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: true, articleQualityScore: 9.6, sourceReliability: "VERY_HIGH", evidenceLevel: "FIELD_VERIFIED", industrialDomain: "DIGITAL_TWIN", linkedAssetType: "PUMP", linkedFailureMode: "IMPELLER_WEAR", linkedTechnology: "Digital Twin / OPC-UA", linkedStandard: "ISO 55000", linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: "Predictive", safetyCritical: false, humanReviewed: true },
  },
  {
    ...BASE,
    id: "art-009",
    title: "OT Cybersecurity Implementation: Protecting SCADA from Modern Threats",
    slug: "ot-cybersecurity-scada-protection",
    subtitle: "Practical IEC 62443 implementation guide for operational technology environments",
    excerpt: "A field-tested framework for implementing IEC 62443-compliant cybersecurity across an industrial control system — from network segmentation through endpoint hardening to incident response procedures.",
    content: `# OT Cybersecurity: IEC 62443 Implementation

## The OT Threat Landscape

Industrial control systems face a fundamentally different threat model than IT environments. The consequences of a successful attack are not just data loss but physical process disruption, safety system compromise, and in critical infrastructure, potential harm to personnel and communities. The 2021 Oldsmar water treatment incident and 2022 attacks on European energy infrastructure underscore that these threats are active and escalating.

## IEC 62443 Zone and Conduit Model

IEC 62443 organizes ICS security around Zones (groups of assets with similar security requirements) and Conduits (communication paths between zones). This model replaces the flat "IT/OT boundary" thinking with a defense-in-depth architecture.

Typical zone structure: Corporate IT Zone → DMZ → Control Center Zone → Control System Zone → Field Device Zone. Each boundary enforces specific security controls — not just firewall rules but also communication protocol whitelisting, authentication requirements, and monitoring.

## Network Segmentation in Practice

In a typical SCADA architecture, legacy field devices (PLCs, RTUs, IEDs) were connected to a flat control LAN with no segmentation. Retrofitting proper segmentation requires:

1. Network discovery and documentation of all existing communication paths
2. Firewall or unidirectional gateway installation at zone boundaries
3. Protocol-aware deep packet inspection for ICS protocols (Modbus, DNP3, IEC 61850)
4. Out-of-band network management (dedicated management VLAN)
5. Passive monitoring and anomaly detection on control LAN traffic

## Endpoint Hardening

PLC/RTU hardening is constrained by vendor support and operational availability. Achievable measures include: disabling unused communication services, enforcing strong authentication for engineering tool access, implementing firmware integrity verification, and regular vulnerability scanning against vendor advisories.

## Conclusion

OT cybersecurity is not a product — it is a program. Effective protection requires governance, continuous monitoring, and a response capability. Technology alone is insufficient without trained personnel and tested incident response procedures.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-004",
    author: auth("author-004"),
    categoryId: "cat-019",
    category: cat("cybersecurity-ot"),
    tags: tags("scada", "industry-40"),
    readingTimeMinutes: 13,
    publishedAt: "2026-06-15T10:00:00.000Z",
    viewCount: 8932, saveCount: 721, reactionCount: 489, commentCount: 56, shareCount: 198,
    seoTitle: "OT Cybersecurity SCADA Protection — IEC 62443 Guide — Hermes Journal",
    seoDescription: "IEC 62443 implementation guide for OT/SCADA cybersecurity: zone and conduit model, network segmentation, endpoint hardening, and incident response.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-10T08:00:00.000Z", updatedAt: "2026-06-15T10:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 9.0, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "CYBERSECURITY", linkedAssetType: "SCADA_NODE", linkedFailureMode: null, linkedTechnology: "IEC 62443", linkedStandard: "IEC 62443", linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: null, safetyCritical: true, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-010",
    title: "The Future of Industrial AI: From Rule-Based Systems to Cognitive Automation",
    slug: "future-industrial-ai-cognitive-automation",
    subtitle: "An engineering perspective on where machine intelligence in industrial systems is heading — and what it means for the engineering profession",
    excerpt: "As machine learning models move from anomaly detection into process optimization and autonomous decision-making, the role of the industrial engineer is evolving from system operator to AI system overseer. This piece examines the trajectory.",
    content: `# The Future of Industrial AI

## Where We Are Today

Industrial AI today is predominantly diagnostic — detecting anomalies, classifying fault modes, predicting remaining useful life of assets. These applications are mature, deployable, and generating measurable ROI. The underlying models (LSTM autoencoders, random forests, gradient boosting) are well understood by practitioners and increasingly supported by industrial platform vendors.

## What's Coming: Process Optimization AI

The next wave is prescriptive AI — systems that not only detect what is wrong but recommend and, increasingly, autonomously implement corrective actions. In process industries, this means AI that adjusts setpoints in real time to optimize yield, energy consumption, and product quality simultaneously — replacing static model predictive control (MPC) with adaptive neural controllers.

Early deployments in petrochemical distillation columns are already demonstrating 3–7% yield improvements through neural-network-based advanced process control. The constraint isn't the AI — it's the regulatory and operational framework for autonomous control actions.

## The Safety-Autonomy Boundary

The most significant engineering challenge for the next decade is defining the appropriate boundary between AI-driven autonomy and human oversight in safety-critical industrial systems. IEC 62061 and IEC 61511 functional safety standards were not written with AI actors in mind. The industry needs updated standards and validation frameworks before autonomous AI control of SIL-rated safety functions becomes acceptable.

## What This Means for Engineers

The industrial engineer of 2030 will spend less time configuring control loops and more time training and validating AI systems, managing the human-AI interface, and maintaining the data infrastructure that AI depends on. This is not the end of engineering — it is an elevation of the role from system operator to system designer and AI overseer.

The engineers who will be most valuable are those who understand both the industrial process deeply and the AI techniques sufficiently to evaluate whether an AI recommendation is physically plausible — not just statistically derived. This combination of domain expertise and AI literacy will define the next generation of industrial engineering leadership.`,
    contentType: "ENGINEERING_OPINION",
    authorId: "author-006",
    author: auth("author-006"),
    categoryId: "cat-013",
    category: cat("industrial-ai"),
    tags: tags("industry-40", "machine-learning", "digital-twin"),
    readingTimeMinutes: 9,
    publishedAt: "2026-06-20T09:00:00.000Z",
    viewCount: 18742, saveCount: 2134, reactionCount: 1423, commentCount: 143, shareCount: 589,
    seoTitle: "Future of Industrial AI — Cognitive Automation — Engineering Opinion",
    seoDescription: "Engineering perspective on the trajectory of industrial AI: from anomaly detection to autonomous process control, and what it means for industrial engineers.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-18T08:00:00.000Z", updatedAt: "2026-06-20T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 8.9, sourceReliability: "HIGH", evidenceLevel: "EXPERT_OPINION", industrialDomain: "AI", linkedAssetType: null, linkedFailureMode: null, linkedTechnology: "Industrial AI", linkedStandard: null, linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: null, safetyCritical: false, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-011",
    title: "Failure Analysis: Catastrophic Bearing Failure in a 2.2MW Induction Motor",
    slug: "bearing-failure-analysis-2mw-induction-motor",
    subtitle: "Detailed metallurgical and operational root cause analysis of a catastrophic motor bearing failure at a cement kiln",
    excerpt: "Analysis of a catastrophic bearing failure in a 2.2MW motor that caused a 4-day production stoppage. Root cause: electrical discharge machining (EDM) damage from inverter-induced shaft currents.",
    content: `# Bearing Failure Analysis — 2.2MW Induction Motor

## Incident Description

A 2.2MW, 6kV induction motor driving a cement kiln main drive failed catastrophically during the night shift on March 14th, 2026. The failure resulted in total seizure of the NDE bearing with secondary thermal damage to the motor housing. Production downtime: 4 days, 6 hours. Estimated production loss: $1.8M.

## Metallurgical Analysis

Bearing inner race examination revealed characteristic pitting consistent with electrical discharge machining (EDM) — a pattern of small, regularly-spaced craters on the bearing raceway surface produced by electrical arcing through the bearing rolling elements.

SEM analysis of the raceway surface confirmed molten metal resolidification patterns at crater boundaries — definitive evidence of arc discharge rather than mechanical fatigue or lubrication failure. Lubricant analysis showed metal particle contamination consistent with progressive bearing erosion over approximately 3–6 months before failure.

## Root Cause: Shaft Currents from VFD Operation

The motor had been retrofitted with a Siemens G120X VFD drive 14 months prior to failure as part of an energy efficiency project. The VFD generates common-mode voltage through its PWM switching, which couples to the rotor shaft through motor winding-to-frame capacitance, creating shaft voltages.

When shaft voltage exceeds the lubricant film dielectric strength, discharge occurs through the bearing rolling elements. In this motor, the shaft-to-frame voltage was measured post-failure at 11.5V peak — exceeding the bearing lubricant film threshold of ~8V.

## Corrective Actions

1. Install insulated bearing on the NDE bearing position (SKF INSOCOAT or equivalent)
2. Install shaft grounding ring on DE shaft end (Aegis SGR or equivalent)
3. Apply common-mode choke at VFD output — reduces shaft voltage by 60–80%
4. Add online shaft current measurement for the remaining similar motors

## Recommendations for Similar Installations

Any motor >75kW retrofitted with a VFD should be assessed for shaft current mitigation. The incremental cost of protection (insulated bearing + shaft grounding ring) is approximately $800–1,200 per motor. The cost of one bearing EDM failure in a critical motor vastly exceeds this investment.`,
    contentType: "FAILURE_ANALYSIS",
    authorId: "author-003",
    author: auth("author-003"),
    categoryId: "cat-005",
    category: cat("maintenance-cmms"),
    tags: tags("vfd", "vibration-analysis", "cmms"),
    readingTimeMinutes: 12,
    publishedAt: "2026-06-18T10:00:00.000Z",
    viewCount: 9871, saveCount: 876, reactionCount: 634, commentCount: 73, shareCount: 241,
    seoTitle: "Bearing Failure Analysis 2.2MW Motor — EDM Shaft Currents — Hermes Journal",
    seoDescription: "Root cause analysis of catastrophic bearing failure in VFD-driven 2.2MW induction motor: EDM damage from shaft currents, metallurgical evidence, and prevention.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-14T08:00:00.000Z", updatedAt: "2026-06-18T10:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: true, articleQualityScore: 9.7, sourceReliability: "VERY_HIGH", evidenceLevel: "FIELD_VERIFIED", industrialDomain: "MAINTENANCE", linkedAssetType: "MOTOR", linkedFailureMode: "BEARING_FAILURE", linkedTechnology: "VFD / Bearings", linkedStandard: null, linkedVendor: "Siemens", linkedPLCPlatform: null, linkedMaintenanceDomain: "Corrective", safetyCritical: false, humanReviewed: true },
  },
  {
    ...BASE,
    id: "art-012",
    title: "Safety Integrity Level Verification: Step-by-Step Process for Process Plants",
    slug: "sil-verification-process-plants-guide",
    subtitle: "A practical walkthrough of SIL verification according to IEC 61511 for a high-pressure emergency shutdown system",
    excerpt: "Walk through the complete SIL verification process for a high-pressure ESD valve system: LOPA analysis, SIL determination, PFD calculation, and IEC 61511 documentation requirements.",
    content: `# SIL Verification for Process Plant ESD Systems

## Why SIL Verification?

IEC 61511 requires that Safety Instrumented Functions (SIFs) in process plants achieve their required Safety Integrity Level through a rigorous verification process. SIL verification is not a certification — it is a quantitative demonstration that the designed SIF achieves the required Probability of Failure on Demand (PFD).

## Case Study: High-Pressure Reactor ESD

The subject SIF is an Emergency Shutdown function that closes an isolation valve on the feed line of a high-pressure polymerization reactor when pressure exceeds 185 bar (set point). The consequence of unmitigated overpressure is catastrophic vessel rupture. LOPA analysis determined a required SIL 2 function (PFD ≤ 0.01).

## LOPA Analysis

Layer of Protection Analysis identified three initiating causes for reactor overpressure and the available independent protection layers:
1. Basic process control (BPCS): PFD 0.1
2. High pressure alarm + operator response: PFD 0.1
3. SIF (subject of verification): required to achieve total PFD ≤ 0.001 from the identified scenarios

## PFD Calculation

The SIF architecture: 1oo2 pressure transmitters → Safety PLC (SIL 2 rated) → solenoid valve → actuated isolation valve.

PFD calculation using reliability block diagram method:
- Each pressure transmitter: PFDavg = 0.005 (from vendor FMEDA, 1-year proof test interval)
- 1oo2 architecture transmitters: PFDavg = 2 × (0.005)² = 5×10⁻⁵
- Safety PLC: PFDavg = 0.0015 (vendor SIL 2 certificate, TÜV verified)
- Valve + solenoid: PFDavg = 0.006 (from plant maintenance history)
- Total SIF PFDavg: ~0.0076 ✓ (within SIL 2 range of 0.001–0.01)

## Documentation Requirements

IEC 61511 requires: Safety Requirements Specification, SIL verification report (including assumptions and calculation basis), proof test procedures, and a functional safety assessment by a competent authority.

The proof test procedure must verify the entire SIF — not just the safety PLC — including the field transmitters and final element. Document proof test coverage factor for each component.`,
    contentType: "SAFETY_COMPLIANCE_NOTE",
    authorId: "author-005",
    author: auth("author-005"),
    categoryId: "cat-011",
    category: cat("safety-systems"),
    tags: tags("scada"),
    readingTimeMinutes: 16,
    publishedAt: "2026-06-22T09:00:00.000Z",
    viewCount: 4821, saveCount: 612, reactionCount: 298, commentCount: 31, shareCount: 156,
    seoTitle: "SIL Verification Process Plants IEC 61511 — Step by Step Guide",
    seoDescription: "Complete SIL verification walkthrough for process plant ESD systems: LOPA analysis, SIL 2 PFD calculation, architecture selection, and IEC 61511 documentation.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-18T08:00:00.000Z", updatedAt: "2026-06-22T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 9.3, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "SAFETY", linkedAssetType: "SAFETY_SYSTEM", linkedFailureMode: null, linkedTechnology: "Safety PLC / ESD", linkedStandard: "IEC 61511", linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: null, safetyCritical: true, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-013",
    title: "TIA Portal V18: Key New Features for Advanced PLC Programming",
    slug: "tia-portal-v18-new-features-plc-programming",
    subtitle: "Deep-dive into the most impactful features added in TIA Portal V18 for S7-1500 and ET 200SP applications",
    excerpt: "TIA Portal V18 introduces significant improvements to project management, safety programming, and simulation that reduce commissioning time and improve code maintainability for large-scale automation projects.",
    content: `# TIA Portal V18 — What's New for Automation Engineers

## Multi-User Engineering

Version 18 introduces proper multi-user engineering support — multiple engineers can now work on different parts of the same TIA Portal project simultaneously, with merge and conflict resolution capabilities. This fundamentally changes the development workflow for large projects where the single-user project file limitation was a significant bottleneck.

The multi-user server is installed separately on a central server. Each engineer checks out the components they're working on. Conflict resolution uses a visual diff tool. This isn't perfect — the tooling is less mature than what software developers are used to — but it's a substantial step forward.

## SIMATIC Safety V19 Integration

Safety programming in V18 benefits from improved code analysis tools that flag potential safety-program violations during compilation. The new Safety Code Analyzer identifies common mistakes: unsafe data type conversions, missing OB error handlers in F-CPU programs, and incorrect use of F-I/O in standard programs.

For large projects with >200 F-tags, the significantly improved compilation speed (50–70% faster than V17) is a meaningful productivity improvement.

## S7-PLCSIM Advanced v5

The simulation environment gets enhanced hardware-in-the-loop (HIL) support. You can now co-simulate TIA Portal programs with external simulation tools via a PLCSIM Advanced API, enabling realistic virtual commissioning workflows where the PLC program interacts with a simulated process model.

## Verdict

V18 is a meaningful release, not just an incremental update. Multi-user engineering alone justifies the upgrade for teams of >3 engineers. Start with a pilot project before migrating existing production projects — some block library changes require manual adaptation.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-001",
    author: auth("author-001"),
    categoryId: "cat-001",
    category: cat("plc-programming"),
    tags: tags("tia-portal", "siemens-s7", "profinet"),
    readingTimeMinutes: 9,
    publishedAt: "2026-06-24T09:00:00.000Z",
    viewCount: 7432, saveCount: 634, reactionCount: 421, commentCount: 49, shareCount: 178,
    seoTitle: "TIA Portal V18 New Features — S7-1500 PLC — Hermes Industrial Journal",
    seoDescription: "Key TIA Portal V18 features: multi-user engineering, Safety V19 integration, PLCSIM Advanced v5 HIL simulation. What's new and worth upgrading for.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-20T08:00:00.000Z", updatedAt: "2026-06-24T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 8.4, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "AUTOMATION", linkedAssetType: "PLC", linkedFailureMode: null, linkedTechnology: "TIA Portal V18", linkedStandard: "IEC 61131-3", linkedVendor: "Siemens", linkedPLCPlatform: "TIA Portal", linkedMaintenanceDomain: null, safetyCritical: false, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-014",
    title: "Condition-Based Maintenance Using Machine Learning: A Factory 4.0 Approach",
    slug: "condition-based-maintenance-machine-learning-factory-40",
    subtitle: "Transitioning from time-based to condition-based maintenance using edge AI and real-time sensor data",
    excerpt: "A framework for implementing machine learning-based condition monitoring at the plant floor level, using low-cost edge computing devices and existing sensor infrastructure.",
    content: `# Machine Learning for Condition-Based Maintenance

## The CBM Opportunity

Traditional preventive maintenance is scheduled by calendar time or operating hours — irrespective of actual asset condition. This generates unnecessary maintenance on healthy equipment and misses failures that develop faster than the inspection interval. Condition-based maintenance (CBM) addresses both problems by triggering maintenance based on measured asset health indicators.

Machine learning enables CBM by learning the normal signature of healthy equipment and detecting deviations automatically — scaling what previously required expert vibration analysts to thousands of assets simultaneously.

## Architecture for Plant-Floor Implementation

The implementation architecture we deployed uses three tiers:
1. **Sensor tier**: Existing vibration sensors (ISO 10816 compliant) + optional new MEMS accelerometers for critical assets
2. **Edge tier**: Siemens SINEC Edge devices at each production cell running inference models locally
3. **Plant tier**: Central plant historian aggregating health scores + CMMS integration

Models are trained centrally on historical data, packaged as ONNX models, and deployed to edge devices via a model management platform. Edge inference runs at 100ms cycle — no cloud dependency.

## Model Selection for Each Asset Type

Different asset types respond best to different model architectures:
- Rotating machinery: LSTM autoencoders for temporal vibration pattern learning
- Compressors: Physics-informed neural networks incorporating thermodynamic constraints
- Electrical equipment (motors, transformers): Random forests on power quality features
- Conveyor systems: Binary classifiers on tension and speed signature combinations

## Deployment Reality Check

Production CBM deployment requires more than good models. Data quality, sensor calibration, and change management are as important as algorithm selection. In our implementation, 23% of initial anomaly alerts were attributable to sensor calibration drift rather than actual asset degradation. A sensor health monitoring layer upstream of the ML models is not optional.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-004",
    author: auth("author-004"),
    categoryId: "cat-007",
    category: cat("predictive-maintenance"),
    tags: tags("machine-learning", "industry-40", "cmms", "vibration-analysis"),
    readingTimeMinutes: 14,
    publishedAt: "2026-06-25T10:00:00.000Z",
    viewCount: 6814, saveCount: 578, reactionCount: 391, commentCount: 44, shareCount: 162,
    seoTitle: "Condition-Based Maintenance Machine Learning Factory 4.0 — Hermes Journal",
    seoDescription: "ML-based condition monitoring framework for plant-floor CBM: edge AI deployment, ONNX models, asset-specific model selection, and sensor data quality.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-22T08:00:00.000Z", updatedAt: "2026-06-25T10:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 9.1, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "MAINTENANCE", linkedAssetType: "MOTOR", linkedFailureMode: null, linkedTechnology: "Edge AI / ML", linkedStandard: "ISO 10816", linkedVendor: "Siemens", linkedPLCPlatform: null, linkedMaintenanceDomain: "Predictive", safetyCritical: false, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-015",
    title: "Asset Management Strategy for Aging Industrial Electrical Infrastructure",
    slug: "asset-management-aging-electrical-infrastructure",
    subtitle: "Developing a risk-based asset management program for switchgear, transformers, and protection systems beyond original design life",
    excerpt: "How to build an ISO 55000-aligned asset management strategy for electrical infrastructure that has exceeded its original design life — balancing replacement capital expenditure against continued operation risk.",
    content: `# Asset Management for Aging Electrical Infrastructure

## The Aging Asset Challenge

Many industrial electrical infrastructure assets — 33kV switchgear, power transformers, protective relays, and cable systems — were designed for 25–30 year operational lives. In practice, numerous assets are operating 10–20 years beyond this design life due to capital constraints or deferred replacement programs. Managing these assets requires a disciplined risk-based approach rather than calendar-based replacement.

## ISO 55000 Framework

ISO 55000 provides the governance framework for strategic asset management. The key principles applicable to aging electrical infrastructure are: establishing an Asset Management Policy, maintaining an Asset Register with life expectancy assessments, defining a Strategic Asset Management Plan (SAMP), and implementing regular Asset Health Reviews.

## Condition Assessment Methods

For aging electrical infrastructure, condition assessment must combine multiple techniques:
- **Dissolved Gas Analysis (DGA)** for oil-filled transformers — detects internal faults before failure
- **Partial Discharge (PD) measurement** for HV switchgear and cables — quantifies insulation degradation
- **Infrared thermography** for all electrical connections and switchgear
- **Circuit breaker timing tests** to verify mechanical performance against original test reports
- **Relay calibration verification** for electromechanical protection relays

## Risk Scoring and Prioritization

Each asset receives a health score (1–10) from condition assessment and a consequence score (1–10) based on the production/safety impact of failure. The risk score (health × consequence) drives investment prioritization. Assets with combined scores >70 receive immediate budget allocation; 50–70 trigger a 3-year replacement plan; <50 enter the standard lifecycle program.

## Case Study: 33kV Switchgear Replacement

A 42-year-old 33kV switchgear was flagged by PD measurement showing partial discharge levels 8× above baseline. Risk score: 88. Emergency replacement was approved and executed during a planned maintenance window, avoiding a potential bus fault that would have caused a complete plant outage.`,
    contentType: "ASSET_RELIABILITY_NOTE",
    authorId: "author-005",
    author: auth("author-005"),
    categoryId: "cat-006",
    category: cat("asset-management"),
    tags: tags("iso-55000", "cmms"),
    readingTimeMinutes: 13,
    publishedAt: "2026-06-26T09:00:00.000Z",
    viewCount: 5621, saveCount: 489, reactionCount: 312, commentCount: 38, shareCount: 134,
    seoTitle: "Asset Management Aging Electrical Infrastructure — ISO 55000 — Hermes Journal",
    seoDescription: "Risk-based asset management for aging electrical infrastructure beyond design life: ISO 55000 framework, DGA, PD measurement, and risk-based investment prioritization.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-23T08:00:00.000Z", updatedAt: "2026-06-26T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 8.8, sourceReliability: "HIGH", evidenceLevel: "PRACTITIONER", industrialDomain: "ELECTRICAL", linkedAssetType: "ELECTRICAL_PANEL", linkedFailureMode: "INSULATION_FAILURE", linkedTechnology: "PD / DGA", linkedStandard: "ISO 55000", linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: "Predictive", safetyCritical: true, humanReviewed: false },
  },
  {
    ...BASE,
    id: "art-016",
    title: "Energy Efficiency in Variable Speed Drive Applications: Optimization Strategies",
    slug: "energy-efficiency-vfd-applications",
    subtitle: "Quantifying and maximizing energy savings from VFD retrofits across pumps, fans, and compressors",
    excerpt: "A systematic methodology for calculating, commissioning, and verifying energy savings from variable speed drive retrofits — with real-world data from 47 retrofit projects across Iranian industrial plants.",
    content: `# Energy Efficiency in VFD Applications

## Why VFDs Save Energy

Affinity laws govern the relationship between motor speed and power consumption for centrifugal loads (pumps, fans, compressors). A 20% speed reduction reduces power consumption by 49% (power scales as the cube of speed). This means that even moderate speed reductions through VFD control produce substantial energy savings.

## Calculation Methodology

Energy saving potential = Base power × (1 - (N₂/N₁)³) × operating hours × load factor

For a 75kW pump motor running at 80% of full speed for 6,000 hours per year: Savings = 75 × (1 - 0.8³) × 6,000 × 0.85 = 130,815 kWh/year.

## Commissioning for Maximum Savings

VFD commissioning significantly impacts realized savings. The three critical commissioning parameters are:
1. **Motor nameplate data accuracy**: Incorrect motor data produces sub-optimal V/Hz curves
2. **Control mode selection**: Vector control outperforms scalar (V/Hz) for variable-load applications
3. **Energy optimization mode**: Enable only after PID tuning — premature energy optimization causes instability

## Field Results from 47 Retrofit Projects

Across 47 VFD retrofit projects (2023–2025) in Iranian cement, chemical, and utility plants:
- Average measured energy saving: 31.4% of pre-retrofit consumption
- Average payback period: 14.7 months
- Range: 22% to 47% savings depending on load profile and prior control method

Highest savings occurred on cooling tower fans and chilled water pumps where previous throttling valve control was replaced with speed control. Lowest savings occurred on compressor applications where minimum speed constraints limited operating range.`,
    contentType: "TECHNICAL_ARTICLE",
    authorId: "author-001",
    author: auth("author-001"),
    categoryId: "cat-017",
    category: cat("energy-utilities"),
    tags: tags("vfd"),
    readingTimeMinutes: 11,
    publishedAt: "2026-06-27T09:00:00.000Z",
    viewCount: 4892, saveCount: 398, reactionCount: 267, commentCount: 29, shareCount: 112,
    seoTitle: "Energy Efficiency VFD Applications — Real World Data — Hermes Journal",
    seoDescription: "VFD energy savings: affinity laws calculation, commissioning optimization, and field results from 47 retrofit projects — average 31.4% energy reduction.",
    canonicalUrl: null, ogImageUrl: null, noIndex: false, rejectionReason: null,
    createdAt: "2026-06-25T08:00:00.000Z", updatedAt: "2026-06-27T09:00:00.000Z",
    knowledgeMetadata: { knowledgeEligible: true, reviewedForKnowledge: false, articleQualityScore: 8.7, sourceReliability: "HIGH", evidenceLevel: "FIELD_VERIFIED", industrialDomain: "ENERGY", linkedAssetType: "VFD", linkedFailureMode: null, linkedTechnology: "VFD / Energy Management", linkedStandard: null, linkedVendor: null, linkedPLCPlatform: null, linkedMaintenanceDomain: null, safetyCritical: false, humanReviewed: false },
  },
];

export function getArticleBySlug(slug: string): ArticleDetail | undefined {
  return MOCK_ARTICLES.find(a => a.slug === slug);
}

export function getArticlesByCategory(categorySlug: string): ArticleDetail[] {
  return MOCK_ARTICLES.filter(a => a.category?.slug === categorySlug && a.status === "PUBLISHED" && a.visibility === "PUBLIC");
}

export function getArticlesByTag(tagSlug: string): ArticleDetail[] {
  return MOCK_ARTICLES.filter(a => a.tags.some(t => t.slug === tagSlug) && a.status === "PUBLISHED" && a.visibility === "PUBLIC");
}

export function getArticlesByAuthor(handle: string): ArticleDetail[] {
  return MOCK_ARTICLES.filter(a => a.author.handle === handle && a.status === "PUBLISHED" && a.visibility === "PUBLIC");
}

export function getPublishedArticles(): ArticleDetail[] {
  return MOCK_ARTICLES.filter(a => a.status === "PUBLISHED" && a.visibility === "PUBLIC");
}

export function getTrendingArticles(limit = 8): ArticleDetail[] {
  return [...MOCK_ARTICLES]
    .filter(a => a.status === "PUBLISHED" && a.visibility === "PUBLIC")
    .sort((a, b) => (b.viewCount + b.reactionCount * 3) - (a.viewCount + a.reactionCount * 3))
    .slice(0, limit);
}

export function getEditorsPicks(limit = 6): ArticleDetail[] {
  return [...MOCK_ARTICLES]
    .filter(a => a.status === "PUBLISHED" && a.visibility === "PUBLIC")
    .sort((a, b) => (b.knowledgeMetadata?.articleQualityScore ?? 0) - (a.knowledgeMetadata?.articleQualityScore ?? 0))
    .slice(0, limit);
}

export function getCaseStudies(limit = 6): ArticleDetail[] {
  return MOCK_ARTICLES
    .filter(a => a.contentType === "INDUSTRIAL_CASE_STUDY" && a.status === "PUBLISHED" && a.visibility === "PUBLIC")
    .slice(0, limit);
}

export function getAuthorByHandle(handle: string): ArticleAuthorProfile | undefined {
  return MOCK_AUTHORS.find(a => a.handle === handle);
}
