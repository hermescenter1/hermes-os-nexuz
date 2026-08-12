// @ts-check
'use strict'
/**
 * Phase 102 "Hermes Media & Video Hub" component registry — 23 families (22
 * media-domain families + 1 shared Icon utility) declared as production
 * anatomy blueprints (presets.js) with variant AXES,
 * interaction STATES (Focus is a REAL variant on every interactive family, not
 * decoration), per-value overrides, bound TEXT/BOOLEAN/INSTANCE_SWAP
 * properties, Direction (LTR/RTL) axes where horizontal ordering matters, and
 * accessibility descriptions.
 *
 * Coverage against the task brief:
 *   video card, video hero, player (control bar + timeline + buffering +
 *   error), playlist/chapter navigation, transcript panel, subtitle toggle,
 *   search field, filter controls, category chips, progress indicators,
 *   instructor profile, related content, favourite button, continue-watching
 *   row, analytics cards, upload workflow steps, editorial workflow states
 *   (draft/submitted/in review/published/rejected/archived), moderation/review
 *   state, empty/error/loading states, dialogs, explicit focus states.
 *
 * Family shape (same contract as the Phase 87 design-system plugin):
 *   key, name, category, maps
 *   preset, presetOpts        anatomy blueprint (presets.js)
 *   axes: [{prop, values}]    variant axes (cartesian product = components)
 *   valueOverrides?: {axisProp: {value: overrides[]}}   family-specific looks
 *   text/bools/swaps: [{name, role}]                    bound component props
 *   dirAxis?: true            adds Direction=LTR/RTL axis (renderer mirrors,
 *                             respecting rtl.js PROTECTED_LTR_ROLES)
 *   a11y: accessible-usage contract (joined into description + annotation)
 *   description
 */

/** @param {string} prop @param {string[]} values */
const axis = (prop, values) => ({ prop, values })
/** @param {string} name @param {string} role */
const p = (name, role) => ({ name, role })

