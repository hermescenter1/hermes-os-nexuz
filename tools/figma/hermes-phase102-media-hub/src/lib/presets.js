// @ts-check
'use strict'
/**
 * Anatomy + state DSL for the Phase 102 media-hub component sets.
 *
 * A family's visual contract is declared as a pure tree of NodeSpecs plus
 * state/tone override tables — same architecture as the Phase 87 design-system
 * plugin (`tools/figma/hermes-design-system-builder/src/lib/presets.js`). The
 * Figma renderer (figma-exec.js) interprets these; the tests validate them
 * (roles unique, tokens exist, bindings resolvable) WITHOUT needing Figma.
 *
 * NodeSpec:
 *   role      unique-within-family layer name (semantic; used for bindings,
 *             overrides AND the RTL-protection lookup in rtl.js)
 *   type      'frame' | 'text' | 'ellipse' | 'rect' | 'iconSlot'
 *   row       frame only: horizontal auto-layout (default vertical)
 *   gap,padX,padY   auto-layout metrics (px, token-derived at call sites)
 *   fill,stroke     token name from tokens.js paint styles
 *   strokeW,radius  px
 *   w,h,minW,minH,maxW  sizing (px); text with maxW wraps (textAutoResize HEIGHT)
 *   grow      'fill' → layoutSizingHorizontal FILL inside parent
 *   center    frame only: counterAxisAlignItems CENTER
 *   textStyle ramp name from tokens.js TEXT_STYLES
 *   textFill  token name for the text paint
 *   text      default characters (EN)
 *   hidden    initially invisible (bound bools reveal)
 *   children  NodeSpec[]
 */

