// @ts-check
'use strict'
/**
 * The Phase 104 component library — declarative, pure, no `figma`.
 *
 * ── THE ANTI-DUPLICATION CONTRACT ──────────────────────────────────────────
 * The requirement is a component-driven system, NOT 117 heavyweight frame copies.
 * That is achieved by choosing carefully what becomes a VARIANT and what becomes
 * a PROPERTY:
 *
 *   LOCALE IS NEVER A VARIANT.  FA / EN / DE are carried by TEXT component
 *   properties. One instance switches language by overriding text — it creates no
 *   new nodes. This is what stops the matrix exploding: without it, every axis
 *   would triple.
 *
 *   DIRECTION (LTR/RTL) is a variant only on LAYOUT-BEARING components — Shell,
 *   Rail, Command, Row. Everything nested inside them inherits direction from the
 *   auto-layout parent, so leaf components need no direction axis at all.
 *
 *   BREAKPOINT is a variant only on components whose GEOMETRY actually changes.
 *   A badge is a badge at every width.
 *
 *   STATE is a variant only on interactive components.
 *
 * Net effect: full Desktop-1440 / Tablet-768 / Mobile-390 x FA/EN/DE x state x
 * direction coverage, with no screen ever being a detached copy of another.
 *
 * ── VARIANT BUDGET ────────────────────────────────────────────────────────
 * No single component set exceeds 30 variants (the point at which a variant
 * matrix stops being navigable). Where a matrix would exceed it, the family is
 * split into a base set plus a states set. `assertVariantBudget()` enforces this.
 */

const BP = ['Desktop', 'Tablet', 'Mobile']
const DIR = ['LTR', 'RTL']

/**
 * Anatomy presets. Each is a pure description the executor turns into an
 * auto-layout frame. Values reference DNA tokens by name, never raw hex.
 */
const PRESETS = Object.freeze({
  control: { layout: 'HORIZONTAL', padX: 16, padY: 10, gap: 8, radius: 6, align: 'CENTER', height: 44 },
  controlSm: { layout: 'HORIZONTAL', padX: 12, padY: 6, gap: 6, radius: 6, align: 'CENTER', height: 36 },
  controlLg: { layout: 'HORIZONTAL', padX: 20, padY: 14, gap: 10, radius: 8, align: 'CENTER', height: 52 },
  pill: { layout: 'HORIZONTAL', padX: 10, padY: 4, gap: 6, radius: 9999, align: 'CENTER', height: 24 },
  chip: { layout: 'HORIZONTAL', padX: 8, padY: 3, gap: 6, radius: 4, align: 'CENTER', height: 22 },
  field: { layout: 'HORIZONTAL', padX: 14, padY: 12, gap: 10, radius: 8, align: 'CENTER', height: 44 },
  card: { layout: 'VERTICAL', padX: 20, padY: 20, gap: 12, radius: 16, align: 'MIN' },
  cardHero: { layout: 'VERTICAL', padX: 24, padY: 24, gap: 16, radius: 20, align: 'MIN' },
  row: { layout: 'HORIZONTAL', padX: 16, padY: 12, gap: 16, radius: 8, align: 'CENTER', height: 52 },
  rail: { layout: 'VERTICAL', padX: 14, padY: 16, gap: 6, radius: 0, align: 'CENTER' },
  panel: { layout: 'VERTICAL', padX: 24, padY: 24, gap: 16, radius: 16, align: 'MIN' },
  shell: { layout: 'HORIZONTAL', padX: 0, padY: 0, gap: 0, radius: 0, align: 'MIN' },
})

/**
 * @typedef {Object} Family
 * @property {string} key
 * @property {string} name              Figma component-set name
 * @property {string} section           which section it is laid out in
 * @property {string} preset
 * @property {Record<string,string[]>} axes   variant axes -> values
 * @property {{name:string, default:Record<string,string>}[]} [text]  TEXT component properties (the locale mechanism)
 * @property {string[]} [bools]         BOOLEAN component properties
 * @property {{name:string,target:string}[]} [swaps] INSTANCE_SWAP property + target family key
 * @property {string} glass             DNA glass tier or 'none'
 * @property {string} description
 * @property {string} a11y
 * @property {string} [maps]            the code component it corresponds to
 */

/** Tri-lingual default copy. This is the ONLY place language appears. */
const T = (en, fa, de) => ({ en, fa, de })

