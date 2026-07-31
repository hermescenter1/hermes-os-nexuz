// @ts-check
'use strict'
/**
 * Anatomy + state DSL for the FINAL production-fidelity revision.
 *
 * A family's visual contract is declared as a pure tree of NodeSpecs plus
 * state/tone override tables. The Figma renderer (figma-exec) interprets these;
 * the tests validate them (roles unique, tokens exist, bindings resolvable)
 * WITHOUT needing Figma. Everything here is pure data + pure helpers.
 *
 * NodeSpec:
 *   role      unique-within-family layer name (semantic, used for bindings/overrides)
 *   type      'frame' | 'text' | 'ellipse' | 'rect' | 'iconSlot'
 *   row       frame only: horizontal auto-layout (default vertical)
 *   gap,padX,padY   auto-layout metrics (px, token-derived at call sites)
 *   fill,stroke     token name from tokens.js paint styles (e.g. 'Color/Surface/Primary')
 *   strokeW,radius  px
 *   w,h,minW,minH,maxW  sizing (px); text with maxW wraps (textAutoResize HEIGHT)
 *   grow      'fill' → layoutSizingHorizontal FILL inside parent
 *   center    frame only: counterAxisAlignItems CENTER
 *   textStyle ramp name from tokens.js TEXT_STYLES (e.g. 'Body/M')
 *   textFill  token name for the text paint
 *   text      default characters (EN)
 *   hidden    initially invisible (bound bools reveal)
 *   children  NodeSpec[]
 */

/** Token-derived metric constants (mirror the globals.css space + radius tokens). */
const M = Object.freeze({
  controlX: 16, controlY: 10, card: 20, panel: 24,
  radiusSm: 6, radiusMd: 8, radiusLg: 12, radiusFull: 9999,
  gap: 8, gapTight: 4, gapWide: 12,
  touchMin: 40, // min interactive height (touch target incl. border)
})

// tiny builders --------------------------------------------------------------
/** @param {string} role @param {any} [o] */
const frame = (role, o) => Object.assign({ role, type: 'frame', children: [] }, o)
/** @param {string} role @param {string} text @param {string} textStyle @param {string} textFill @param {any} [o] */
const txt = (role, text, textStyle, textFill, o) => Object.assign({ role, type: 'text', text, textStyle, textFill }, o)
/** @param {string} role @param {number} d @param {string} fill @param {any} [o] */
const dot = (role, d, fill, o) => Object.assign({ role, type: 'ellipse', w: d, h: d, fill }, o)
/** @param {string} role @param {any} [o] */
const rect = (role, o) => Object.assign({ role, type: 'rect' }, o)
/** @param {string} role @param {any} [o] */
const iconSlot = (role, o) => Object.assign({ role, type: 'iconSlot', w: 16, h: 16 }, o)

// state override presets ------------------------------------------------------
/**
 * A state override: { role, set: { fill?, stroke?, strokeW?, textFill?, opacity?, hidden? } }
 * 'root' targets the variant component itself. Interpreted by the renderer and
 * validated by tests. These are the SHARED interaction-state semantics; families
 * may extend/override via their own `states` table.
 */
const STATE_PRESETS = Object.freeze({
  Default: [],
  Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }],
  Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
  Active: [{ role: 'root', set: { stroke: 'Color/Border/Active', strokeW: 1.5 } }],
  Disabled: [
    { role: 'root', set: { opacity: 0.55 } },
    { role: 'Label', set: { textFill: 'Color/Text/Disabled' } },
  ],
  Loading: [
    { role: 'Label', set: { textFill: 'Color/Text/Muted' } },
    { role: 'Spinner', set: { hidden: false } },
  ],
  Error: [
    { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } },
    { role: 'Hint', set: { hidden: false, textFill: 'Color/Status/Danger' } },
  ],
  Empty: [
    { role: 'Body', set: { hidden: true } },
    { role: 'EmptyNote', set: { hidden: false } },
  ],
})

// anatomy presets -------------------------------------------------------------
/**
 * Each preset returns the root NodeSpec for one VARIANT COMPONENT of a family.
 * Text roles used by prop bindings: Label, Value, Hint, Title, Meta, Tag, Unit…
 */