/** @type {any[]} */
const FAMILIES = [
  {
    key: 'video-card', name: 'VideoCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaAsset',
    preset: 'videoCard', presetOpts: { title: 'Root cause analysis: bearing failure', meta: 'A. Karimi · Intermediate · Rotating Equipment' },
    axes: [axis('State', ['Default', 'Hover', 'Focus', 'Loading'])], dirAxis: true,
    bools: [p('Favourited', 'FavouriteFill')],
    text: [p('Title', 'Title'), p('Meta', 'Meta'), p('Duration', 'DurationBadge')],
    valueOverrides: {
      State: {
        Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
        Loading: [{ role: 'Title', set: { textFill: 'Color/Text/Muted' } }, { role: 'Meta', set: { textFill: 'Color/Text/Muted' } }, { role: 'DurationBadge', set: { hidden: true } }],
      },
    },
    a11y: 'Play state is icon + text duration badge, never colour alone; Favourite carries an accessible name in code; whole card is one tab stop to the detail page; focus ring 2px + halo.',
    description: 'Video thumbnail card for library grids, search results and related content.',
  },
  {
    key: 'video-hero', name: 'VideoHero', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaAsset',
    preset: 'hero', presetOpts: {},
    axes: [axis('State', ['Default', 'Loading'])], dirAxis: true,
    text: [p('Eyebrow', 'Eyebrow'), p('Title', 'Title'), p('Meta', 'Meta'), p('PlayLabel', 'PlayLabel'), p('SaveLabel', 'SaveLabel')],
    valueOverrides: {
      State: { Loading: [{ role: 'Title', set: { textFill: 'Color/Text/Muted' } }, { role: 'PlayAction', set: { fill: 'Color/Surface/Interactive' } }, { role: 'PlayLabel', set: { textFill: 'Color/Text/Disabled' } }] },
    },
    a11y: 'Hero is a landmark region with a real heading; Play/Save are ≥40px targets with visible focus; loading state is textual, not merely a spinner.',
    description: 'Featured video banner for the library landing area.',
  },
  {
    key: 'player-control-bar', name: 'PlayerControlBar', category: 'media', maps: 'docs/phase102/architecture.md §4 self-hosted playback',
    preset: 'player', presetOpts: {},
    axes: [axis('State', ['Playing', 'Paused', 'Buffering', 'Focus', 'Error', 'Ended'])], dirAxis: true,
    text: [p('ElapsedTime', 'TimeElapsed'), p('RemainingTime', 'TimeRemaining')],
    swaps: [p('PlayPauseIcon', 'PlayPauseIcon')],
    valueOverrides: {
      State: {
        Paused: [{ role: 'PlayBadge', set: { fill: 'Color/Brand/Hover' } }],
        Buffering: [{ role: 'BufferingRing', set: { hidden: false } }, { role: 'PlayBadge', set: { hidden: true } }],
        Error: [{ role: 'ErrorLabel', set: { hidden: false } }, { role: 'PlayBadge', set: { hidden: true } }, { role: 'Fill', set: { fill: 'Color/Status/Danger' } }, { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }],
        Ended: [{ role: 'Fill', set: { w: 400 } }, { role: 'TimeRemaining', set: { text: '00:00' } }, { role: 'TimeElapsed', set: { text: '42:32' } }],
      },
    },
    a11y: 'Buffering/Error are explicit TEXTUAL + iconic states, never spinner-only. CRITICAL: the seek bar and elapsed/remaining timestamps are LOCKED left-to-right even under RTL layouts — Direction=RTL mirrors only the surrounding transport controls (rtl.js PROTECTED_LTR_ROLES). All transport controls are ≥40px targets with visible focus.',
    description: 'Self-hosted video player control bar: timeline, transport controls, buffering and error states.',
  },
  {
    key: 'playlist-chapter-nav', name: 'PlaylistChapterNav', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaChapter',
    preset: 'listRow', presetOpts: { title: 'Chapter 2 — Vibration diagnostics', meta: false, trail: '06:40', titleStyle: 'Body/M' },
    axes: [axis('State', ['Upcoming', 'Active', 'Completed', 'Focus'])], dirAxis: true,
    text: [p('ChapterTitle', 'Title'), p('ChapterTime', 'Trail')],
    valueOverrides: {
      State: {
        Upcoming: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }, { role: 'Title', set: { textFill: 'Color/Text/Secondary' } }],
        Active: [{ role: 'root', set: { fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Active' } }, { role: 'StateDot', set: { fill: 'Color/Brand/Primary' } }],
        Completed: [{ role: 'StateDot', set: { fill: 'Color/Status/Success' } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
      },
    },
    a11y: 'Chapter list is a nav landmark; current chapter has aria-current in code; timestamp is Technical/Mono and always LTR; row ≥40px.',
    description: 'Chapter/playlist navigation row for the video-detail sidebar.',
  },
  {
    key: 'transcript-panel', name: 'TranscriptPanel', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaTranscript',
    preset: 'transcript', presetOpts: {},
    axes: [axis('State', ['Default', 'Empty', 'Loading', 'Focus'])], dirAxis: true,
    text: [p('PanelTitle', 'Title'), p('SearchValue', 'SearchValue')],
    valueOverrides: {
      State: {
        Empty: [{ role: 'Lines', set: { hidden: true } }, { role: 'EmptyNote', set: { hidden: false } }],
        Loading: [{ role: 'Lines', set: { hidden: true } }, { role: 'LoadingNote', set: { hidden: false } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
      },
    },
    a11y: 'Transcript lines are readable, wrapping body text; each timestamp is Technical/Mono and always LTR; empty/loading states are textual; search input ≥36px.',
    description: 'Searchable per-locale transcript panel next to the player.',
  },
  {
    key: 'subtitle-toggle', name: 'SubtitleToggle', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaSubtitleTrack',
    preset: 'toggle', presetOpts: { label: 'English captions' },
    axes: [axis('Value', ['Off', 'On']), axis('State', ['Default', 'Hover', 'Focus', 'Disabled'])], dirAxis: true,
    text: [p('Label', 'Label')],
    valueOverrides: {
      Value: { Off: [], On: [{ role: 'Mark', set: { fill: 'Color/Brand/Primary', stroke: null } }, { role: 'Knob', set: { fill: 'Color/Brand/OnBrand' } }] },
      State: { Focus: [{ role: 'Mark', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    a11y: 'role=switch with state announced; label programmatically associated; 40px row target.',
    description: 'WebVTT subtitle/caption language toggle.',
  },
  {
    key: 'search-field', name: 'SearchField', category: 'media', maps: null,
    preset: 'field', presetOpts: { label: 'Search', value: 'Search videos, chapters, transcripts…', leadIcon: true, trailMark: true },
    axes: [axis('State', ['Default', 'Focus', 'Filled'])], dirAxis: true,
    text: [p('Placeholder', 'Value')], swaps: [p('LeadIcon', 'IconSlot')],
    valueOverrides: {
      State: {
        Focus: [{ role: 'Box', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
        Filled: [{ role: 'Value', set: { textFill: 'Color/Text/Primary' } }, { role: 'TrailMark', set: { hidden: false } }],
      },
    },
    a11y: 'type=search with a clear affordance in code (TrailMark reveals it); icon decorative; box ≥40px.',
    description: 'Library and search-results query field.',
  },
  {
    key: 'filter-chip', name: 'FilterChip', category: 'media', maps: null,
    preset: 'control', presetOpts: { label: 'Level: Intermediate', padY: 8, radius: 9999, minH: 40, textStyle: 'Body/S' },
    axes: [axis('State', ['Default', 'Selected', 'Focus'])], dirAxis: true,
    text: [p('Label', 'Label')],
    valueOverrides: {
      State: {
        Selected: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }],
        Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }],
      },
    },
    a11y: 'aria-pressed reflects Selected; toggled via keyboard and pointer; ≥36px target; focus ring 2px.',
    description: 'Facet filter control (level, category, language).',
  },
  {
    key: 'category-chip', name: 'CategoryChip', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaCategory',
    preset: 'control', presetOpts: { label: 'Rotating Equipment', padY: 4, radius: 9999, minH: 28, textStyle: 'Caption' },
    axes: [axis('Tone', ['Default', 'Industrial', 'Safety', 'Featured'])], dirAxis: false,
    text: [p('Label', 'Label')],
    valueOverrides: {
      Tone: {
        Default: [{ role: 'root', set: { fill: null, stroke: 'Color/Border/Default' } }],
        Industrial: [{ role: 'root', set: { fill: 'Color/Status/Information (subtle)', stroke: 'Color/Status/Information (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Information' } }],
        Safety: [{ role: 'root', set: { fill: 'Color/Status/Danger (subtle)', stroke: 'Color/Status/Danger (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Danger' } }],
        Featured: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }, { role: 'Label', set: { textFill: 'Color/Brand/Primary' } }],
      },
    },
    a11y: 'Read-only taxonomy tag; non-interactive; tone is decorative only, label always present.',
    description: 'Category/taxonomy tag pill shown on video cards and detail pages.',
  },
  {
    key: 'progress-indicator', name: 'ProgressIndicator', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaWatchProgress',
    preset: 'meter', presetOpts: {},
    axes: [axis('Value', ['0', '25', '50', '75', '100'])], dirAxis: false,
    text: [p('Label', 'Label')],
    valueOverrides: {
      Value: {
        '0': [{ role: 'Fill', set: { w: 0 } }, { role: 'Label', set: { text: 'Not started' } }],
        '25': [{ role: 'Fill', set: { w: 50 } }, { role: 'Label', set: { text: '25% watched' } }],
        '50': [{ role: 'Fill', set: { w: 100 } }, { role: 'Label', set: { text: '50% watched' } }],
        '75': [{ role: 'Fill', set: { w: 150 } }, { role: 'Label', set: { text: '75% watched' } }],
        '100': [{ role: 'Fill', set: { w: 200 } }, { role: 'Label', set: { text: 'Completed' } }],
      },
    },
    a11y: 'Percentage always stated as text, never colour-only; the fill track is LOCKED left-to-right even inside RTL frames (rtl.js) — a watch-progress bar reads the same direction as the player timeline.',
    description: 'Standalone watch-progress meter used on video cards and the continue-watching row.',
  },
  {
    key: 'instructor-profile-card', name: 'InstructorProfileCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaInstructor',
    preset: 'profile', presetOpts: {},
    axes: [axis('State', ['Default', 'Focus'])], dirAxis: true,
    text: [p('Name', 'Name'), p('Role', 'Role'), p('Bio', 'Bio')],
    valueOverrides: { State: { Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] } },
    a11y: 'Heading order preserved in code; bio wraps at a fixed width (FA/DE resilient); stats are labelled, not icon-only.',
    description: 'Instructor profile summary card.',
  },
  {
    key: 'related-content-card', name: 'RelatedContentCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaAsset',
    preset: 'videoCard', presetOpts: { compact: true, title: 'Related: Alignment tolerances', meta: 'B. Rahimi · Beginner' },
    axes: [axis('State', ['Default', 'Hover', 'Focus'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Meta', 'Meta')],
    valueOverrides: {
      State: { Hover: [{ role: 'root', set: { fill: 'Color/Surface/Interactive' } }], Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    a11y: 'Compact VideoCard variant; same accessibility contract (icon+text duration, single tab stop, 2px focus ring).',
    description: 'Compact related/recommended video card.',
  },
  {
    key: 'favourite-button', name: 'FavouriteButton', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaSave',
    preset: 'control', presetOpts: { icon: true, label: '', padX: 10, minH: 40, minW: 40 },
    axes: [axis('Value', ['Unsaved', 'Saved']), axis('State', ['Default', 'Hover', 'Focus'])], dirAxis: false,
    swaps: [p('Icon', 'IconSlot')],
    valueOverrides: {
      Value: { Unsaved: [], Saved: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }] },
      State: { Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] },
    },
    hideLabel: true,
    a11y: 'Icon-only: REQUIRES aria-pressed + aria-label in code ("Save"/"Saved"); 40×40 min target; focus ring 2px.',
    description: 'Save/favourite toggle for a video.',
  },
  {
    key: 'continue-watching-row', name: 'ContinueWatchingRow', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaWatchProgress',
    preset: 'continueRow', presetOpts: {},
    axes: [axis('State', ['Default', 'Focus'])], dirAxis: true,
    text: [p('Title', 'Title'), p('RemainingLabel', 'Trail')],
    valueOverrides: { State: { Focus: [{ role: 'root', set: { stroke: 'Color/Focus/Ring', strokeW: 2 } }] } },
    a11y: 'Title/meta mirror under RTL; the embedded watch-progress meter and the remaining-time label are LOCKED left-to-right (rtl.js) exactly like the player timeline; row ≥40px, single tab stop.',
    description: 'Resume-watching row for the "Continue Watching" surface.',
  },
  {
    key: 'analytics-card', name: 'AnalyticsCard', category: 'media', maps: 'docs/phase102/architecture.md §10 MediaViewEvent',
    preset: 'card', presetOpts: { title: 'Total views', value: '12,480', unit: 'plays', meta: 'vs last 30 days', minW: 240 },
    axes: [axis('Trend', ['Up', 'Down', 'Flat']), axis('State', ['Default', 'Loading'])], dirAxis: true,
    text: [p('Label', 'Title'), p('Value', 'Value'), p('Unit', 'Unit')],
    valueOverrides: {
      Trend: { Up: [{ role: 'StateDot', set: { fill: 'Color/Status/Success' } }], Down: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }], Flat: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }] },
      State: { Loading: [{ role: 'Value', set: { textFill: 'Color/Text/Muted' } }] },
    },
    a11y: 'Value carries meaning; trend colour is supportive only; loading state is stated in text, never a bare spinner.',
    description: 'Single-metric analytics card (views, completion, saves) for the instructor and admin surfaces.',
  },
  {
    key: 'upload-workflow-step', name: 'UploadWorkflowStep', category: 'media', maps: 'docs/phase102/architecture.md §5 processingState',
    preset: 'step', presetOpts: { label: 'Upload file', meta: 'Step 1 of 4' },
    axes: [axis('State', ['Upcoming', 'Current', 'Complete', 'Error'])], dirAxis: true,
    text: [p('StepLabel', 'StepLabel'), p('StepMeta', 'StepMeta')],
    valueOverrides: {
      State: {
        Upcoming: [{ role: 'StepDot', set: { fill: 'Color/Text/Muted' } }, { role: 'StepLabel', set: { textFill: 'Color/Text/Secondary' } }],
        Current: [{ role: 'root', set: { fill: 'Color/Brand/Subtle', stroke: 'Color/Brand/Border' } }, { role: 'StepDot', set: { fill: 'Color/Brand/Primary' } }],
        Complete: [{ role: 'StepDot', set: { fill: 'Color/Status/Success' } }],
        Error: [{ role: 'StepDot', set: { fill: 'Color/Status/Danger' } }, { role: 'root', set: { stroke: 'Color/Status/Danger', strokeW: 1.5 } }],
      },
    },
    a11y: 'Stepper item exposes aria-current="step" for Current in code; state is textual + colour; ≥40px row.',
    description: 'One step of the upload wizard (Upload → Details → Review → Published).',
  },
  {
    key: 'editorial-workflow-badge', name: 'EditorialWorkflowBadge', category: 'media', maps: 'docs/phase102/architecture.md §11 editorial workflow',
    preset: 'control', presetOpts: { label: 'Draft', padX: 10, padY: 4, minH: 24, radius: 9999, textStyle: 'Caption' },
    axes: [axis('State', ['Draft', 'Submitted', 'InReview', 'Published', 'Rejected', 'Archived'])], dirAxis: false,
    text: [p('Label', 'Label')],
    valueOverrides: {
      State: {
        Draft: [{ role: 'root', set: { fill: null, stroke: 'Color/Border/Default' } }, { role: 'Label', set: { textFill: 'Color/Text/Muted', text: 'Draft' } }],
        Submitted: [{ role: 'root', set: { fill: 'Color/Status/Information (subtle)', stroke: 'Color/Status/Information (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Information', text: 'Submitted' } }],
        InReview: [{ role: 'root', set: { fill: 'Color/Status/Warning (subtle)', stroke: 'Color/Status/Warning (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Warning', text: 'In review' } }],
        Published: [{ role: 'root', set: { fill: 'Color/Status/Success (subtle)', stroke: 'Color/Status/Success (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Success', text: 'Published' } }],
        Rejected: [{ role: 'root', set: { fill: 'Color/Status/Danger (subtle)', stroke: 'Color/Status/Danger (border)' } }, { role: 'Label', set: { textFill: 'Color/Status/Danger', text: 'Rejected' } }],
        Archived: [{ role: 'root', set: { fill: null, stroke: 'Color/Border/Default' } }, { role: 'Label', set: { textFill: 'Color/Text/Disabled', text: 'Archived' } }],
      },
    },
    a11y: 'Lifecycle state is text + colour, never colour alone; the 6 variants map 1:1 onto the pure transition table in the architecture ADR §11 (DRAFT → SUBMITTED → IN_REVIEW → PUBLISHED → ARCHIVED, REJECTED reachable from review).',
    description: 'Editorial lifecycle-state badge (real variants, not decoration).',
  },
  {
    key: 'moderation-review-card', name: 'ModerationReviewCard', category: 'media', maps: 'docs/phase102/architecture.md §11 review_media',
    preset: 'reviewCard', presetOpts: {},
    axes: [axis('State', ['Pending', 'Approved', 'Rejected', 'Focus'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Body', 'Body')],
    valueOverrides: {
      State: {
        Pending: [],
        Approved: [{ role: 'StateDot', set: { fill: 'Color/Status/Success' } }, { role: 'RejectAction', set: { opacity: 0.5 } }],
        Rejected: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }, { role: 'ApproveAction', set: { opacity: 0.5 } }],
      },
    },
    a11y: 'Approve/Reject are distinct, separately labelled ≥40px actions (review_media permission in code); outcome dimming is supportive, never colour-only (label text still present); Focus shows a keyboard-navigable ring before either action is chosen.',
    description: 'Moderation queue card for SUBMITTED/IN_REVIEW media.',
  },
  {
    key: 'media-empty-state', name: 'MediaEmptyState', category: 'media', maps: null,
    preset: 'card', presetOpts: { title: 'No videos yet', body: 'Once your organization publishes media, it will appear here.', action: 'Upload a video', minW: 320 },
    axes: [axis('Tone', ['Neutral', 'Brand'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')],
    valueOverrides: {
      Tone: {
        Brand: [{ role: 'StateDot', set: { fill: 'Color/Brand/Primary' } }, { role: 'Action', set: { fill: 'Color/Brand/Primary' } }],
        Neutral: [{ role: 'StateDot', set: { fill: 'Color/Text/Muted' } }, { role: 'Action', set: { fill: 'Color/Surface/Interactive' } }, { role: 'ActionLabel', set: { textFill: 'Color/Text/Primary' } }],
      },
    },
    a11y: 'Always offers a next action; action is a real ≥40px target.',
    description: 'Zero-data placeholder for empty video lists/search results.',
  },
  {
    key: 'media-error-state', name: 'MediaErrorState', category: 'media', maps: null,
    preset: 'card', presetOpts: { title: 'Video failed to load', body: 'The stream could not be reached. Check your connection and try again.', action: 'Retry', dotFill: 'Color/Status/Danger', minW: 320 },
    axes: [axis('Tone', ['Danger', 'Warning'])], dirAxis: true,
    text: [p('Title', 'Title'), p('Description', 'Body'), p('ActionLabel', 'ActionLabel')],
    valueOverrides: {
      Tone: { Danger: [{ role: 'StateDot', set: { fill: 'Color/Status/Danger' } }], Warning: [{ role: 'StateDot', set: { fill: 'Color/Status/Warning' } }, { role: 'Title', set: { text: 'Playback degraded' } }] },
    },
    a11y: 'Error announced via a live region in code; retry is a ≥40px target.',
    description: 'Recoverable error surface for library/search/player failures.',
  },
  {
    key: 'media-loading-state', name: 'MediaLoadingState', category: 'media', maps: null,
    preset: 'loader', presetOpts: {},
    axes: [axis('Shape', ['Line', 'Block', 'Circle'])], shapeAxis: true, dirAxis: false,
    a11y: 'Decorative: aria-hidden; paired with a textual busy status in code.',
    description: 'Loading skeleton placeholder (title line, thumbnail block, avatar circle).',
  },
  {
    key: 'media-dialog', name: 'MediaDialog', category: 'media', maps: 'docs/phase102/architecture.md §11 publication event',
    preset: 'overlay', presetOpts: { title: 'Publish this video?', body: 'It will become visible to everyone with library access.', actions: ['Publish', 'Cancel'] },
    axes: [axis('Kind', ['Confirm', 'Destructive', 'Info'])], dirAxis: true, elevation: 'Elevation/E4',
    text: [p('Title', 'Title'), p('Body', 'Body'), p('ConfirmLabel', 'PrimaryLabel'), p('CancelLabel', 'SecondaryLabel')],
    valueOverrides: {
      Kind: {
        Confirm: [],
        Destructive: [{ role: 'PrimaryAction', set: { fill: 'Color/Status/Danger' } }, { role: 'PrimaryLabel', set: { text: 'Delete' } }, { role: 'Title', set: { text: 'Delete this video?' } }],
        Info: [{ role: 'PrimaryAction', set: { fill: 'Color/Status/Information' } }, { role: 'PrimaryLabel', set: { text: 'Got it' } }],
      },
    },
    a11y: 'aria-modal + labelled title + focus trap in code; E4 elevation on glass overlay; Destructive requires a confirmation phrase in code, not just colour.',
    description: 'Confirmation/destructive/informational dialog for publish, delete and review actions.',
  },
  {
    key: 'icon', name: 'Icon', category: 'utility', maps: null,
    preset: 'iconMark', presetOpts: {},
    axes: [axis('Mark', ['Dot', 'Ring', 'Square', 'Bar', 'Diamond'])], markAxis: true, dirAxis: false,
    a11y: 'Decorative geometric marks; meaning is always carried by adjacent text/label, never the icon alone.',
    description: 'Geometric icon-mark utility family used as the INSTANCE_SWAP default for play/pause, transport, volume, captions, fullscreen, search and favourite icon slots across the other 22 families (honest, font-free — same convention as the Phase 87 design-system plugin).',
  },
]

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

module.exports = { FAMILIES, variantCombos, totalVariants }