/** @type {ReadonlyArray<Family>} */
const FAMILIES = [
  // ── 04 — Core Components ─────────────────────────────────────────────────
  {
    key: 'shell', name: 'Hermes/Shell', section: '04 — Core Components', preset: 'shell',
    axes: { Breakpoint: BP, Direction: DIR },
    swaps: [{ name: 'Rail', target: 'rail' }, { name: 'Content', target: 'feedback' }],
    glass: 'none',
    description: 'The application frame. Holds a Rail instance and a content slot. Direction is a variant here and ONLY here for the outer layout — every nested component inherits direction from this auto-layout parent, which is why no leaf component carries a direction axis.',
    a11y: 'landmark structure: navigation + main. Skip-to-content is the first focusable node.',
    maps: 'src/components/app-shell/AppShell',
  },
  {
    key: 'rail', name: 'Hermes/Rail', section: '04 — Core Components', preset: 'rail',
    axes: { Breakpoint: BP, State: ['Collapsed', 'Expanded'] },
    bools: ['Show labels'],
    swaps: [{ name: 'Item icon', target: 'state-pill' }],
    glass: 'none',
    description: 'Hermes Rail — 72px icon-only resting state, 264px expanded drawer, bottom sheet on Mobile. Active item carries a 2px inline-start Beacon bar.',
    a11y: 'nav landmark; 44px targets (SC 2.5.8); aria-current on the active item; labels exposed to AT even when visually collapsed.',
    maps: 'src/components/app-shell/AppSidebar',
  },
  {
    key: 'command', name: 'Hermes/Command', section: '04 — Core Components', preset: 'field',
    axes: { Breakpoint: BP, State: ['Rest', 'Focus', 'Open'] },
    text: [{ name: 'Placeholder', default: T('Ask Hermes or search…', 'از هرمس بپرسید یا جست‌وجو کنید…', 'Hermes fragen oder suchen…') }],
    swaps: [{ name: 'Leading mark', target: 'reasoning-chip' }],
    glass: 'elevated',
    description: 'Hermes Command — the signature AI command/search field. 720/640/342 wide, 64 tall. Deliberately larger than any other control in the product.',
    a11y: 'role=combobox, aria-expanded, aria-controls the palette listbox; 2px Beacon focus ring at 2px offset.',
    maps: 'src/components/app-shell/AppCommandPalette',
  },
  {
    key: 'button', name: 'Hermes/Button', section: '04 — Core Components', preset: 'control',
    axes: { Intent: ['Primary', 'Secondary', 'Tertiary', 'Destructive'], Size: ['Sm', 'Md', 'Lg'] },
    text: [{ name: 'Label', default: T('Continue', 'ادامه', 'Weiter') }],
    bools: ['Leading icon', 'Trailing icon'],
    swaps: [{ name: 'Icon', target: 'state-pill' }],
    glass: 'none',
    description: 'Mirrors buttonVariants in src/components/ds/logic.ts exactly (primary/secondary/tertiary/destructive x sm/md/lg). Interaction states live in the sibling States set so neither matrix exceeds the variant budget.',
    a11y: 'dark-on-cyan only for Primary — white-on-cyan is prohibited (11.01:1).',
    maps: 'src/components/ds/Button.tsx',
  },
  {
    key: 'button-states', name: 'Hermes/Button · States', section: '04 — Core Components', preset: 'control',
    axes: { Intent: ['Primary', 'Secondary', 'Tertiary', 'Destructive'], State: ['Default', 'Hover', 'Focus', 'Active', 'Disabled'] },
    text: [{ name: 'Label', default: T('Continue', 'ادامه', 'Weiter') }],
    glass: 'none',
    description: 'The interaction-state matrix at Md. Split from the base set to keep both under the 30-variant budget.',
    a11y: 'Focus is :focus-visible only, 2px Beacon ring at 2px offset.',
    maps: 'src/components/ds/Button.tsx',
  },
  {
    key: 'input', name: 'Hermes/Input', section: '04 — Core Components', preset: 'field',
    axes: { State: ['Default', 'Hover', 'Focus', 'Filled', 'Disabled', 'Error'] },
    text: [
      { name: 'Label', default: T('Asset tag', 'برچسب دارایی', 'Anlagen-Tag') },
      { name: 'Value', default: T('', '', '') },
      { name: 'Helper', default: T('Use the plant tag format', 'از قالب تگ کارخانه استفاده کنید', 'Anlagen-Tag-Format verwenden') },
    ],
    glass: 'none',
    description: 'Text input. Error state pairs the danger border with a helper message — never colour alone.',
    a11y: 'aria-invalid + aria-describedby on Error; the message is announced, not merely coloured.',
    maps: 'src/components/ds/Input.tsx',
  },
  {
    key: 'select', name: 'Hermes/Select', section: '04 — Core Components', preset: 'field',
    axes: { State: ['Default', 'Hover', 'Focus', 'Open', 'Disabled'] },
    text: [{ name: 'Label', default: T('Site', 'سایت', 'Standort') }, { name: 'Value', default: T('All sites', 'همهٔ سایت‌ها', 'Alle Standorte') }],
    glass: 'none', description: 'Select / combobox trigger.',
    a11y: 'role=combobox, aria-expanded; the listbox is a Popover instance.',
    maps: 'src/components/ds/Select.tsx',
  },
  {
    key: 'tabs', name: 'Hermes/Tabs', section: '04 — Core Components', preset: 'control',
    axes: { Variant: ['Underline', 'Segmented'], State: ['Default', 'Hover', 'Selected', 'Disabled'] },
    text: [{ name: 'Label', default: T('Overview', 'نمای کلی', 'Übersicht') }],
    glass: 'none', description: 'Tabs and segmented control share one family; Variant switches the treatment.',
    a11y: 'role=tablist/tab/tabpanel; selection is never colour-only — the underline/fill carries it.',
    maps: 'src/components/ds/Tabs.tsx',
  },
  {
    key: 'breadcrumb', name: 'Hermes/Breadcrumb', section: '04 — Core Components', preset: 'chip',
    axes: { Direction: DIR, State: ['Default', 'Current'] },
    text: [{ name: 'Label', default: T('Live Operations', 'عملیات زنده', 'Live-Betrieb') }],
    glass: 'none',
    description: 'Breadcrumb segment. Direction is a variant because the separator glyph mirrors; the technical value inside it must NOT mirror.',
    a11y: 'nav[aria-label=Breadcrumb]; aria-current=page on Current.',
  },
  {
    key: 'dialog', name: 'Hermes/Dialog', section: '04 — Core Components', preset: 'panel',
    axes: { Breakpoint: BP, Kind: ['Dialog', 'Drawer'] },
    text: [{ name: 'Title', default: T('Confirm action', 'تأیید عملیات', 'Aktion bestätigen') }, { name: 'Body', default: T('This action requires engineer approval.', 'این عملیات به تأیید مهندس نیاز دارد.', 'Diese Aktion erfordert eine Freigabe durch einen Ingenieur.') }],
    glass: 'hero',
    description: 'Modal dialog and side drawer share one family. On Mobile the Drawer becomes a bottom sheet.',
    a11y: 'role=dialog aria-modal; focus trapped; Escape closes; focus returns to the invoker.',
  },
  {
    key: 'tooltip', name: 'Hermes/Tooltip', section: '04 — Core Components', preset: 'chip',
    axes: { Placement: ['Top', 'Bottom', 'Start', 'End'] },
    text: [{ name: 'Label', default: T('Last update 12s ago', 'آخرین به‌روزرسانی ۱۲ ثانیه پیش', 'Letzte Aktualisierung vor 12 s') }],
    glass: 'elevated', description: 'Tooltip. Never the sole carrier of essential information.',
    a11y: 'aria-describedby; must also be reachable on keyboard focus, not hover alone.',
  },
  {
    key: 'notification', name: 'Hermes/Notification', section: '04 — Core Components', preset: 'row',
    axes: { Severity: ['Information', 'Success', 'Warning', 'Danger'], State: ['Default', 'Dismissing'] },
    text: [{ name: 'Title', default: T('Connection restored', 'اتصال برقرار شد', 'Verbindung wiederhergestellt') }],
    glass: 'elevated', description: 'Toast / inline notification.',
    a11y: 'role=status for non-critical, role=alert for Danger; icon + text carry severity, never colour alone.',
  },

  // ── 05 — Industrial Components ───────────────────────────────────────────
  {
    key: 'state-pill', name: 'Hermes/Industrial State', section: '05 — Industrial Components', preset: 'pill',
    axes: {
      Status: ['Healthy', 'Degraded', 'Warning', 'Alarm', 'Critical', 'Maintenance', 'Simulation', 'Stale', 'Offline', 'Unknown'],
      Display: ['Dot', 'Full'],
    },
    text: [{ name: 'Label', default: T('Healthy', 'سالم', 'Fehlerfrei') }],
    glass: 'none',
    description: 'The ten-state industrial ladder. Every status carries a distinct glyph AND outline treatment in addition to its colour, so severity survives greyscale and colour-vision deficiency. UNKNOWN differs from HEALTHY on all three channels at once.',
    a11y: 'SC 1.4.1 — never colour alone. Indicator >= 3:1 (SC 1.4.11); the label uses the readable text partner at >= 4.5:1.',
  },
  {
    key: 'kpi-card', name: 'Hermes/KPI Card', section: '05 — Industrial Components', preset: 'card',
    axes: { Breakpoint: BP, Trend: ['Up', 'Flat', 'Down', 'NoData'] },
    text: [
      { name: 'Label', default: T('Overall equipment effectiveness', 'اثربخشی کلی تجهیزات', 'Gesamtanlageneffektivität') },
      { name: 'Value', default: T('—', '—', '—') },
      { name: 'Unit', default: T('%', '٪', '%') },
    ],
    glass: 'card',
    description: 'KPI / metric tile. NoData renders an explicit no-data treatment and is NEVER rendered as zero.',
    a11y: 'the unit is part of the accessible name; the trend arrow is paired with a sign, never colour alone.',
    maps: 'src/components/ds/MetricCard.tsx',
  },
  {
    key: 'telemetry-row', name: 'Hermes/Telemetry Row', section: '05 — Industrial Components', preset: 'row',
    axes: { Direction: DIR, Quality: ['Good', 'Uncertain', 'Stale', 'Bad'] },
    text: [
      { name: 'Tag', default: T('FIC-1024.PV', 'FIC-1024.PV', 'FIC-1024.PV') },
      { name: 'Value', default: T('42.7', '۴۲٫۷', '42,7') },
      { name: 'Unit', default: T('m³/h', 'm³/h', 'm³/h') },
    ],
    glass: 'none',
    description: 'A single measured signal. Direction is a variant because the row mirrors, but the TAG and the numeric VALUE must stay LTR inside an RTL row — that bidirectional isolation is the whole point of this component.',
    a11y: 'tabular figures; quality is announced, not implied by colour.',
  },
  {
    key: 'alarm-card', name: 'Hermes/Alarm Card', section: '05 — Industrial Components', preset: 'card',
    axes: { Severity: ['Warning', 'Alarm', 'Critical'], State: ['Unacknowledged', 'Acknowledged', 'Cleared'] },
    text: [
      { name: 'Code', default: T('PAH-2201', 'PAH-2201', 'PAH-2201') },
      { name: 'Message', default: T('Discharge pressure above high limit', 'فشار خروجی بالاتر از حد مجاز', 'Förderdruck über oberem Grenzwert') },
      { name: 'Timestamp', default: T('12:04:31', '۱۲:۰۴:۳۱', '12:04:31') },
    ],
    glass: 'card',
    description: 'Alarm record. Unacknowledged Critical is the single loudest object in the product; acknowledgement visibly and permanently changes the treatment.',
    a11y: 'role=alert for Unacknowledged Critical only; the alarm code is always readable text, never an icon alone. Under prefers-reduced-motion the pulse becomes a static double outline so severity is never lost.',
  },
  {
    key: 'asset-card', name: 'Hermes/Asset Card', section: '05 — Industrial Components', preset: 'card',
    axes: { Breakpoint: BP, Status: ['Healthy', 'Degraded', 'Alarm', 'Offline', 'Unknown'] },
    text: [
      { name: 'Name', default: T('Boiler feed pump A', 'پمپ تغذیهٔ بویلر A', 'Kesselspeisepumpe A') },
      { name: 'Tag', default: T('P-101A', 'P-101A', 'P-101A') },
    ],
    swaps: [{ name: 'Status pill', target: 'state-pill' }],
    glass: 'interactive', description: 'Asset tile for Live Operations and Assets.',
    a11y: 'the status pill instance carries the accessible state; the card is a single tab stop.',
  },
  {
    key: 'connection-state', name: 'Hermes/Connection State', section: '05 — Industrial Components', preset: 'pill',
    axes: { Protocol: ['OPC UA', 'MQTT', 'Modbus', 'S7'], Status: ['Connected', 'Degraded', 'Disconnected', 'Unknown'] },
    text: [{ name: 'Endpoint', default: T('opc.tcp://…:4840', 'opc.tcp://…:4840', 'opc.tcp://…:4840') }],
    glass: 'none', description: 'Connectivity indicator. Endpoint stays LTR in every locale.',
    a11y: 'protocol and status are both text; the dot is decorative.',
  },
  {
    key: 'table', name: 'Hermes/Table', section: '05 — Industrial Components', preset: 'panel',
    axes: { Breakpoint: BP, Density: ['Comfortable', 'Compact'] },
    bools: ['Header', 'Selection', 'Pagination'],
    glass: 'card',
    description: 'Data table. On Mobile it becomes a stacked card list rather than a horizontally scrolling grid — the transformation is the variant, not a separate design.',
    a11y: 'real table semantics; sortable headers expose aria-sort; the mobile stack keeps header/value association.',
  },

  // ── 06 — Intelligence Components ─────────────────────────────────────────
  {
    key: 'reasoning-chip', name: 'Hermes/Reasoning Chip', section: '06 — Intelligence Components', preset: 'chip',
    axes: { Tier: ['Observed', 'Evidence', 'Hypothesis', 'Candidate', 'Conflict', 'NoData', 'Simulated', 'Proposed', 'Approved'] },
    text: [{ name: 'Label', default: T('HYPOTHESIS', 'فرضیه', 'HYPOTHESE') }],
    glass: 'none',
    description: 'The provenance chip. This is the component that guarantees an AI hypothesis never looks like a verified plant fact: unverified tiers carry a dashed border in addition to their colour and their chip word.',
    a11y: 'the chip word is always readable text — provenance is never conveyed by colour or border alone.',
  },
  {
    key: 'evidence-panel', name: 'Hermes/Evidence Panel', section: '06 — Intelligence Components', preset: 'panel',
    axes: { Breakpoint: BP, State: ['Collapsed', 'Expanded', 'Empty'] },
    text: [
      { name: 'Title', default: T('Evidence lineage', 'زنجیرهٔ شواهد', 'Nachweiskette') },
      { name: 'Source', default: T('Historian · tag FIC-1024.PV · 2h window', 'هیستورین · تگ FIC-1024.PV · بازهٔ ۲ ساعت', 'Historian · Tag FIC-1024.PV · 2-h-Fenster') },
    ],
    swaps: [{ name: 'Provenance chip', target: 'reasoning-chip' }],
    glass: 'elevated',
    description: 'Inspectable evidence lineage for the Industrial Brain. Empty state states what is missing and why — it never renders absence as zero.',
    a11y: 'disclosure pattern with aria-expanded; every claim row is linked to its source record.',
  },
  {
    key: 'triad-card', name: 'Hermes/Triad Card', section: '06 — Intelligence Components', preset: 'cardHero',
    axes: { Intent: ['Operate', 'Understand', 'Act'], State: ['Rest', 'Hover', 'Focus'] },
    text: [
      { name: 'Title', default: T('Operate', 'بهره‌برداری', 'Betreiben') },
      { name: 'Summary', default: T('What is happening in the plant right now', 'همین حالا در کارخانه چه می‌گذرد', 'Was in der Anlage gerade passiert') },
    ],
    swaps: [{ name: 'Mark', target: 'reasoning-chip' }],
    glass: 'interactive',
    description: 'Hermes Triad — the three primary Workspace cards. Exactly three, equal weight, one intent each. This is a fixed composition, not a generic card grid.',
    a11y: 'each card is a single tab stop with a descriptive accessible name; hover lift is decorative only.',
  },

  // ── shared feedback states ───────────────────────────────────────────────
  {
    key: 'feedback', name: 'Hermes/Feedback State', section: '04 — Core Components', preset: 'panel',
    axes: { Kind: ['Loading', 'Empty', 'Error', 'Offline', 'PermissionDenied'], Breakpoint: BP },
    text: [
      { name: 'Title', default: T('No data for this window', 'داده‌ای برای این بازه نیست', 'Keine Daten für diesen Zeitraum') },
      { name: 'Body', default: T('Nothing was recorded between 08:00 and 09:00.', 'بین ۸:۰۰ و ۹:۰۰ چیزی ثبت نشده است.', 'Zwischen 08:00 und 09:00 wurde nichts aufgezeichnet.') },
    ],
    glass: 'soft',
    description: 'The five non-happy states as one family: Loading, Empty, Error, Offline and Permission denied. Having them in the system is what stops each screen inventing its own.',
    a11y: 'Loading exposes aria-busy; Error is role=alert; PermissionDenied never leaks the existence of an inaccessible resource.',
  },
  {
    key: 'skeleton', name: 'Hermes/Skeleton', section: '04 — Core Components', preset: 'card',
    axes: { Shape: ['Line', 'Block', 'Card', 'Row'] },
    glass: 'none',
    description: 'Loading placeholder. Shimmer is suppressed entirely under prefers-reduced-motion.',
    a11y: 'aria-hidden; the live region announces loading, not the skeleton geometry.',
  },
]

