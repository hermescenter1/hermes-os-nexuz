// @ts-check
'use strict'
/**
 * Screens page composition — 6 screen types × 3 breakpoints × 3 locales = 54
 * screen declarations, each built ONLY from component INSTANCES of the
 * generated Phase 102 component sets (plus heading text and row/col auto-
 * layout groups) — same architecture as the Phase 87 design-system plugin's
 * `assemblies.js`, extended with a THIRD breakpoint and a vertical `col`
 * grouping (needed for the chapter-list + transcript side-by-side layout).
 *
 * Item shape (interpreted by the renderer in figma-exec.js):
 *   { family, variant?, props?, D }   component instance (+Direction when the
 *                                      family declares a Direction axis)
 *   { heading: string, style }        plain heading text
 *   { row: Item[] }                   HORIZONTAL group — reversed under RTL
 *   { col: Item[] }                   VERTICAL group — never reversed (only
 *                                      horizontal order mirrors under RTL)
 *
 * RTL correctness: reversing a `row`'s items (and right-aligning heading text)
 * happens here, at composition time — exactly like the proven assemblies.js
 * pattern. The player timeline / progress-meter LTR lock is NOT handled here;
 * it is guaranteed one level down, inside each protected component's OWN
 * Direction=RTL variant (see rtl.js + figma-exec.js mirrorRtl), so simply
 * placing a `player-control-bar` instance and letting its position in a row
 * flip is correct — the instance's internal timeline never gets touched.
 */

const { LOCALES, RTL_LOCALES, str } = require('./locale-strings')

/** @type {ReadonlyArray<{ id:string, width:number }>} */
const BREAKPOINTS = [
  { id: 'desktop', width: 1440 },
  { id: 'tablet', width: 768 },
  { id: 'mobile', width: 390 },
]

const SCREEN_TYPES = Object.freeze(['library', 'watch', 'search', 'instructor', 'continue-watching', 'upload'])

/** Column budget per breakpoint for repeated grid content. @param {string} bp */
function colsFor(bp) {
  return bp === 'desktop' ? 3 : bp === 'tablet' ? 2 : 1
}

/** @param {number} n @param {(i:number)=>any} factory */
function times(n, factory) {
  return Array.from({ length: n }, (_, i) => factory(i))
}

/**
 * Item list for one screen type + breakpoint + locale. All visible strings
 * come from locale-strings.js (see its provenance note — original design
 * copy, not yet in the repository catalogs).
 * @param {string} screenType @param {string} bp @param {'en'|'fa'|'de'} l
 * @returns {any[]}
 */