/** Token-derived metric constants (mirror the globals.css space + radius tokens). */
const M = Object.freeze({
  controlX: 16, controlY: 10, card: 20, panel: 24,
  radiusXs: 4, radiusSm: 6, radiusMd: 8, radiusLg: 12, radiusXl: 16, radius2xl: 20, radiusFull: 9999,
  gap: 8, gapTight: 4, gapWide: 12,
  touchMin: 40, // min interactive height (touch target incl. border)
  timelineTrack: 6,
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
 * validated by tests. These are the SHARED interaction-state semantics; a
 * family may extend/override via its own `valueOverrides`.
 */
const STATE_PRESETS = Object.freeze({
  Default: [],
  Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }],
  Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
  Active: [{ role: 'root', set: { stroke: 'Color/Border/Active', strokeW: 1.5 } }],
  Selected: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }],
  Disabled: [
    { role: 'root', set: { opacity: 0.55 } },
    { role: 'Label', set: { textFill: 'Color/Text/Disabled' } },
  ],
  Loading: [
    { role: 'Label', set: { textFill: 'Color/Text/Muted' } },
  ],
  Error: [
    { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } },
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
  /** Horizontal control (chips, toggle triggers, small buttons). */
  control(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: o.padX ?? M.controlX, padY: o.padY ?? M.controlY,
      radius: o.radius ?? M.radiusSm, fill: o.fill ?? 'Color/Surface/Interactive',
      stroke: o.stroke ?? 'Color/Border/Default', strokeW: 1, minH: o.minH ?? M.touchMin, minW: o.minW,
      children: [
        ...(o.icon ? [iconSlot('IconSlot')] : []),
        txt('Label', o.label ?? 'Label', o.textStyle ?? 'Title/S', o.textFill ?? 'Color/Text/Primary'),
      ],
    })
  },

  /** Labelled field (SearchField). */
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
            txt('Value', o.value ?? 'Value', 'Body/M', 'Color/Text/Primary', { grow: 'fill' }),
            ...(o.trailMark ? [dot('TrailMark', 8, 'Color/Text/Muted', { hidden: true })] : []),
          ],
        }),
        txt('Hint', o.hint ?? 'Hint', 'Caption', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Boolean input (SubtitleToggle). */
  toggle(opts) {
    const o = opts || {}
    const mark = frame('Mark', {
      row: true, w: 36, h: 20, radius: M.radiusFull, fill: 'Color/Surface/Interactive',
      stroke: 'Color/Border/Default', strokeW: 1, padX: 2, padY: 2,
      children: [dot('Knob', 16, 'Color/Text/Secondary')],
    })
    return frame('root', {
      row: true, center: true, gap: M.gap, padY: 2, minH: M.touchMin, fill: null,
      children: [mark, txt('Label', o.label ?? 'Label', 'Body/M', 'Color/Text/Primary')],
    })
  },

  /** Surface card (VideoHero fallback, AnalyticsCard, InstructorProfileCard header, MediaEmptyState, MediaErrorState). */
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

  /** List/tree row (PlaylistChapterNav item). */
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
      ],
    })
  },

  /** Overlay surface (MediaDialog). */
  overlay(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: o.radius ?? M.radiusLg,
      fill: 'Color/Surface/Elevated', stroke: 'Color/Surface/Glass (border)', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [txt('Title', o.title ?? 'Title', 'Heading/M', 'Color/Text/Primary', { grow: 'fill', maxW: 360 }), txt('Dismiss', '✕', 'Body/M', 'Color/Text/Muted')] }),
        txt('Body', o.body ?? 'Overlay content copy resilient to long FA/DE strings.', 'Body/M', 'Color/Text/Secondary', { maxW: 380 }),
        frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('PrimaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: o.primaryFill ?? 'Color/Brand/Primary', minH: M.touchMin, children: [txt('PrimaryLabel', (o.actions && o.actions[0]) ?? 'Confirm', 'Title/S', o.primaryTextFill ?? 'Color/Brand/OnBrand')] }),
          frame('SecondaryAction', { row: true, center: true, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, children: [txt('SecondaryLabel', (o.actions && o.actions[1]) ?? 'Cancel', 'Title/S', 'Color/Text/Primary')] }),
        ] }),
      ],
    })
  },

  /** Skeleton loader (MediaLoadingState). */
  loader(opts) {
    const o = opts || {}
    const shape = o.shape === 'Circle'
      ? dot('Bone', 40, 'Color/Surface/Interactive')
      : rect('Bone', { w: o.shape === 'Block' ? 220 : 260, h: o.shape === 'Block' ? 120 : 12, radius: o.shape === 'Block' ? M.radiusMd : M.radiusFull, fill: 'Color/Surface/Interactive' })
    return frame('root', { padX: 0, padY: 0, fill: null, children: [shape] })
  },

  /** Geometric icon marks (used inline for play/pause/volume/fullscreen slots). */
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

  /**
   * Standalone progress meter (ProgressIndicator — watch-progress bar used on
   * video cards and the continue-watching row). LTR-locked: `Track`/`Fill` are
   * PROTECTED_LTR_ROLES (rtl.js) — a watch-progress bar always fills
   * left-to-right, matching the player timeline convention.
   */
  meter(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapTight, fill: null, minW: o.minW ?? 200,
      children: [
        frame('Track', { row: true, center: true, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Surface/Interactive', minW: o.minW ?? 200, w: o.minW ?? 200, children: [
          rect('Fill', { w: o.fillW ?? 0, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Brand/Primary' }),
        ] }),
        txt('Label', o.label ?? '0% watched', 'Caption', 'Color/Text/Muted'),
      ],
    })
  },

  /**
   * Player control bar — the flagship component. `Timeline` is a
   * PROTECTED_LTR_ROLE: it and its children (`TimeElapsed`/`Track`/`Fill`/
   * `Playhead`/`TimeRemaining`) are NEVER reordered or right-aligned by RTL
   * mirroring, even though the surrounding `ControlsRow` (play/pause, skip,
   * volume, captions, fullscreen) mirrors normally. See rtl.js.
   */
  player(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.card, radius: M.radiusLg,
      fill: 'Color/Surface/Elevated', stroke: 'Color/Surface/Glass (border)', strokeW: 1, minW: o.minW ?? 480,
      children: [
        frame('VideoSurface', {
          row: true, center: true, fill: 'Color/Background/Deep', h: o.surfaceH ?? 220, radius: M.radiusMd,
          children: [
            dot('PlayBadge', 56, 'Color/Brand/Primary'),
            frame('BufferingRing', { row: true, center: true, w: 40, h: 40, radius: M.radiusFull, stroke: 'Color/Brand/Primary', strokeW: 3, fill: null, hidden: true, children: [] }),
            txt('ErrorLabel', 'Playback failed. Retry.', 'Body/S', 'Color/Status/Danger', { hidden: true }),
          ],
        }),
        frame('Timeline', {
          row: true, center: true, gap: M.gap,
          children: [
            txt('TimeElapsed', '04:12', 'Technical/Mono', 'Color/Text/Secondary'),
            frame('Track', { row: true, center: true, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Surface/Interactive', grow: 'fill', children: [
              rect('Fill', { w: 140, h: M.timelineTrack, radius: M.radiusFull, fill: 'Color/Brand/Primary' }),
              dot('Playhead', 12, 'Color/Brand/Primary'),
            ] }),
            txt('TimeRemaining', '-38:20', 'Technical/Mono', 'Color/Text/Muted'),
          ],
        }),
        frame('ControlsRow', {
          row: true, center: true, gap: M.gapWide,
          children: [
            iconSlot('PlayPauseIcon'), iconSlot('SkipBackIcon'), iconSlot('SkipForwardIcon'),
            frame('Spacer', { row: true, grow: 'fill', children: [] }),
            iconSlot('VolumeIcon'), iconSlot('CaptionsIcon'), iconSlot('SettingsIcon'), iconSlot('FullscreenIcon'),
          ],
        }),
      ],
    })
  },

  /** Video thumbnail card (VideoCard / RelatedContentCard in compact mode). */
  videoCard(opts) {
    const o = opts || {}
    const compact = !!o.compact
    return frame('root', {
      gap: M.gapTight, radius: M.radiusMd, fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default',
      strokeW: 1, minW: compact ? 220 : 280,
      children: [
        frame('Thumb', {
          row: true, center: true, fill: 'Color/Background/Deep', h: compact ? 110 : 158, radius: M.radiusMd,
          children: [
            dot('PlayMark', 32, 'Color/Brand/Primary'),
            txt('DurationBadge', '12:04', 'Technical/Mono', 'Color/Text/Primary'),
          ],
        }),
        frame('Body', {
          gap: 4, padX: M.gapWide, padY: M.gapWide,
          children: [
            frame('TitleRow', { row: true, gap: M.gap, children: [
              txt('Title', o.title ?? 'Video title', 'Title/S', 'Color/Text/Primary', { maxW: compact ? 180 : 240, grow: 'fill' }),
              dot('FavouriteFill', 8, 'Color/Brand/Primary', { hidden: true }),
            ] }),
            txt('Meta', o.meta ?? 'Instructor · Level · Category', 'Caption', 'Color/Text/Muted', { maxW: compact ? 180 : 240 }),
          ],
        }),
      ],
    })
  },

  /** Featured video hero banner (VideoHero). */
  hero(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: M.radius2xl,
      fill: 'Color/Background/Deep', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 640,
      children: [
        frame('Surface', { row: true, center: true, fill: 'Color/Surface/Primary', h: 260, radius: M.radiusLg, children: [dot('PlayMark', 64, 'Color/Brand/Primary')] }),
        txt('Eyebrow', o.eyebrow ?? 'Featured', 'Caption', 'Color/Brand/Primary'),
        txt('Title', o.title ?? 'Featured video title that must wrap gracefully', 'Display/XL', 'Color/Text/Primary', { maxW: 640 }),
        txt('Meta', o.meta ?? 'Instructor · Duration · Level', 'Body/M', 'Color/Text/Secondary', { maxW: 640 }),
        frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('PlayAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Brand/Primary', minH: M.touchMin, children: [txt('PlayLabel', o.playLabel ?? 'Play', 'Title/S', 'Color/Brand/OnBrand')] }),
          frame('SaveAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, children: [txt('SaveLabel', o.saveLabel ?? 'Save for later', 'Title/S', 'Color/Text/Primary')] }),
        ] }),
      ],
    })
  },

  /** Instructor profile card. */
  profile(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gapWide, padX: M.panel, padY: M.panel, radius: M.radiusLg,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gapWide, children: [
          dot('Avatar', 56, 'Color/Brand/Primary'),
          frame('Identity', { gap: 2, grow: 'fill', children: [
            txt('Name', o.name ?? 'Instructor name', 'Heading/M', 'Color/Text/Primary', { maxW: 260 }),
            txt('Role', o.role ?? 'Senior Process Engineer', 'Body/S', 'Color/Text/Secondary', { maxW: 260 }),
          ] }),
        ] }),
        txt('Bio', o.bio ?? 'Short instructor biography that must remain readable when translated into longer Persian or German sentences.', 'Body/M', 'Color/Text/Secondary', { maxW: 420 }),
        frame('StatsRow', { row: true, gap: M.gapWide, children: [
          frame('Stat1', { gap: 2, children: [txt('Stat1Value', '18', 'Heading/M', 'Color/Text/Primary'), txt('Stat1Label', 'Courses', 'Caption', 'Color/Text/Muted')] }),
          frame('Stat2', { gap: 2, children: [txt('Stat2Value', '4.8', 'Heading/M', 'Color/Text/Primary'), txt('Stat2Label', 'Rating', 'Caption', 'Color/Text/Muted')] }),
        ] }),
      ],
    })
  },

  /** Upload workflow step chip (UploadWorkflowStep). */
  step(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusFull,
      fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1, minH: M.touchMin, minW: 180,
      children: [
        dot('StepDot', 20, 'Color/Text/Muted'),
        frame('Content', { gap: 0, grow: 'fill', children: [
          txt('StepLabel', o.label ?? 'Upload', 'Title/S', 'Color/Text/Primary'),
          txt('StepMeta', o.meta ?? 'Step 1 of 4', 'Caption', 'Color/Text/Muted'),
        ] }),
      ],
    })
  },

  /** Transcript panel with a search field and a few timestamped lines. */
  transcript(opts) {
    const o = opts || {}
    const line = (i) => frame('Line' + i, { row: true, gap: M.gap, children: [
      txt('Stamp' + i, '0' + i + ':1' + i, 'Technical/Mono', 'Color/Text/Muted'),
      txt('Text' + i, 'Transcript line ' + i + ' of the recorded engineering walkthrough, long enough to wrap.', 'Body/S', 'Color/Text/Secondary', { grow: 'fill', maxW: 320 }),
    ] })
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd, fill: 'Color/Surface/Primary',
      stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 320,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [txt('Title', 'Transcript', 'Title/S', 'Color/Text/Primary', { grow: 'fill' })] }),
        frame('SearchRow', { row: true, center: true, gap: M.gap, padX: M.gapWide, padY: M.gapTight, radius: M.radiusSm, fill: 'Color/Surface/Interactive', minH: 36, children: [txt('SearchValue', 'Search transcript…', 'Body/S', 'Color/Text/Muted', { grow: 'fill' })] }),
        frame('Lines', { gap: M.gapTight, children: [line(1), line(2), line(3)] }),
        txt('EmptyNote', 'No transcript available for this video yet.', 'Body/S', 'Color/Text/Muted', { hidden: true, maxW: 320 }),
        txt('LoadingNote', 'Loading transcript…', 'Body/S', 'Color/Text/Muted', { hidden: true }),
      ],
    })
  },

  /** Moderation review card with Approve/Reject actions. */
  reviewCard(opts) {
    const o = opts || {}
    return frame('root', {
      gap: M.gap, padX: M.card, padY: M.card, radius: M.radiusMd,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minW: o.minW ?? 340,
      children: [
        frame('Header', { row: true, center: true, gap: M.gap, children: [dot('StateDot', 10, 'Color/Status/Warning'), txt('Title', o.title ?? 'Pending review', 'Title/S', 'Color/Text/Primary', { maxW: 320 })] }),
        txt('Body', o.body ?? 'Submitted by the author; verify accuracy and safety guidance before publishing.', 'Body/M', 'Color/Text/Secondary', { maxW: 360 }),
        frame('ActionRow', { row: true, gap: M.gap, children: [
          frame('ApproveAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Status/Success', minH: M.touchMin, children: [txt('ApproveLabel', 'Approve', 'Title/S', 'Color/Brand/OnBrand')] }),
          frame('RejectAction', { row: true, center: true, gap: M.gap, padX: M.controlX, padY: M.controlY, radius: M.radiusSm, fill: 'Color/Surface/Interactive', stroke: 'Color/Status/Danger', strokeW: 1, minH: M.touchMin, children: [txt('RejectLabel', 'Reject', 'Title/S', 'Color/Status/Danger')] }),
        ] }),
      ],
    })
  },

  /** Continue-watching row: thumbnail + title/meta + LTR-locked meter + remaining time. */
  continueRow(opts) {
    const o = opts || {}
    return frame('root', {
      row: true, center: true, gap: M.gapWide, padX: M.controlX, padY: M.controlY, radius: M.radiusSm,
      fill: 'Color/Surface/Primary', stroke: 'Color/Border/Default', strokeW: 1, minH: 72, minW: o.minW ?? 360,
      children: [
        frame('Thumb', { row: true, center: true, fill: 'Color/Background/Deep', w: 96, h: 54, radius: M.radiusSm, children: [dot('PlayMark', 20, 'Color/Brand/Primary')] }),
        frame('Content', { gap: 4, grow: 'fill', children: [
          txt('Title', o.title ?? 'Resume: video title', 'Body/M', 'Color/Text/Primary', { maxW: 320 }),
          frame('Meter', { row: true, center: true, gap: M.gapTight, children: [
            frame('MeterTrack', { row: true, center: true, h: 4, radius: M.radiusFull, fill: 'Color/Surface/Interactive', w: 200, children: [rect('MeterFill', { w: 120, h: 4, radius: M.radiusFull, fill: 'Color/Brand/Primary' })] }),
          ] }),
        ] }),
        txt('Trail', o.trail ?? '12 min left', 'Technical/Mono', 'Color/Text/Muted'),
      ],
    })
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
