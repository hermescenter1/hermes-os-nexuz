// @ts-check
'use strict'
/**
 * Declarative registry of the component families the plugin generates natively
 * as Figma Component Sets with Variants + Component Properties + Auto Layout.
 *
 * The three category lists are grounded in the real Hermes design system:
 *   - 23 PRIMITIVES  ⟵ src/components/ds/*.tsx  (each `maps` to its source file)
 *   - 13 CORE        ⟵ the documented "missing as ds/ primitives" core families
 *   - 7  INDUSTRIAL  ⟵ the documented industrial component families
 *
 * FIDELITY NOTE (honest scope): each family is generated as a REAL component set
 * — auto-layout, token-bound fills/borders, an applied text style, a primary
 * variant axis and component properties (text + an RTL boolean where text-bearing).
 * They are foundation-fidelity scaffolds bound to the native variables/styles,
 * intended to be refined toward the React components — NOT pixel-final replicas.
 * Deeper per-variant visual matrices are recorded as follow-up, not simulated.
 *
 * @typedef {Object} Family
 * @property {string} key       stable kebab identity (drives assetKey — do not rename casually)
 * @property {string} name      Figma component-set name
 * @property {'primitive'|'core'|'industrial'} category
 * @property {string|null} maps repo source file this family maps to, or null (planned)
 * @property {{prop:string, values:string[]}} variant primary variant axis
 * @property {string[]} [text]  TEXT component properties
 * @property {string[]} [bool]  BOOLEAN component properties (besides the RTL prop)
 * @property {boolean} rtl      add an "RTL" boolean component property (text-bearing families)
 * @property {string} description short description + a11y intent (written to component.description)
 */

/** Maps a variant VALUE keyword to a semantic color token for meaningful fills. */
const TONE_TOKEN = Object.freeze({
  Primary: 'Color/Brand/Primary', Brand: 'Color/Brand/Primary', Decision: 'Color/Reasoning/Decision',
  Secondary: 'Color/Surface/Interactive', Ghost: 'Color/Surface/Primary', Neutral: 'Color/Text/Muted',
  Success: 'Color/Status/Success', Healthy: 'Color/Status/Success', Running: 'Color/Status/Success', On: 'Color/Status/Success',
  Warning: 'Color/Status/Warning', Missing: 'Color/Reasoning/Missing', Maintenance: 'Color/Status/Warning', Idle: 'Color/Status/Warning',
  Danger: 'Color/Status/Danger', Fault: 'Color/Status/Danger', Down: 'Color/Status/Danger', Contradiction: 'Color/Reasoning/Contradiction',
  Information: 'Color/Status/Information', Info: 'Color/Status/Information', Offline: 'Color/Text/Disabled',
  Evidence: 'Color/Reasoning/Evidence', Hypothesis: 'Color/Reasoning/Hypothesis',
  High: 'Color/Status/Success', Medium: 'Color/Status/Warning', Low: 'Color/Status/Danger',
})