function itemsFor(screenType, bp, l) {
  const cols = colsFor(bp)
  const rtl = RTL_LOCALES.has(l)
  const D = rtl ? 'RTL' : 'LTR'
  const headStyle = bp === 'desktop' ? 'Heading/L' : 'Heading/M'
  const subHeadStyle = 'Heading/M'
  /** @param {string} family @param {Record<string,string>} [variant] @param {Record<string,string>} [props] */
  const inst = (family, variant, props) => ({ family, variant: variant || {}, props: props || {}, D })

  switch (screenType) {
    case 'library':
      return [
        inst('video-hero', { State: 'Default' }, { Eyebrow: 'Featured', Title: str('videoTitle', l), Meta: str('videoMeta', l), PlayLabel: 'Play', SaveLabel: 'Save for later' }),
        { heading: str('libraryHeading', l), style: headStyle },
        inst('search-field', { State: 'Default' }, { Placeholder: str('searchPlaceholder', l) }),
        { row: [
          inst('filter-chip', { State: 'Selected' }, { Label: str('filterLevel', l) }),
          ...(cols >= 2 ? [inst('filter-chip', { State: 'Default' }, { Label: 'Category' })] : []),
          ...(cols >= 3 ? [inst('filter-chip', { State: 'Default' }, { Label: 'Language' })] : []),
        ] },
        { row: [
          inst('category-chip', { Tone: 'Featured' }, { Label: str('categoryIndustrial', l) }),
          ...(cols >= 2 ? [inst('category-chip', { Tone: 'Industrial' }, { Label: 'Safety' })] : []),
          ...(cols >= 3 ? [inst('category-chip', { Tone: 'Default' }, { Label: 'Maintenance' })] : []),
        ] },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' })) },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('relatedTitle', l), Meta: str('relatedMeta', l), Duration: '08:21' })) },
      ]

    case 'watch': {
      const chapters = [
        inst('playlist-chapter-nav', { State: 'Completed' }, { ChapterTitle: 'Chapter 1 — Symptom review', ChapterTime: '00:00' }),
        inst('playlist-chapter-nav', { State: 'Active' }, { ChapterTitle: 'Chapter 2 — Vibration diagnostics', ChapterTime: '06:40' }),
        inst('playlist-chapter-nav', { State: 'Upcoming' }, { ChapterTitle: 'Chapter 3 — Corrective action', ChapterTime: '18:05' }),
      ]
      const transcript = inst('transcript-panel', { State: 'Default' })
      const sideBySide = cols >= 2 ? [{ row: [{ col: chapters }, transcript] }] : [{ col: chapters }, transcript]
      return [
        { heading: str('videoTitle', l), style: headStyle },
        inst('player-control-bar', { State: 'Playing' }, { ElapsedTime: '04:12', RemainingTime: '-38:20' }),
        { row: [inst('favourite-button', { Value: 'Unsaved', State: 'Default' }), inst('subtitle-toggle', { Value: 'On', State: 'Default' }, { Label: 'English captions' })] },
        ...sideBySide,
        { heading: str('watchRelatedHeading', l), style: subHeadStyle },
        { row: times(cols, () => inst('related-content-card', { State: 'Default' }, { Title: str('relatedTitle', l), Meta: str('relatedMeta', l) })) },
      ]
    }

    case 'search':
      return [
        { heading: str('searchHeading', l), style: headStyle },
        { heading: str('searchQueryNote', l), style: 'Body/M' },
        inst('search-field', { State: 'Filled' }, { Placeholder: str('searchPlaceholder', l) }),
        { row: [
          inst('filter-chip', { State: 'Default' }, { Label: str('filterLevel', l) }),
          ...(cols >= 2 ? [inst('filter-chip', { State: 'Selected' }, { Label: str('categoryIndustrial', l) })] : []),
        ] },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' })) },
      ]

    case 'instructor': {
      const stats = [
        { trend: 'Up', label: 'Total views', value: '12,480', unit: 'plays' },
        { trend: 'Flat', label: 'Avg. rating', value: '4.8', unit: '/5' },
        { trend: 'Down', label: 'Completion rate', value: '62', unit: '%' },
      ]
      return [
        inst('instructor-profile-card', { State: 'Default' }, { Name: str('instructorName', l), Role: str('instructorRole', l), Bio: str('instructorBio', l) }),
        { row: times(cols, (i) => inst('analytics-card', { Trend: stats[i % 3].trend, State: 'Default' }, { Label: stats[i % 3].label, Value: stats[i % 3].value, Unit: stats[i % 3].unit })) },
        { heading: str('instructorCoursesHeading', l), style: subHeadStyle },
        { row: times(cols, () => inst('related-content-card', { State: 'Default' }, { Title: str('relatedTitle', l), Meta: str('relatedMeta', l) })) },
      ]
    }

    case 'continue-watching':
      return [
        { heading: str('continueHeading', l), style: headStyle },
        ...times(cols, () => inst('continue-watching-row', { State: 'Default' }, { Title: str('continueTitle', l), RemainingLabel: str('continueTrail', l) })),
        { heading: str('favouritesHeading', l), style: subHeadStyle },
        { row: times(cols, () => inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' })) },
      ]

    case 'upload': {
      const steps = [
        inst('upload-workflow-step', { State: 'Complete' }, { StepLabel: str('uploadStep1', l), StepMeta: '1/4' }),
        inst('upload-workflow-step', { State: 'Complete' }, { StepLabel: str('uploadStep2', l), StepMeta: '2/4' }),
        inst('upload-workflow-step', { State: 'Current' }, { StepLabel: str('uploadStep3', l), StepMeta: '3/4' }),
        inst('upload-workflow-step', { State: 'Upcoming' }, { StepLabel: str('uploadStep4', l), StepMeta: '4/4' }),
      ]
      const stepRows = cols >= 3 ? [{ row: steps }] : cols === 2 ? [{ row: steps.slice(0, 2) }, { row: steps.slice(2) }] : steps
      return [
        { heading: str('uploadHeading', l), style: headStyle },
        ...stepRows,
        { row: [inst('video-card', { State: 'Default' }, { Title: str('videoTitle', l), Meta: str('videoMeta', l), Duration: '12:04' }), inst('editorial-workflow-badge', { State: 'InReview' }, { Label: 'In review' })] },
        { heading: str('moderationHeading', l), style: subHeadStyle },
        inst('moderation-review-card', { State: 'Pending' }, { Title: str('reviewTitle', l), Body: str('reviewBody', l) }),
        inst('media-dialog', { Kind: 'Confirm' }, { Title: str('publishDialogTitle', l), Body: str('publishDialogBody', l), ConfirmLabel: 'Publish', CancelLabel: 'Cancel' }),
      ]
    }

    default:
      throw new Error('unknown screen type: ' + screenType)
  }
}

/**
 * The 54 screen declarations (6 screen types × 3 breakpoints × 3 locales).
 * @returns {any[]}
 */
function buildScreens() {
  /** @type {any[]} */
  const out = []
  for (const st of SCREEN_TYPES) {
    for (const bp of BREAKPOINTS) {
      for (const l of LOCALES) {
        out.push({
          key: 'screen:' + st + ':' + bp.id + ':' + l,
          screenType: st,
          breakpoint: bp.id,
          locale: l,
          rtl: RTL_LOCALES.has(l),
          width: bp.width,
          name: 'Screen/' + st + '/' + bp.id + '/' + l.toUpperCase(),
          items: itemsFor(st, bp.id, l),
        })
      }
    }
  }
  return out
}

module.exports = { buildScreens, BREAKPOINTS, SCREEN_TYPES, colsFor }