/** Cartesian product of a family's axes. @param {Family} f @returns {Record<string,string>[]} */
function variantCombos(f) {
  const names = Object.keys(f.axes)
  /** @type {Record<string,string>[]} */
  let out = [{}]
  for (const n of names) {
    /** @type {Record<string,string>[]} */
    const next = []
    for (const base of out) for (const v of f.axes[n]) next.push({ ...base, [n]: v })
    out = next
  }
  return out
}

/** @param {Family} f @returns {string} e.g. "Intent=Primary, Size=Md" */
function variantName(f, combo) {
  return Object.keys(f.axes).map((k) => k + '=' + combo[k]).join(', ')
}

/**
 * Enforce the variant budget. Throws with an actionable message rather than
 * silently shipping an unnavigable 200-variant matrix.
 * @param {number} [max]
 */
function assertVariantBudget(max) {
  const cap = max || 30
  const over = FAMILIES.map((f) => ({ name: f.name, n: variantCombos(f).length }))
    .filter((x) => x.n > cap)
  if (over.length) {
    throw new Error('variant budget exceeded (cap ' + cap + '): ' +
      over.map((o) => o.name + '=' + o.n).join(', ') + ' — split into a base set plus a states set')
  }
  return true
}

/**
 * Locale is a PROPERTY, never a variant. Enforced by EXACT axis-name and
 * axis-VALUE matching — a substring test would false-positive on legitimate
 * axes ("Intent" contains "en").
 */
