// @ts-check
'use strict'
/**
 * FINAL-revision component registry: 44 families (23 primitives mapped to
 * src/components/ds/*.tsx, 13 core, 7 industrial, 1 Icon utility) declared as
 * production anatomy blueprints (presets.js) with variant AXES, interaction
 * STATES, per-value overrides, bound TEXT/BOOLEAN/INSTANCE_SWAP properties,
 * Direction (LTR/RTL) axes where horizontal ordering matters, sizing/touch
 * rules and accessibility descriptions.
 *
 * Renames (same assetKey — completed, NOT duplicated): KpiCard → MetricCard,
 * TopNav → TopNavigation, Timeline → TimelineEventRow.
 *
 * Family shape:
 *   key, name, category, maps
 *   preset, presetOpts        anatomy blueprint (presets.js)
 *   axes: [{prop, values}]    variant axes (cartesian product = components)
 *   valueOverrides?: {axisProp: {value: overrides[]}}   family-specific looks
 *   text/bools/swaps: [{name, role}]                    bound component props
 *   dirAxis?: true            adds Direction=LTR/RTL axis (renderer mirrors rows)
 *   a11y: accessible-usage contract (joined into description + annotation)
 *   description
 */

const { PRESETS } = require('./presets')

/** Variant VALUE keyword → semantic color token (dot/accent default mapping). */
const TONE_TOKEN = Object.freeze({
  Primary: 'Color/Brand/Primary', Brand: 'Color/Brand/Primary', Decision: 'Color/Reasoning/Decision',
  Secondary: 'Color/Text/Secondary', Ghost: 'Color/Text/Muted', Neutral: 'Color/Text/Muted',
  Success: 'Color/Status/Success', Healthy: 'Color/Status/Success', Running: 'Color/Status/Success', On: 'Color/Status/Success', Up: 'Color/Status/Success',
  Warning: 'Color/Status/Warning', Missing: 'Color/Reasoning/Missing', Maintenance: 'Color/Status/Warning', Idle: 'Color/Status/Warning', Flat: 'Color/Text/Muted',
  Danger: 'Color/Status/Danger', Fault: 'Color/Status/Danger', Down: 'Color/Status/Danger', Contradiction: 'Color/Reasoning/Contradiction',
  Information: 'Color/Status/Information', Info: 'Color/Status/Information', Offline: 'Color/Text/Disabled',
  Evidence: 'Color/Reasoning/Evidence', Hypothesis: 'Color/Reasoning/Hypothesis',
  High: 'Color/Status/Success', Medium: 'Color/Status/Warning', Low: 'Color/Status/Danger',
  Blocked: 'Color/Status/Danger', Ready: 'Color/Status/Success', Executed: 'Color/Reasoning/Decision',
})

const ON_BRAND = [{ role: 'Label', set: { textFill: 'Color/Brand/OnBrand' } }]
const INTERACTIVE_STATES = ['Default', 'Hover', 'Focus', 'Disabled']

/** @param {string} prop @param {string[]} values */
const axis = (prop, values) => ({ prop, values })
/** @param {string} name @param {string} role */
const p = (name, role) => ({ name, role })

