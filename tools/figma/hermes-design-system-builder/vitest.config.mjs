import { defineConfig } from 'vitest/config'

// Isolated Vitest project for the Figma plugin's PURE core (spec / plan / starter
// gating). These tests import the plugin's pure CommonJS modules directly and
// never touch the `figma` global, so they run in a plain Node environment.
//
// Run from THIS directory so the config is picked up and tsc/vitest resolve from
// the repository root node_modules:  `npx vitest run`
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,mjs,cjs}'],
    environment: 'node',
    globals: false,
  },
})