const FORBIDDEN_AXIS_NAMES = new Set(['locale', 'language', 'lang', 'translation', 'i18n'])
const LOCALE_VALUES = new Set(['fa', 'en', 'de', 'persian', 'english', 'german', 'farsi', 'deutsch'])

function assertLocaleIsNeverAVariant() {
  for (const f of FAMILIES) {
    for (const axis of Object.keys(f.axes)) {
      if (FORBIDDEN_AXIS_NAMES.has(axis.toLowerCase())) {
        throw new Error(f.name + ' declares a locale variant axis "' + axis +
          '" — locale must be a TEXT component property so instances do not duplicate nodes')
      }
      const values = f.axes[axis].map((v) => String(v).toLowerCase())
      if (values.some((v) => LOCALE_VALUES.has(v))) {
        throw new Error(f.name + ' axis "' + axis + '" carries locale values [' + values.join(', ') +
          '] — locale must be a TEXT component property, not a variant axis')
      }
    }
  }
  return true
}

const LOCALES = Object.freeze(['en', 'fa', 'de'])

const BREAKPOINT_WIDTHS = Object.freeze({
  shell: { Desktop: 1440, Tablet: 768, Mobile: 390 },
  rail: { Desktop: 72, Tablet: 72, Mobile: 390 },
  command: { Desktop: 720, Tablet: 640, Mobile: 342 },
  dialog: { Desktop: 720, Tablet: 640, Mobile: 342 },
  'kpi-card': { Desktop: 360, Tablet: 320, Mobile: 342 },
  'asset-card': { Desktop: 360, Tablet: 320, Mobile: 342 },
  table: { Desktop: 960, Tablet: 680, Mobile: 342 },
  'evidence-panel': { Desktop: 720, Tablet: 640, Mobile: 342 },
  feedback: { Desktop: 720, Tablet: 640, Mobile: 342 },
})

/**
 * Concrete geometry for every family that declares a Breakpoint axis. The axis
 * is not decorative: Desktop/Tablet/Mobile variants materially resize.
 * @param {string} familyKey
 * @param {Record<string,string>} combo
 */
function variantGeometry(familyKey, combo) {
  if (!combo.Breakpoint) return null
  const widths = BREAKPOINT_WIDTHS[familyKey]
  if (!widths || !widths[combo.Breakpoint]) {
    throw new Error('missing breakpoint geometry for ' + familyKey + '/' + combo.Breakpoint)
  }
  let width = widths[combo.Breakpoint]
  if (familyKey === 'rail' && combo.State === 'Expanded' && combo.Breakpoint !== 'Mobile') width = 264
  return { width }
}

module.exports = {
  FAMILIES,
  PRESETS,
  BP,
  DIR,
  LOCALES,
  BREAKPOINT_WIDTHS,
  variantCombos,
  variantName,
  variantGeometry,
  assertVariantBudget,
  assertLocaleIsNeverAVariant,
}