const PRESETS = Object.freeze({
  /** Horizontal control (Button/Link/IconButton/Tabs/Badge/chips). */
  control(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: o.padX ?? M.controlX, padY: o.padY ?? M.controlY,
      radius: o.radius ?? M.radiusSm, fill: o.fill ?? 'Color/Surface/Interactive',
      stroke: o.stroke ?? 'Color/Border/Default', strokeW: 1, minH: o.minH ?? M.touchMin,
      children: [
        ...(o.icon ? [iconSlot('IconSlot')] : []),
        txt('Label', o.label ?? 'Label', o.textStyle ?? 'Title/S', o.textFill ?? 'Color/Text/Primary'),
        ...(o.spinner ? [dot('Spinner', 12, 'Color/Brand/Primary', { hidden: true })] : []),
      ],
    })
  },

  /** Labelled field (Input/Textarea/Select/Search/Dropdown trigger). */
  field(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapTight, fill: null, minW: 220,
      children: [
        txt('Label', o.label ?? 'Label', 'Caption', 'Color/Text/Secondary'),
        frame('Box', {
          row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY,
          radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default',
          strokeW: 1, minH: M.touchMin, grow: 'fill',
          children: [
            ...(o.leadIcon ? [iconSlot('IconSlot')] : []),
            txt('Value', o.value ?? 'Value', 'Body/M', 'Color/Text/Primary', { grow: 'fill', maxW: o.tall ? 280 : undefined }),
            ...(o.trailMark ? [dot('TrailMark', 8, 'Color/Text/Muted')] : []),
          ],
        }),
        txt('Hint', o.hint ?? 'Hint', 'Caption', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Boolean input (Checkbox/Radio/Switch). */
  toggle(opts) {
    const o = opts || {}
    const mark = o.kind === 'switch'
      ? frame('Mark', { row: true, w: 36, h: 20, radius: M.radiusFull, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, padX: 2, padY: 2, children: [dot('Knob', 16, 'Color/Text/Secondary')] })
      : o.kind === 'radio'
        ? frame('Mark', { w: 18, h: 18, radius: M.radiusFull, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1.5, center: true, children: [dot('Knob', 8, 'Color/Brand/Primary', { hidden: true })] })
        : frame('Mark', { w: 18, h: 18, radius: 4, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1.5, center: true, children: [rect('Knob', { w: 10, h: 10, radius: 2, fill: 'Color/Brand/Primary', hidden: true })] })
    return frame('root', {
      row: true, center: true, gap: M.gap, padY: 2, minH: M.touchMin, fill: null,
      children: [mark, txt('Label', o.label ?? 'Label', 'Body/M', 'Color/Text/Primary')],
    })
  },

  /** Surface card (Card/MetricCard/InsightCard/EmptyState/ErrorState/FaultHypothesisCard/ConfidenceIndicator/SafeActionPanel/AssetStatusBlock). */
  card(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 260,
      children: [
        frame('Header', {
          row: true, center: true, gap: M.gap,
          children: [dot('StateDot', 10, o.dotFill ?? 'Color/Brand/Primary'), txt('Title', o.title ?? 'Title', 'Title/S', 'Color/Text/Primary', { maxW: 320 })],
        }),
        txt('Body', o.body ?? 'Supporting description that must survive long Persian and German copy without overflowing.', 'Body/M', 'Color/Text/Secondary', { maxW: 360 }),
        ...(o.value ? [frame('ValueRow', { row: true, center: true, gap: M.gapTight, children: [txt('Value', o.value, 'Display/XL', 'Color/Text/Primary'), txt('Unit', o.unit ?? '', 'Caption', 'Color/Text/Muted')] })] : []),
        ...(o.meta ? [txt('Meta', o.meta, 'Caption', 'Color/Text/Muted', { maxW: 360 })] : []),
        ...(o.action ? [frame('ActionRow', { row: true, gap: M.gap, children: [frame('Action', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Brand/Primary', minH: M.touchMin, children: [txt('ActionLabel', o.action, 'Title/S', 'Color/Brand/OnBrand')] })] })] : []),
        txt('EmptyNote', o.emptyNote ?? 'No data available yet.', 'Body/S', 'Color/Text/Muted', { hidden: true, maxW: 360 }),
      ],
    })
  },

  /** List/tree row (StatusIndicator/EvidenceItem/TimelineEventRow/Breadcrumb/Pagination/DataTable rows/Accordion header/Toast/Alert). */
  listRow(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: o.padX ?? M.controlX, padY: o.padY ?? M.controlY,
      radius: o.radius ?? M.radiusSm, fill: o.fill ?? 'Color/Surface/Primary',
      stroke: o.stroke ?? 'Color/Border/Default', strokeW: o.strokeW ?? 1, minH: M.touchMin, minW: o.minW ?? 280,
      children: [
        dot('StateDot', 10, o.dotFill ?? 'Color/Brand/Primary'),
        frame('Content', {
          gap: 2, grow: 'fill',
          children: [
            txt('Title', o.title ?? 'Title', o.titleStyle ?? 'Body/M', 'Color/Text/Primary', { maxW: 340 }),
            ...(o.meta !== false ? [txt('Meta', o.meta ?? 'Metadata', 'Caption', 'Color/Text/Muted', { maxW: 340 })] : []),
          ],
        }),
        ...(o.trail ? [txt('Trail', o.trail, 'Technical/Mono', 'Color/Text/Secondary')] : []),
        ...(o.dismiss ? [txt('Dismiss', '✕', 'Body/S', 'Color/Text/Muted', { hidden: false })] : []),
      ],
    })
  },

  /** Overlay surface (Dialog/Drawer/Tooltip/Toast host/UserMenu popover). */
  overlay(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: o.radius ?? M.radiusLg,
      fill: 'Color/Surface/Elevated', stroke: 'Color/Surface/Glass (border)', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [txt('Title', o.title ?? 'Title', 'Heading/M', 'Color/Text/Primary', { grow: 'fill', maxW: 360 }), txt('Dismiss', '✕', 'Body/M', 'Color/Text/Muted')] }),
        txt('Body', o.body ?? 'Overlay content copy resilient to long FA/DE strings.', 'Body/M', 'Color/Text/Secondary', { maxW: 380 }),
        ...(o.actions ? [frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('PrimaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Brand/Primary', minH: M.touchMin, children: [txt('PrimaryLabel', o.actions[0], 'Title/S', 'Color/Brand/OnBrand')] }),
          ...(o.actions[1] ? [frame('SecondaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, children: [txt('SecondaryLabel', o.actions[1], 'Title/S', 'Color/Text/Primary')] })] : []),
        ] })] : []),
      ],
    })
  },

  /** App shell strip (TopNavigation/Sidebar/LanguageSelector/UserMenu trigger). */
  shell(opts) {
    const o = opts || {}
    if (o.kind === 'sidebar') {
      return frame('root', {
        gap: M.gapTight, padX: M.gapWide, padY: M.panel, w: o.collapsed ? 64 : 240,
        fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minH: 320,
        children: [
          frame('Brand', { row: true, center: true, gap: M.gap, padY: M.gap, children: [dot('BrandMark', 12, 'Color/Brand/Primary'), ...(o.collapsed ? [] : [txt('BrandName', 'Hermes OS', 'Title/S', 'Color/Text/Primary')])] }),
          ...[1, 2, 3, 4].map((i) => frame('NavItem' + i, {
            row: true, center: true, gap: M.gap, padX: M.gap, padY: M.controlY, radius: M.radiusSm,
            fill: i === 1 ? 'Color/Surface/Interactive' : null, minH: M.touchMin,
            children: [dot('NavDot' + i, 8, i === 1 ? 'Color/Brand/Primary' : 'Color/Text/Muted'), ...(o.collapsed ? [] : [txt('NavLabel' + i, 'Navigation ' + i, 'Body/M', i === 1 ? 'Color/Text/Primary' : 'Color/Text/Secondary')])],
          })),
        ],
      })
    }
    // top navigation
    return frame('root', {
      row: true, center: true, gap: M.gapWide, padX: M.panel, padY: M.controlY,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minH: 56, minW: o.minW ?? 640,
      children: [
        frame('Brand', { row: true, center: true, gap: M.gap, children: [dot('BrandMark', 12, 'Color/Brand/Primary'), txt('BrandName', 'Hermes OS', 'Title/S', 'Color/Text/Primary')] }),
        frame('Spacer', { row: true, grow: 'fill', children: [] }),
        iconSlot('SearchSlot'),
        frame('UserChip', { row: true, center: true, gap: M.gap, padX: M.gap, padY: 4, radius: M.radiusFull, fill: 'Color/Surface/Interactive', children: [dot('Avatar', 20, 'Color/Brand/Primary'), txt('UserName', 'User', 'Body/S', 'Color/Text/Primary')] }),
      ],
    })
  },

  /** Industrial signal tile. */
  tile(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: 220,
      children: [
        frame('TagRow', { row: true, center: true, gap: M.gap, children: [dot('StateDot', 10, o.dotFill ?? 'Color/Status/Success'), txt('Tag', o.tag ?? 'TT-1204.PV', 'Technical/Mono', 'Color/Text/Secondary')] }),
        frame('ValueRow', { row: true, center: true, gap: M.gapTight, children: [txt('Value', o.value ?? '182.4', 'Display/XL', 'Color/Text/Primary'), txt('Unit', o.unit ?? '°C', 'Body/S', 'Color/Text/Muted')] }),
        txt('Meta', o.meta ?? 'Updated 2s ago · Site A', 'Caption', 'Color/Text/Muted', { maxW: 220 }),
        txt('EmptyNote', 'No signal data.', 'Body/S', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Data table (header + rows + state notes). */
  table(opts) {
    const o = opts || {}
    const row = (i, tone) => frame('Row' + i, {
      row: true, center: true, gap: M.gapWide, padX: M.controlX, padY: o.compact ? 6 : M.controlY,
      stroke: 'Color/Border/Default', strokeW: 1, minH: o.compact ? 32 : M.touchMin,
      children: [
        txt('Cell' + i + 'a', 'PLC-' + (100 + i), 'Technical/Mono', 'Color/Text/Primary', { w: 110 }),
        txt('Cell' + i + 'b', 'Asset description ' + i, 'Body/S', 'Color/Text/Secondary', { grow: 'fill', maxW: 260 }),
        dot('RowDot' + i, 8, tone),
      ],
    })
    return frame('root', {
      gap: 0, radius: M.radiusMd, fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: 480,
      children: [
        frame('HeaderRow', {
          row: true, center: true, gap: M.gapWide, padX: M.controlX, padY: M.controlY, fill: 'Color/Surface/Elevated',
          children: [txt('Header', o.header ?? 'Asset', 'Caption', 'Color/Text/Secondary', { w: 110 }), txt('Header2', 'Description', 'Caption', 'Color/Text/Secondary', { grow: 'fill' }), txt('Header3', 'State', 'Caption', 'Color/Text/Secondary')],
        }),
        frame('Body', { gap: 0, children: [row(1, 'Color/Status/Success'), row(2, 'Color/Status/Warning'), row(3, 'Color/Status/Danger')] }),
        txt('EmptyNote', 'No records match the current filter.', 'Body/S', 'Color/Text/Muted', { hidden: true, padX: M.controlX }),
        txt('LoadingNote', 'Loading records…', 'Body/S', 'Color/Text/Muted', { hidden: true }),
        txt('ErrorNote', 'Failed to load records. Retry.', 'Body/S', 'Color/Status/Danger', { hidden: true }),
      ],
    })
  },

  /** Skeleton/Spinner loaders. */
  loader(opts) {
    const o = opts || {}
    if (o.kind === 'spinner') {
      const d = o.size === 'L' ? 32 : o.size === 'S' ? 16 : 24
      return frame('root', { center: true, padX: 4, padY: 4, fill: null, children: [frame('Ring', { w: d, h: d, radius: M.radiusFull, stroke: 'Color/Brand/Primary', strokeW: 2, fill: null, children: [] })] })
    }
    const shape = o.shape === 'Circle'
      ? dot('Bone', 40, 'Color/Surface/Interactive')
      : rect('Bone', { w: o.shape === 'Block' ? 160 : 220, h: o.shape === 'Block' ? 80 : 12, radius: o.shape === 'Block' ? M.radiusMd : M.radiusFull, fill: 'Color/Surface/Interactive' })
    return frame('root', { padX: 0, padY: 0, fill: null, children: [shape] })
  },

  /** Geometric icon marks (the Icon utility family used by INSTANCE_SWAP slots). */
  iconMark(opts) {
    const o = opts || {}
    const fill = 'Color/Text/Secondary'
    const kids = {
      Dot: [dot('Mark', 10, fill)],
      Ring: [frame('Mark', { w: 12, h: 12, radius: M.radiusFull, stroke: fill, strokeW: 2, fill: null, children: [] })],
      Square: [rect('Mark', { w: 10, h: 10, radius: 2, fill })],
      Bar: [rect('Mark', { w: 12, h: 3, radius: 2, fill })],
      Diamond: [rect('Mark', { w: 10, h: 10, radius: 2, fill, rotation: 45 })],
    }[o.mark || 'Dot']
    return frame('root', { center: true, w: 16, h: 16, fill: null, children: kids })
  },
})

// pure validators (used by tests) --------------------------------------------
/** Collect roles of a NodeSpec tree. @param {any} n @param {string[]} [acc] */
function collectRoles(n, acc) {
  const out = acc || []
  out.push(n.role)
  for (const c of n.children || []) collectRoles(c, out)
  return out
}
/** Collect referenced token names (fill/stroke/textFill). @param {any} n @param {Set<string>} [acc] */
function collectTokens(n, acc) {
  const out = acc || new Set()
  for (const k of ['fill', 'stroke', 'textFill']) if (n[k]) out.add(n[k])
  for (const c of n.children || []) collectTokens(c, out)
  return out
}
/** Collect referenced textStyle names. @param {any} n @param {Set<string>} [acc] */
function collectTextStyles(n, acc) {
  const out = acc || new Set()
  if (n.textStyle) out.add(n.textStyle)
  for (const c of n.children || []) collectTextStyles(c, out)
  return out
}
/** Find a role in a tree. @param {any} n @param {string} role @returns {any|null} */
function findRole(n, role) {
  if (n.role === role) return n
  for (const c of n.children || []) { const f = findRole(c, role); if (f) return f }
  return null
}

module.exports = { M, PRESETS, STATE_PRESETS, frame, txt, dot, rect, iconSlot, collectRoles, collectTokens, collectTextStyles, findRole }
