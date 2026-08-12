// @ts-check
'use strict'
/**
 * Foundations-page documentation specimens — pure NodeSpec trees (same DSL as
 * presets.js) rendered directly onto "01 Foundations" (not components; no
 * variants). These make the token collections visually reviewable: a colour
 * swatch grid grouped exactly like tokens.js `COLOR_TOKENS[].group`, a
 * self-labelled type-ramp specimen (each line rendered IN its own text
 * style), a spacing/radius scale strip, and an elevation/glass specimen row
 * that actually binds the real Elevation/E1-E4 + Glass/Overlay effect styles.
 */

const { frame, txt, rect, M } = require('./presets')

/**
 * @param {ReadonlyArray<{figma:string, group:string}>} colorTokens
 * @returns {any} NodeSpec
 */
function buildColorSwatchesSpec(colorTokens) {
  /** @type {Record<string, {figma:string}[]>} */
  const groups = {}
  for (const t of colorTokens) { (groups[t.group] = groups[t.group] || []).push(t) }
  const rows = Object.keys(groups).sort().map((g) => frame('Group_' + g, {
    gap: M.gapTight,
    children: [
      txt('GroupLabel_' + g, g.toUpperCase(), 'Caption', 'Color/Text/Muted'),
      frame('Row_' + g, {
        row: true, gap: M.gap,
        children: groups[g].map((t, i) => frame('Swatch_' + g + '_' + i, {
          gap: 4,
          children: [
            rect('Tile_' + g + '_' + i, { w: 100, h: 56, radius: M.radiusSm, fill: t.figma, stroke: 'Color/Border/Default', strokeW: 1 }),
            txt('Label_' + g + '_' + i, t.figma.split('/').slice(1).join(' / '), 'Caption', 'Color/Text/Secondary', { maxW: 100 }),
          ],
        })),
      }),
    ],
  }))
  return frame('ColorSwatches', { gap: M.gapWide, children: rows })
}

/**
 * @param {ReadonlyArray<{name:string, size:number, line:number}>} textStyles
 * @returns {any} NodeSpec
 */
function buildTypeRampSpec(textStyles) {
  return frame('TypeRamp', {
    gap: M.gap,
    children: textStyles.map((t, i) => txt('Specimen_' + i, t.name + ' — ' + t.size + '/' + t.line + 'px', t.name, 'Color/Text/Primary')),
  })
}

/**
 * @param {string} role @param {ReadonlyArray<{figma:string, value:number}>} tokens @param {'space'|'radius'} kind
 * @returns {any} NodeSpec
 */
function buildScaleSpec(role, tokens, kind) {
  return frame(role, {
    row: true, gap: M.gapWide,
    children: tokens.map((t, i) => frame(role + '_' + i, {
      gap: 4, center: true,
      children: [
        kind === 'radius'
          ? rect(role + '_Box_' + i, { w: 64, h: 64, radius: t.value, fill: 'Color/Surface/Interactive', stroke: 'Color/Border/Default', strokeW: 1 })
          : rect(role + '_Box_' + i, { w: Math.max(t.value, 4), h: 24, radius: 2, fill: 'Color/Brand/Primary' }),
        txt(role + '_Label_' + i, t.figma + ' · ' + t.value + 'px', 'Caption', 'Color/Text/Muted'),
      ],
    })),
  })
}

/**
 * @param {ReadonlyArray<{name:string}>} shadowTokens @param {ReadonlyArray<{name:string}>} glassTokens
 * @returns {any} NodeSpec — tiles carry `effectStyle` so the renderer binds the REAL effect style.
 */
function buildElevationSpec(shadowTokens, glassTokens) {
  return frame('Elevation', {
    row: true, gap: M.gapWide,
    children: [
      ...shadowTokens.map((s, i) => frame('E_' + i, { w: 130, h: 84, radius: M.radiusMd, fill: 'Color/Surface/Primary', center: true, effectStyle: s.name, children: [txt('ELabel_' + i, s.name, 'Caption', 'Color/Text/Secondary')] })),
      ...glassTokens.map((g, i) => frame('Glass_' + i, { w: 160, h: 84, radius: M.radiusMd, fill: 'Color/Surface/Glass', stroke: 'Color/Surface/Glass (border)', strokeW: 1, center: true, effectStyle: g.name, children: [txt('GlassLabel_' + i, g.name, 'Caption', 'Color/Text/Secondary')] })),
    ],
  })
}

module.exports = { buildColorSwatchesSpec, buildTypeRampSpec, buildScaleSpec, buildElevationSpec }
