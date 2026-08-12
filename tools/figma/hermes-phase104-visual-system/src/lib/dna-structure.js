// @ts-check
'use strict'
/**
 * File structure — EXACTLY three pages, as directed by the owner.
 *
 * The Starter plan caps a file at 3 pages, so the full Phase 104 taxonomy is
 * carried by SECTIONS inside those pages. Nothing is dropped and nothing is
 * merged away: all 23 categories survive, they are simply organised as sections
 * rather than pages. Section order inside a page is the canvas order.
 *
 * Starter capabilities NOT available, and therefore never claimed anywhere in
 * this plugin or its reports:
 *   - variable collection MODES  (hard-capped at 1 — `addMode` throws)
 *   - team LIBRARY PUBLISHING    (Professional feature)
 * Everything those would normally carry is expressed instead through
 * single-mode collections, component VARIANTS and component PROPERTIES.
 */

const PAGES = Object.freeze([
  {
    key: 'page:foundations',
    name: '01 — Foundations & Components',
    sections: [
      // The approved mockups the owner is supplying land here. It is created
      // EMPTY and stays empty until real images arrive — it is never populated
      // with invented artwork, and its emptiness is what keeps the report honest.
      { key: 'sec:approved-refs', name: '00 — Approved Visual References', w: 9600, h: 5400, awaitingOwnerAssets: true },
      { key: 'sec:dna', name: '01 — Design DNA & Direction', w: 9600, h: 3600 },
      { key: 'sec:tokens', name: '02 — Tokens & Variables', w: 9600, h: 6400 },
      { key: 'sec:type', name: '03 — Typography & Iconography', w: 9600, h: 3600 },
      { key: 'sec:core', name: '04 — Core Components', w: 12000, h: 9000 },
      { key: 'sec:industrial', name: '05 — Industrial Components', w: 12000, h: 7000 },
      { key: 'sec:intelligence', name: '06 — Intelligence Components', w: 12000, h: 6000 },
    ],
  },
  {
    key: 'page:screens',
    name: '02 — Hermes Product Screens',
    sections: [
      { key: 'sec:workspace', name: '07 — Workspace & Authentication', w: 11000, h: 5200 },
      { key: 'sec:command-center', name: '08 — Command Center', w: 11000, h: 5200 },
      { key: 'sec:brain', name: '09 — Industrial Brain', w: 11000, h: 5200 },
      { key: 'sec:live-ops', name: '10 — Live Operations', w: 11000, h: 5200 },
      { key: 'sec:assets', name: '11 — Assets & Connectivity', w: 11000, h: 5200 },
      { key: 'sec:alarms', name: '12 — Alarm Center', w: 11000, h: 5200 },
      { key: 'sec:reports', name: '13 — Reports & Analytics', w: 11000, h: 5200 },
      { key: 'sec:admin', name: '14 — Administration', w: 11000, h: 5200 },
      { key: 'sec:p101', name: '15 — Phase 101 Industrial Engineering', w: 11000, h: 5200, speculative: true },
      { key: 'sec:p102', name: '16 — Phase 102 Media & Video Hub', w: 11000, h: 5200, speculative: true },
      { key: 'sec:p103', name: '17 — Phase 103 Automation Engineering Studio', w: 11000, h: 5200, speculative: true },
    ],
  },
  {
    key: 'page:quality',
    name: '03 — Responsive, Prototypes & Handoff',
    sections: [
      { key: 'sec:responsive', name: '18 — Responsive Matrix (1440 / 768 / 390)', w: 12000, h: 7000 },
      { key: 'sec:direction', name: '19 — RTL / LTR Direction', w: 12000, h: 5400 },
      { key: 'sec:prototypes', name: '20 — Interaction Prototypes', w: 9600, h: 4800 },
      { key: 'sec:a11y', name: '21 — Accessibility', w: 9600, h: 5200 },
      { key: 'sec:handoff', name: '22 — Engineering Handoff', w: 9600, h: 5200 },
    ],
  },
])

/** Sections whose content is SPECULATIVE because the phase does not exist in code. */
const SPECULATIVE_SECTIONS = Object.freeze(
  PAGES.flatMap((p) => p.sections.filter((s) => s.speculative).map((s) => s.name))
)

/** Capabilities the Starter plan does not provide. Never claimed as used. */
const STARTER_UNAVAILABLE = Object.freeze([
  {
    capability: 'Variable collection modes',
    code: 'NO_MODES',
    proof: 'collection.addMode() throws "Limited to 1 modes only"',
    substitute: 'One single-mode collection per semantic group; theme/breakpoint differences are carried by component variants, not modes.',
  },
  {
    capability: 'Team library publishing',
    code: 'NO_LIBRARY_PUBLISH',
    proof: 'Publishing a library is a Professional-tier feature.',
    substitute: 'Every component lives in this one file, so instances resolve locally without a published library.',
  },
  {
    capability: 'More than 3 pages',
    code: 'MAX_3_PAGES',
    proof: 'figma.createPage() throws "The Starter plan only comes with 3 pages"',
    substitute: 'All 23 taxonomy categories are carried as Sections across the 3 pages. No category is dropped.',
  },
])

module.exports = { PAGES, SPECULATIVE_SECTIONS, STARTER_UNAVAILABLE }