/** @type {ReadonlyArray<Family>} */
const PRIMITIVES = [
  { key: 'alert', name: 'Alert', category: 'primitive', maps: 'src/components/ds/Alert.tsx', variant: { prop: 'Tone', values: ['Info', 'Success', 'Warning', 'Danger'] }, text: ['Title', 'Message'], bool: ['Dismissible'], rtl: true, description: 'Inline alert banner. Tone maps to status colors; icon + text must meet 4.5:1 on the tinted surface.' },
  { key: 'badge', name: 'Badge', category: 'primitive', maps: 'src/components/ds/Badge.tsx', variant: { prop: 'Tone', values: ['Neutral', 'Brand', 'Success', 'Warning', 'Danger'] }, text: ['Label'], rtl: true, description: 'Compact status/label chip. Non-interactive; never the sole carrier of meaning (pair with text).' },
  { key: 'button', name: 'Button', category: 'primitive', maps: 'src/components/ds/Button.tsx', variant: { prop: 'Variant', values: ['Primary', 'Secondary', 'Ghost', 'Danger'] }, text: ['Label'], bool: ['Disabled'], rtl: true, description: 'Primary action control. On-brand text is dark (brand-on-brand); focus uses focus-ring + halo.' },
  { key: 'card', name: 'Card', category: 'primitive', maps: 'src/components/ds/Card.tsx', variant: { prop: 'Elevation', values: ['E1', 'E2', 'E3'] }, text: ['Title'], rtl: true, description: 'Surface container. Elevation maps to the E1–E3 effect styles; body sits on surface-primary.' },
  { key: 'checkbox', name: 'Checkbox', category: 'primitive', maps: 'src/components/ds/Checkbox.tsx', variant: { prop: 'State', values: ['Unchecked', 'Checked', 'Indeterminate', 'Disabled'] }, text: ['Label'], rtl: true, description: 'Boolean input. Checked uses brand-primary; disabled uses text-disabled and is non-focusable.' },
  { key: 'dialog', name: 'Dialog', category: 'primitive', maps: 'src/components/ds/Dialog.tsx', variant: { prop: 'Size', values: ['S', 'M', 'L'] }, text: ['Title'], rtl: true, description: 'Modal dialog on glass overlay (E4). Requires a labelled title and a focus trap in code.' },
  { key: 'drawer', name: 'Drawer', category: 'primitive', maps: 'src/components/ds/Drawer.tsx', variant: { prop: 'Side', values: ['Start', 'End'] }, text: ['Title'], rtl: true, description: 'Edge panel. Side is logical (Start/End) so it mirrors correctly under RTL.' },
  { key: 'empty-state', name: 'EmptyState', category: 'primitive', maps: 'src/components/ds/EmptyState.tsx', variant: { prop: 'Tone', values: ['Neutral', 'Brand'] }, text: ['Title', 'Description'], rtl: true, description: 'Zero-data placeholder with guidance. Must offer a next action.' },
  { key: 'error-state', name: 'ErrorState', category: 'primitive', maps: 'src/components/ds/ErrorState.tsx', variant: { prop: 'Tone', values: ['Danger', 'Warning'] }, text: ['Title', 'Description'], rtl: true, description: 'Recoverable error surface with a retry affordance.' },
  { key: 'form-field', name: 'FormField', category: 'primitive', maps: 'src/components/ds/FormField.tsx', variant: { prop: 'State', values: ['Default', 'Focused', 'Error', 'Disabled'] }, text: ['Label', 'Hint'], rtl: true, description: 'Label + control + hint/error wrapper. Error text uses status-danger and is programmatically associated in code.' },
  { key: 'icon-button', name: 'IconButton', category: 'primitive', maps: 'src/components/ds/IconButton.tsx', variant: { prop: 'Variant', values: ['Primary', 'Secondary', 'Ghost'] }, bool: ['Disabled'], rtl: false, description: 'Icon-only action. Requires an accessible name (aria-label) in code; 24px min target.' },
  { key: 'input', name: 'Input', category: 'primitive', maps: 'src/components/ds/Input.tsx', variant: { prop: 'State', values: ['Default', 'Focused', 'Error', 'Disabled'] }, text: ['Placeholder'], rtl: true, description: 'Single-line text input on surface-interactive; focus shows border-active + focus ring.' },
  { key: 'insight-card', name: 'InsightCard', category: 'primitive', maps: 'src/components/ds/InsightCard.tsx', variant: { prop: 'Tone', values: ['Evidence', 'Hypothesis', 'Decision'] }, text: ['Title', 'Value'], rtl: true, description: 'Reasoning insight card. Tone maps to the reasoning semantic layer.' },
  { key: 'kpi-card', name: 'KpiCard', category: 'primitive', maps: 'src/components/ds/KpiCard.tsx', variant: { prop: 'Trend', values: ['Up', 'Down', 'Flat'] }, text: ['Label', 'Value'], rtl: true, description: 'Single-metric KPI. Trend colour is supportive only; the value carries meaning.' },
  { key: 'radio', name: 'Radio', category: 'primitive', maps: 'src/components/ds/Radio.tsx', variant: { prop: 'State', values: ['Unselected', 'Selected', 'Disabled'] }, text: ['Label'], rtl: true, description: 'Single-choice input within a named group.' },
  { key: 'skeleton', name: 'Skeleton', category: 'primitive', maps: 'src/components/ds/Skeleton.tsx', variant: { prop: 'Shape', values: ['Line', 'Block', 'Circle'] }, rtl: false, description: 'Loading placeholder. Decorative; must be aria-hidden and paired with a status message.' },
  { key: 'spinner', name: 'Spinner', category: 'primitive', maps: 'src/components/ds/Spinner.tsx', variant: { prop: 'Size', values: ['S', 'M', 'L'] }, rtl: false, description: 'Indeterminate progress. Needs an accessible busy/label in code.' },
  { key: 'status-indicator', name: 'StatusIndicator', category: 'primitive', maps: 'src/components/ds/StatusIndicator.tsx', variant: { prop: 'Status', values: ['Success', 'Warning', 'Danger', 'Information', 'Neutral'] }, text: ['Label'], rtl: true, description: 'Dot + label status. Colour is never the only signal — the label is required.' },
  { key: 'switch', name: 'Switch', category: 'primitive', maps: 'src/components/ds/Switch.tsx', variant: { prop: 'State', values: ['Off', 'On', 'Disabled'] }, text: ['Label'], rtl: true, description: 'Binary toggle. On uses brand-primary; state is exposed via role=switch in code.' },
  { key: 'tabs', name: 'Tabs', category: 'primitive', maps: 'src/components/ds/Tabs.tsx', variant: { prop: 'State', values: ['Default', 'Active'] }, text: ['Label'], rtl: true, description: 'Single tab item. Active uses border-active underline; roving tabindex in code.' },
  { key: 'technical-value', name: 'TechnicalValue', category: 'primitive', maps: 'src/components/ds/TechnicalValue.tsx', variant: { prop: 'Tone', values: ['Default', 'Success', 'Warning', 'Danger'] }, text: ['Value', 'Unit'], rtl: false, description: 'Monospace measured value + unit. Uses the Technical/Mono text style; LTR numerals even under RTL.' },
  { key: 'textarea', name: 'Textarea', category: 'primitive', maps: 'src/components/ds/Textarea.tsx', variant: { prop: 'State', values: ['Default', 'Focused', 'Error', 'Disabled'] }, text: ['Placeholder'], rtl: true, description: 'Multi-line text input; same focus/error semantics as Input.' },
  { key: 'tooltip', name: 'Tooltip', category: 'primitive', maps: 'src/components/ds/Tooltip.tsx', variant: { prop: 'Side', values: ['Top', 'Bottom', 'Start', 'End'] }, text: ['Content'], rtl: true, description: 'Transient label on elevated surface. Never the sole source of essential info.' },
]