/** @type {any[]} */
const PRIMITIVES = [
  {
    key: 'button', name: 'Button', category: 'primitive', maps: 'src/components/ds/Button.tsx',
    preset: 'control', presetOpts: { icon: true, spinner: true, label: 'Action' },
    axes: [axis('Variant', ['Primary', 'Secondary', 'Ghost', 'Danger']), axis('State', ['Default', 'Hover', 'Focus', 'Disabled', 'Loading'])],
    valueOverrides: {
      Variant: {
        Primary: [{ role: 'root', set: { fill: 'Color/Brand/Primary', stroke: null } }, ...ON_BRAND],
        Secondary: [],
        Ghost: [{ role: 'root', set: { fill: null, stroke: null } }],
        Danger: [{ role: 'root', set: { fill: 'Color/Status/Danger', stroke: null } }, ...ON_BRAND],
      },
      State: { Hover: [{ role: 'root', set: { fill: 'Color/Brand/Hover' } }] },
    },
    text: [p('Label', 'Label')], bools: [p('ShowIcon', 'IconSlot')], swaps: [p('Icon', 'IconSlot')], dirAxis: true,
    a11y: 'Accessible name = Label; on-brand text is dark (11.0:1); focus ring 2px + halo; min target 40px.',
    description: 'Primary action control.',
  },
  {
    key: 'icon-button', name: 'IconButton', category: 'primitive', maps: 'src/components/ds/IconButton.tsx',
    preset: 'control', presetOpts: { icon: true, label: '', padX: 10, minH: 40 },
    axes: [axis('Variant', ['Primary', 'Secondary', 'Ghost']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: { Variant: { Primary: [{ role: 'root', set: { fill: 'Color/Brand/Primary', stroke: null } }], Ghost: [{ role: 'root', set: { fill: null, stroke: null } }] } },
    bools: [], swaps: [p('Icon', 'IconSlot')],
    a11y: 'Icon-only: REQUIRES aria-label in code; 40px min target; focus ring 2px.',
    description: 'Icon-only action.', hideLabel: true,
  },
  {
    key: 'badge', name: 'Badge', category: 'primitive', maps: 'src/components/ds/Badge.tsx',
    preset: 'control', presetOpts: { label: 'Badge', padX: 10, padY: 4, minH: 24, radius: 9999, textStyle: 'Caption' },
    axes: [axis('Tone', ['Neutral', 'Brand', 'Success', 'Warning', 'Danger'])],
    valueOverrides: { Tone: { Brand: [{ role: 'root', set: { stroke: 'Color/Brand/Primary' } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }], Success: [{ role: 'Label', set: { textFill: 'Color/Status/Success' } }], Warning: [{ role: 'Label', set: { textFill: 'Color/Status/Warning' } }], Danger: [{ role: 'Label', set: { textFill: 'Color/Status/Danger' } }] } },
    text: [p('Label', 'Label')], dirAxis: false,
    a11y: 'Non-interactive; never the sole carrier of meaning — label text required.',
    description: 'Compact status/label chip.',
  },
  {
    key: 'alert', name: 'Alert', category: 'primitive', maps: 'src/components/ds/Alert.tsx',
    preset: 'listRow', presetOpts: { title: 'Alert title', meta: 'Alert message with room for long localized copy.', dismiss: true, minW: 360 },
    axes: [axis('Tone', ['Info', 'Success', 'Warning', 'Danger'])],
    text: [p('Title', 'Title'), p('Message', 'Meta')], bools: [p('Dismissible', 'Dismiss')], dirAxis: true,
    a11y: 'role=alert/status in code; icon+text meet 4.5:1 on tinted surface; dismiss target ≥40px.',
    description: 'Inline alert banner.',
  },
  {
    key: 'card', name: 'Card', category: 'primitive', maps: 'src/components/ds/Card.tsx',
    preset: 'card', presetOpts: { title: 'Card title', meta: 'Metadata', minW: 300 },
    axes: [axis('Elevation', ['E1', 'E2', 'E3'])],
    text: [p('Title', 'Title'), p('Body', 'Body')], dirAxis: true, elevationAxis: true,
    a11y: 'Surface container; heading order preserved in code; body on surface-primary ≥ 9.6:1.',
    description: 'Surface container; Elevation binds the E1–E3 effect styles.',
  },
  {
    key: 'checkbox', name: 'Checkbox', category: 'primitive', maps: 'src/components/ds/Checkbox.tsx',
    preset: 'toggle', presetOpts: { kind: 'checkbox', label: 'Option' },
    axes: [axis('Value', ['Unchecked', 'Checked', 'Indeterminate']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: {
      Value: {
        Checked: [{ role: 'Knob', set: { hidden: false } }, { role: 'Mark', set: { stroke: 'Color/Brand/Primary' } }],
        Indeterminate: [{ role: 'Knob', set: { hidden: false } }, { role: 'Mark', set: { stroke: 'Color/Brand/Primary' } }],
      },
      State: { Hover: [{ role: 'Mark', set: { stroke: 'Color/Brand/Hover' } }], Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'Native checkbox semantics in code; label programmatically associated; 40px row target.',
    description: 'Boolean input.',
  },
  {
    key: 'radio', name: 'Radio', category: 'primitive', maps: 'src/components/ds/Radio.tsx',
    preset: 'toggle', presetOpts: { kind: 'radio', label: 'Choice' },
    axes: [axis('Value', ['Unselected', 'Selected']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: {
      Value: { Selected: [{ role: 'Knob', set: { hidden: false } }, { role: 'Mark', set: { stroke: 'Color/Brand/Primary' } }] },
      State: { Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'Single choice within a named radiogroup; label associated; 40px row target.',
    description: 'Single-choice input.',
  },
  {
    key: 'switch', name: 'Switch', category: 'primitive', maps: 'src/components/ds/Switch.tsx',
    preset: 'toggle', presetOpts: { kind: 'switch', label: 'Enabled' },
    axes: [axis('Value', ['Off', 'On']), axis('State', INTERACTIVE_STATES)],
    valueOverrides: {
      Value: { On: [{ role: 'Mark', set: { fill: 'Color/Brand/Primary', stroke: null } }, { role: 'Knob', set: { fill: 'Color/Brand/OnBrand' } }] },
      State: { Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'role=switch with state announced; label associated; 40px row target.',
    description: 'Binary toggle.',
  },
  {
    key: 'input', name: 'Input', category: 'primitive', maps: 'src/components/ds/Input.tsx',
    preset: 'field', presetOpts: { label: 'Label', value: 'Value', hint: 'Helper text' },
    axes: [axis('State', ['Default', 'Hover', 'Focus', 'Error', 'Disabled'])],
    valueOverrides: {
      State: {
        Hover: [{ role: 'Box', set: { stroke: 'Color/Border/Active' } }],
        Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
        Error: [{ role: 'Box', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }, { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }],
        Disabled: [{ role: 'root', set: { opacity: 0.55 } }, { role: 'Value', set: { textFill: 'Color/Text/Disabled' } }],
      },
    },
    text: [p('Label', 'Label'), p('Value', 'Value'), p('Hint', 'Hint')], bools: [p('ShowHint', 'Hint')], dirAxis: true,
    a11y: 'Label + error programmatically associated; error uses text+color; 40px box.',
    description: 'Single-line text input.',
  },
  {
    key: 'textarea', name: 'Textarea', category: 'primitive', maps: 'src/components/ds/Textarea.tsx',
    preset: 'field', presetOpts: { label: 'Label', value: 'Multi-line value that wraps across lines to prove long-text resilience.', hint: 'Helper text', tall: true },
    axes: [axis('State', ['Default', 'Focus', 'Error', 'Disabled'])],
    valueOverrides: { State: { Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }], Error: [{ role: 'Box', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }, { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }], Disabled: [{ role: 'root', set: { opacity: 0.55 } }] } },
    text: [p('Label', 'Label'), p('Value', 'Value'), p('Hint', 'Hint')], dirAxis: true,
    a11y: 'Same semantics as Input; wrapping value text (fixed width, auto height).',
    description: 'Multi-line text input.',
  },
  {
    key: 'form-field', name: 'FormField', category: 'primitive', maps: 'src/components/ds/FormField.tsx',
    preset: 'field', presetOpts: { label: 'Field label', value: 'Control slot', hint: 'Hint or error' },
    axes: [axis('State', ['Default', 'Error', 'Disabled'])],
    valueOverrides: { State: { Error: [{ role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }], Disabled: [{ role: 'root', set: { opacity: 0.55 } }] } },
    text: [p('Label', 'Label'), p('Hint', 'Hint')], dirAxis: true,
    a11y: 'Wrapper contract: label/hint/error association happens in code.',
    description: 'Label + control + hint/error wrapper.',
  },
  {
    key: 'dialog', name: 'Dialog', category: 'primitive', maps: 'src/components/ds/Dialog.tsx',
    preset: 'overlay', presetOpts: { title: 'Dialog title', actions: ['Confirm', 'Cancel'] },
    axes: [axis('Size', ['S', 'M', 'L'])],
    valueOverrides: { Size: { S: [{ role: 'root', set: { minW: 320 } }], M: [{ role: 'root', set: { minW: 420 } }], L: [{ role: 'root', set: { minW: 560 } }] } },
    text: [p('Title', 'Title'), p('Body', 'Body'), p('ConfirmLabel', 'PrimaryLabel'), p('CancelLabel', 'SecondaryLabel')], dirAxis: true, elevation: 'Elevation/E4',
    a11y: 'aria-modal + labelled title + focus trap in code; E4 elevation on glass overlay.',
    description: 'Modal dialog.',
  },
  {
    key: 'drawer', name: 'Drawer', category: 'primitive', maps: 'src/components/ds/Drawer.tsx',
    preset: 'overlay', presetOpts: { title: 'Drawer title', actions: ['Apply'] },
    axes: [axis('Side', ['Start', 'End'])],
    text: [p('Title', 'Title'), p('Body', 'Body')], dirAxis: true, elevation: 'Elevation/E3',
    a11y: 'Side is logical (Start/End) so it mirrors under RTL; focus trap in code.',
    description: 'Edge panel.',
  },
  {
    key: 'tooltip', name: 'Tooltip', category: 'primitive', maps: 'src/components/ds/Tooltip.tsx',
    preset: 'overlay', presetOpts: { title: 'Tooltip', minW: 160 },
    axes: [axis('Side', ['Top', 'Bottom', 'Start', 'End'])],
    text: [p('Content', 'Title')], dirAxis: false, elevation: 'Elevation/E2', trimBody: true,
    a11y: 'Supplementary only — never the sole source of essential info; shown on hover AND focus.',
    description: 'Transient label.',
  },
  {
    key: 'tabs', name: 'Tabs', category: 'primitive', maps: 'src/components/ds/Tabs.tsx',
    preset: 'control', presetOpts: { label: 'Tab', radius: 0, minH: 40 },
    axes: [axis('State', ['Default', 'Hover', 'Active', 'Focus', 'Disabled'])],
    valueOverrides: { State: { Active: [{ role: 'root', set: { stroke: 'Color/Border/Active', strokeW: 2 } }, { role: 'Label', set: { textFill: 'Color/Text/Primary' } }], Default: [{ role: 'Label', set: { textFill: 'Color/Text/Secondary' } }] } },
    text: [p('Label', 'Label')], dirAxis: true,
    a11y: 'Single tab item; roving tabindex + aria-selected in code; active underline + text (not color-only).',
    description: 'Tab item.',
  },
  {
    key: 'status-indicator', name: 'StatusIndicator', category: 'primitive', maps: 'src/components/ds/StatusIndicator.tsx',
    preset: 'listRow', presetOpts: { title: 'Operational', meta: false, padX: 10, padY: 4, minW: 140, fill: null, stroke: null, strokeW: 0 },
    axes: [axis('Status', ['Success', 'Warning', 'Danger', 'Information', 'Neutral'])],
    text: [p('Label', 'Title')], dirAxis: true,
    a11y: 'Dot color NEVER alone — label required; dot 10px + label ≥ Body/M.',
    description: 'Dot + label status.',
  },
  {
    key: 'technical-value', name: 'TechnicalValue', category: 'primitive', maps: 'src/components/ds/TechnicalValue.tsx',
    preset: 'tile', presetOpts: { tag: 'FLOW.PV', value: '96.2', unit: 'm³/h', meta: 'LTR numerals enforced' },
    axes: [axis('Tone', ['Default', 'Success', 'Warning', 'Danger'])],
    valueOverrides: { Tone: { Default: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }] } },
    text: [p('Value', 'Value'), p('Unit', 'Unit'), p('Tag', 'Tag')], dirAxis: false,
    a11y: 'Monospace measured value; numerals stay LTR even in RTL context.',
    description: 'Measured value + unit.',
  },
  {
    key: 'kpi-card', name: 'MetricCard', category: 'primitive', maps: 'src/components/ds/KpiCard.tsx',
    preset: 'card', presetOpts: { title: 'Availability', value: '99.2', unit: '%', meta: 'vs last week', minW: 260 },
    axes: [axis('Trend', ['Up', 'Down', 'Flat']), axis('State', ['Default', 'Loading', 'Error'])],
    valueOverrides: {
      Trend: { Down: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }] },
      State: { Loading: [{ role: 'Value', set: { textFill: 'Color/Text/Muted' } }], Error: [{ role: 'EmptyNote', set: { hidden: false, textFill: 'Color/Status/Danger' } }, { role: 'ValueRow', set: { hidden: true } }] },
    },
    text: [p('Label', 'Title'), p('Value', 'Value'), p('Unit', 'Unit')], dirAxis: true,
    a11y: 'Value carries meaning; trend color supportive only; loading/error stated in text.',
    description: 'Single-metric KPI card (renamed from KpiCard — same managed asset).',
  },
  {
    key: 'insight-card', name: 'InsightCard', category: 'primitive', maps: 'src/components/ds/InsightCard.tsx',
    preset: 'card', presetOpts: { title: 'Insight', value: '0.87', meta: 'confidence', minW: 280 },
    axes: [axis('Tone', ['Evidence', 'Hypothesis', 'Decision'])],
    text: [p('Title', 'Title'), p('Value', 'Value')], dirAxis: true,
    a11y: 'Reasoning tone mapped to the reasoning semantic layer; uncertainty stated numerically.',
    description: 'Reasoning insight card.',
  },
  {
    key: 'empty-state', name: 'EmptyState', category: 'primitive', maps: 'src/components/ds/EmptyState.tsx',
    preset: 'card', presetOpts: { title: 'Nothing here yet', body: 'Guidance copy telling the user what to do next, resilient to long FA/DE strings.', action: 'Create first item', minW: 320 },
    axes: [axis('Tone', ['Neutral', 'Brand'])],
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')], dirAxis: true,
    a11y: 'Always offers a next action; action is a real ≥40px target.',
    description: 'Zero-data placeholder.',
  },
  {
    key: 'error-state', name: 'ErrorState', category: 'primitive', maps: 'src/components/ds/ErrorState.tsx',
    preset: 'card', presetOpts: { title: 'Something went wrong', body: 'Recoverable error description with a retry affordance.', action: 'Retry', dotFill: 'Color/Status/Danger', minW: 320 },
    axes: [axis('Tone', ['Danger', 'Warning'])],
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')], dirAxis: true,
    a11y: 'Error announced via live region in code; retry is a ≥40px target.',
    description: 'Recoverable error surface.',
  },
  {
    key: 'skeleton', name: 'Skeleton', category: 'primitive', maps: 'src/components/ds/Skeleton.tsx',
    preset: 'loader', presetOpts: {},
    axes: [axis('Shape', ['Line', 'Block', 'Circle'])],
    shapeAxis: true, dirAxis: false,
    a11y: 'Decorative: aria-hidden; paired with a textual busy status in code.',
    description: 'Loading placeholder.',
  },
  {
    key: 'spinner', name: 'Spinner', category: 'primitive', maps: 'src/components/ds/Spinner.tsx',
    preset: 'loader', presetOpts: { kind: 'spinner' },
    axes: [axis('Size', ['S', 'M', 'L'])],
    sizeAxis: true, dirAxis: false,
    a11y: 'Indeterminate progress; accessible busy label in code.',
    description: 'Indeterminate progress.',
  },
]

/** @type {any[]} */
const CORE = [
  {
    key: 'link', name: 'Link', category: 'core', maps: null,
    preset: 'control', presetOpts: { label: 'Learn more', padX: 2, padY: 2, minH: 24, textStyle: 'Body/M' },
    axes: [axis('State', ['Default', 'Hover', 'Focus', 'Visited'])],
    valueOverrides: { State: { Default: [{ role: 'root', set: { fill: null, stroke: null } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }], Hover: [{ role: 'root', set: { fill: null } }, { role: 'Label', set: { textFill: 'Color/Brand/Hover' } }], Visited: [{ role: 'root', set: { fill: null, stroke: null } }, { role: 'Label', set: { textFill: 'Color/Brand/Pressed' } }] } },
    text: [p('Label', 'Label')], dirAxis: false,
    a11y: 'Underline on hover/focus in code; color alone insufficient.',
    description: 'Text hyperlink.',
  },
  {
    key: 'select', name: 'Select', category: 'core', maps: null,
    preset: 'field', presetOpts: { label: 'Select', value: 'Selected option', trailMark: true },
    axes: [axis('State', ['Default', 'Open', 'Focus', 'Error', 'Disabled'])],
    valueOverrides: { State: { Open: [{ role: 'Box', set: { stroke: 'Color/Border/Active' } }], Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }], Error: [{ role: 'Box', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }, { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } }], Disabled: [{ role: 'root', set: { opacity: 0.55 } }] } },
    text: [p('Label', 'Label'), p('Value', 'Value')], dirAxis: true,
    a11y: 'Combobox semantics + listbox popover in code; chevron mirrors under RTL.',
    description: 'Single-select control.',
  },
  {
    key: 'search', name: 'Search', category: 'core', maps: null,
    preset: 'field', presetOpts: { label: 'Search', value: 'Search assets, cases, signals…', leadIcon: true },
    axes: [axis('State', ['Default', 'Focus'])],
    valueOverrides: { State: { Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] } },
    text: [p('Placeholder', 'Value')], swaps: [p('LeadIcon', 'IconSlot')], dirAxis: true,
    a11y: 'type=search with clear affordance in code; icon decorative.',
    description: 'Search input.',
  },
  {
    key: 'dropdown', name: 'Dropdown', category: 'core', maps: null,
    preset: 'overlay', presetOpts: { title: 'Menu', minW: 220 },
    axes: [axis('State', ['Closed', 'Open'])],
    valueOverrides: { State: { Closed: [{ role: 'Body', set: { hidden: true } }] } },
    text: [p('Label', 'Title')], dirAxis: true, elevation: 'Elevation/E2',
    a11y: 'Menu button + menu roles in code; E2 elevation when open.',
    description: 'Menu trigger + menu.',
  },
  {
    key: 'accordion', name: 'Accordion', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Section title', meta: 'Expanded section content that can hold long localized copy.', minW: 360 },
    axes: [axis('State', ['Collapsed', 'Expanded'])],
    valueOverrides: { State: { Collapsed: [{ role: 'Meta', set: { hidden: true } }] } },
    text: [p('Title', 'Title'), p('Content', 'Meta')], dirAxis: true,
    a11y: 'Header is a button with aria-expanded in code; 40px header target.',
    description: 'Disclosure section.',
  },
  {
    key: 'toast', name: 'Toast', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Saved', meta: 'Change stored successfully.', dismiss: true, fill: 'Color/Surface/Elevated', minW: 320 },
    axes: [axis('Tone', ['Info', 'Success', 'Warning', 'Danger'])],
    text: [p('Message', 'Meta'), p('Title', 'Title')], dirAxis: true, elevation: 'Elevation/E3',
    a11y: 'Announced via polite/assertive live region in code; E3 elevation.',
    description: 'Transient notification.',
  },
  {
    key: 'data-table', name: 'DataTable', category: 'core', maps: null,
    preset: 'table', presetOpts: {},
    axes: [axis('Density', ['Comfortable', 'Compact']), axis('State', ['Default', 'Empty', 'Loading', 'Error'])],
    valueOverrides: {
      State: {
        Empty: [{ role: 'Body', set: { hidden: true } }, { role: 'EmptyNote', set: { hidden: false } }],
        Loading: [{ role: 'Body', set: { hidden: true } }, { role: 'LoadingNote', set: { hidden: false } }],
        Error: [{ role: 'Body', set: { hidden: true } }, { role: 'ErrorNote', set: { hidden: false } }],
      },
    },
    densityAxis: true,
    text: [p('Header', 'Header')], dirAxis: true,
    a11y: 'th scope + sortable state in code; row height ≥40px comfortable / 32px compact; empty/loading/error are textual.',
    description: 'Header + rows scaffold with real empty/loading/error states.',
  },
  {
    key: 'pagination', name: 'Pagination', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Page 3 of 12', meta: false, trail: '‹ ›', minW: 220, fill: null, stroke: null, strokeW: 0 },
    axes: [axis('State', ['Default', 'FirstPage', 'LastPage'])],
    bools: [p('HasPrev', 'StateDot'), p('HasNext', 'Trail')],
    text: [p('Label', 'Title')], dirAxis: true,
    a11y: 'nav landmark + current-page announced; prev marker = lead dot, next marker = trail arrows; both ≥40px row; arrows mirror in RTL.',
    description: 'Page navigator.',
  },
  {
    key: 'breadcrumb', name: 'Breadcrumb', category: 'core', maps: null,
    preset: 'listRow', presetOpts: { title: 'Assets / Site A / PLC-104', meta: false, minW: 280, fill: null, stroke: null, strokeW: 0, padY: 4 },
    axes: [axis('State', ['Default'])],
    text: [p('Path', 'Title')], dirAxis: true,
    a11y: 'nav landmark; separators decorative and mirrored under RTL; current item aria-current.',
    description: 'Hierarchical trail.',
  },
  {
    key: 'sidebar', name: 'Sidebar', category: 'core', maps: null,
    preset: 'shell', presetOpts: { kind: 'sidebar' },
    axes: [axis('State', ['Expanded', 'Collapsed'])],
    valueOverrides: { State: { Collapsed: [{ role: 'root', set: { w: 64 } }] } }, collapseAxis: true,
    dirAxis: true,
    a11y: 'nav landmark; active item marked by fill+dot+text; 40px items; collapses to icons with tooltips in code.',
    description: 'App navigation rail.',
  },
  {
    key: 'top-nav', name: 'TopNavigation', category: 'core', maps: null,
    preset: 'shell', presetOpts: {},
    axes: [axis('State', ['Default'])],
    text: [p('UserName', 'UserName')], swaps: [p('SearchIcon', 'SearchSlot')], dirAxis: true,
    a11y: 'banner landmark; brand → home; user chip ≥40px target.',
    description: 'Top application bar (renamed from TopNav — same managed asset).',
  },
  {
    key: 'language-selector', name: 'LanguageSelector', category: 'core', maps: null,
    preset: 'control', presetOpts: { label: 'FA · EN · DE', padX: 12, minH: 36, textStyle: 'Body/S' },
    axes: [axis('Locale', ['FA', 'EN', 'DE']), axis('State', ['Default', 'Open'])],
    valueOverrides: {
      Locale: { FA: [{ role: 'Label', set: { text: 'فارسی' } }], EN: [{ role: 'Label', set: { text: 'English' } }], DE: [{ role: 'Label', set: { text: 'Deutsch' } }] },
      State: { Open: [{ role: 'root', set: { stroke: 'Color/Border/Active' } }] },
    },
    dirAxis: true,
    a11y: 'Current locale announced; FA switches document dir to RTL.',
    description: 'Locale switcher.',
  },
  {
    key: 'user-menu', name: 'UserMenu', category: 'core', maps: null,
    preset: 'overlay', presetOpts: { title: 'user@hermesnovin.com', minW: 260, actions: ['Sign out'] },
    axes: [axis('State', ['Closed', 'Open'])],
    valueOverrides: { State: { Closed: [{ role: 'Body', set: { hidden: true } }, { role: 'ActionRow', set: { hidden: true } }] } },
    text: [p('Name', 'Title')], dirAxis: true, elevation: 'Elevation/E2',
    a11y: 'Menu semantics; trigger ≥40px; focus returns to trigger on close (code).',
    description: 'Account menu.',
  },
]

/** @type {any[]} */
const INDUSTRIAL = [
  {
    key: 'industrial-signal-tile', name: 'IndustrialSignalTile', category: 'industrial', maps: null,
    preset: 'tile', presetOpts: {},
    axes: [axis('Status', ['Healthy', 'Warning', 'Fault', 'Offline'])],
    valueOverrides: { Status: { Offline: [{ role: 'ValueRow', set: { hidden: true } }, { role: 'EmptyNote', set: { hidden: false } }] } },
    text: [p('Tag', 'Tag'), p('Value', 'Value'), p('Unit', 'Unit')], dirAxis: false,
    a11y: 'Status is textual (tag+meta), color supportive; numerals LTR; Offline shows an explicit no-data note.',
    description: 'Live signal tile.',
  },
  {
    key: 'fault-hypothesis-card', name: 'FaultHypothesisCard', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Bearing wear on drive end', body: 'Hypothesis derived from vibration + temperature correlation.', meta: 'Confidence stated explicitly', dotFill: 'Color/Reasoning/Hypothesis', minW: 320 },
    axes: [axis('Confidence', ['High', 'Medium', 'Low'])],
    text: [p('Hypothesis', 'Title'), p('Rationale', 'Body')], dirAxis: true,
    a11y: 'Model inference clearly separated from evidence; confidence is text + tone.',
    description: 'Diagnostic hypothesis.',
  },
  {
    key: 'evidence-item', name: 'EvidenceItem', category: 'industrial', maps: null,
    preset: 'listRow', presetOpts: { title: 'Vibration RMS 4.2 mm/s', meta: 'Sensor VIB-3 · 12:04:31', trail: '№', minW: 340 },
    axes: [axis('Kind', ['Evidence', 'Contradiction', 'Missing'])],
    valueOverrides: { Kind: { Missing: [{ role: 'root', set: { stroke: 'Color/Reasoning/Missing' } }] } },
    text: [p('Label', 'Title'), p('Source', 'Meta')], dirAxis: true,
    a11y: 'Kind is textual; Missing pairs color with a distinct border treatment (dashed in code).',
    description: 'Single evidence row.',
  },
  {
    key: 'confidence-indicator', name: 'ConfidenceIndicator', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Confidence', value: '0.87', minW: 200 },
    axes: [axis('Level', ['High', 'Medium', 'Low'])],
    text: [p('Label', 'Title'), p('Value', 'Value')], dirAxis: true,
    a11y: 'Numeric confidence ALWAYS stated; level color is supportive.',
    description: 'Explicit uncertainty indicator.',
  },
  {
    key: 'safe-action-panel', name: 'SafeActionPanel', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Reduce line speed to 60%', body: 'Interlock verified. Human approval required before execution.', action: 'Approve action', minW: 340 },
    axes: [axis('State', ['Ready', 'Blocked', 'Executed'])],
    valueOverrides: { State: { Blocked: [{ role: 'Action', set: { fill: 'Color/Surface/Interactive' } }, { role: 'ActionLabel', set: { textFill: 'Color/Text/Disabled' } }], Executed: [{ role: 'ActionLabel', set: { text: 'Executed' } }] } },
    text: [p('Action', 'Title'), p('Detail', 'Body'), p('ButtonLabel', 'ActionLabel')], dirAxis: true,
    a11y: 'Blocked disables execution (visual + semantic); decision is human, recorded.',
    description: 'Human-decision safe-action panel.',
  },
  {
    key: 'timeline', name: 'TimelineEventRow', category: 'industrial', maps: null,
    preset: 'listRow', presetOpts: { title: 'Alarm acknowledged', meta: '2026-07-30 11:42:03 · operator A', trail: '11:42', minW: 360 },
    axes: [axis('State', ['Default', 'Empty'])],
    valueOverrides: { State: { Empty: [{ role: 'Content', set: { hidden: true } }, { role: 'Trail', set: { hidden: true } }] } },
    text: [p('Label', 'Title'), p('Timestamp', 'Meta')], dirAxis: true,
    a11y: 'Timestamp monospace LTR; marker decorative; row ≥40px (renamed from Timeline — same managed asset).',
    description: 'Event timeline row.',
  },
  {
    key: 'asset-status-block', name: 'AssetStatusBlock', category: 'industrial', maps: null,
    preset: 'card', presetOpts: { title: 'Compressor C-201', meta: 'Site A · Line 2', minW: 280 },
    axes: [axis('Status', ['Running', 'Idle', 'Down', 'Maintenance'])],
    text: [p('Asset', 'Title')], dirAxis: true,
    a11y: 'Status labelled and colour-supported; block links to asset detail in code.',
    description: 'Asset health summary.',
  },
]

/** Icon utility family (INSTANCE_SWAP targets). Geometric marks only — honest, font-free. */
const ICON = {
  key: 'icon', name: 'Icon', category: 'core', maps: null,
  preset: 'iconMark', presetOpts: {},
  axes: [axis('Mark', ['Dot', 'Ring', 'Square', 'Bar', 'Diamond'])],
  markAxis: true, dirAxis: false,
  a11y: 'Decorative geometric marks; meaning always carried by adjacent text.',
  description: 'Geometric icon marks used by instance-swap slots.',
}

/** @type {any[]} */
const FAMILIES = [...PRIMITIVES, ...CORE, ICON, ...INDUSTRIAL]

// derived helpers -------------------------------------------------------------
/** Cartesian variant combos for a family. @param {any} fam @returns {Record<string,string>[]} */
function variantCombos(fam) {
  /** @type {Record<string,string>[]} */
  let combos = [{}]
  const axes = [...fam.axes, ...(fam.dirAxis ? [{ prop: 'Direction', values: ['LTR', 'RTL'] }] : [])]
  for (const ax of axes) {
    const next = []
    for (const c of combos) for (const v of ax.values) next.push({ ...c, [ax.prop]: v })
    combos = next
  }
  return combos
}
/** Total variant components across all families. */
function totalVariants() {
  return FAMILIES.reduce((n, f) => n + variantCombos(f).length, 0)
}

module.exports = { PRIMITIVES, CORE, INDUSTRIAL, ICON, FAMILIES, TONE_TOKEN, variantCombos, totalVariants }