/** @type {ReadonlyArray<Family>} */
const CORE = [
  { key: 'link', name: 'Link', category: 'core', maps: null, variant: { prop: 'State', values: ['Default', 'Hover', 'Visited'] }, text: ['Label'], rtl: true, description: 'Text hyperlink. Underline on hover/focus; colour alone is insufficient.' },
  { key: 'select', name: 'Select', category: 'core', maps: null, variant: { prop: 'State', values: ['Default', 'Open', 'Disabled'] }, text: ['Value'], rtl: true, description: 'Single-select control with a listbox popover.' },
  { key: 'search', name: 'Search', category: 'core', maps: null, variant: { prop: 'State', values: ['Default', 'Focused'] }, text: ['Placeholder'], rtl: true, description: 'Search input with leading icon and clear affordance.' },
  { key: 'dropdown', name: 'Dropdown', category: 'core', maps: null, variant: { prop: 'State', values: ['Closed', 'Open'] }, text: ['Label'], rtl: true, description: 'Menu trigger + menu on elevated surface.' },
  { key: 'accordion', name: 'Accordion', category: 'core', maps: null, variant: { prop: 'State', values: ['Collapsed', 'Expanded'] }, text: ['Title'], rtl: true, description: 'Disclosure section; header is a button with aria-expanded in code.' },
  { key: 'toast', name: 'Toast', category: 'core', maps: null, variant: { prop: 'Tone', values: ['Info', 'Success', 'Warning', 'Danger'] }, text: ['Message'], rtl: true, description: 'Transient notification on E3. Announced via a live region in code.' },
  { key: 'data-table', name: 'DataTable', category: 'core', maps: null, variant: { prop: 'Density', values: ['Comfortable', 'Compact'] }, text: ['Header'], rtl: true, description: 'Header + row scaffold with sortable columns.' },
  { key: 'pagination', name: 'Pagination', category: 'core', maps: null, variant: { prop: 'State', values: ['Default'] }, bool: ['HasPrev', 'HasNext'], rtl: true, description: 'Page navigator with prev/next and page markers.' },
  { key: 'breadcrumb', name: 'Breadcrumb', category: 'core', maps: null, variant: { prop: 'State', values: ['Default'] }, text: ['Label'], rtl: true, description: 'Hierarchical trail; separators mirror under RTL.' },
  { key: 'sidebar', name: 'Sidebar', category: 'core', maps: null, variant: { prop: 'State', values: ['Expanded', 'Collapsed'] }, rtl: true, description: 'App navigation rail. Logical start edge; collapses to icons.' },
  { key: 'top-nav', name: 'TopNav', category: 'core', maps: null, variant: { prop: 'State', values: ['Default'] }, rtl: true, description: 'Top application bar with brand, search and user menu slots.' },
  { key: 'language-selector', name: 'LanguageSelector', category: 'core', maps: null, variant: { prop: 'Locale', values: ['FA', 'EN', 'DE'] }, rtl: true, description: 'Locale switcher. FA sets document direction RTL; EN/DE LTR.' },
  { key: 'user-menu', name: 'UserMenu', category: 'core', maps: null, variant: { prop: 'State', values: ['Closed', 'Open'] }, text: ['Name'], rtl: true, description: 'Account menu trigger + popover.' },
]

/** @type {ReadonlyArray<Family>} */
const INDUSTRIAL = [
  { key: 'industrial-signal-tile', name: 'IndustrialSignalTile', category: 'industrial', maps: null, variant: { prop: 'Status', values: ['Healthy', 'Warning', 'Fault', 'Offline'] }, text: ['Tag', 'Value', 'Unit'], rtl: false, description: 'Live signal tile (tag/value/unit). Status colour supports, never replaces, the textual state; values stay LTR.' },
  { key: 'fault-hypothesis-card', name: 'FaultHypothesisCard', category: 'industrial', maps: null, variant: { prop: 'Confidence', values: ['High', 'Medium', 'Low'] }, text: ['Hypothesis'], rtl: true, description: 'Diagnostic hypothesis with an explicit confidence level; uses the reasoning layer.' },
  { key: 'evidence-item', name: 'EvidenceItem', category: 'industrial', maps: null, variant: { prop: 'Kind', values: ['Evidence', 'Contradiction', 'Missing'] }, text: ['Label'], rtl: true, description: 'Single evidence row. Missing evidence pairs with a dashed treatment.' },
  { key: 'confidence-indicator', name: 'ConfidenceIndicator', category: 'industrial', maps: null, variant: { prop: 'Level', values: ['High', 'Medium', 'Low'] }, text: ['Label'], rtl: true, description: 'Explicit uncertainty indicator; numeric confidence is stated, never implied by colour alone.' },
  { key: 'safe-action-panel', name: 'SafeActionPanel', category: 'industrial', maps: null, variant: { prop: 'State', values: ['Ready', 'Blocked', 'Executed'] }, text: ['Action'], rtl: true, description: 'Human-decision safe-action panel with interlock state; Blocked disables execution.' },
  { key: 'timeline', name: 'Timeline', category: 'industrial', maps: null, variant: { prop: 'State', values: ['Default'] }, text: ['Label'], rtl: true, description: 'Event timeline row with timestamp and marker.' },
  { key: 'asset-status-block', name: 'AssetStatusBlock', category: 'industrial', maps: null, variant: { prop: 'Status', values: ['Running', 'Idle', 'Down', 'Maintenance'] }, text: ['Asset'], rtl: true, description: 'Asset health summary block; status is labelled and colour-supported.' },
]

/** @type {ReadonlyArray<Family>} */
const FAMILIES = [...PRIMITIVES, ...CORE, ...INDUSTRIAL]

module.exports = { PRIMITIVES, CORE, INDUSTRIAL, FAMILIES, TONE_TOKEN }
