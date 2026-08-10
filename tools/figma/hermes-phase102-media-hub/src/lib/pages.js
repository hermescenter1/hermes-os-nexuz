// @ts-check
'use strict'
/**
 * PURE page-planning logic enforcing the Figma STARTER-plan hard ceiling:
 * `figma.createPage()` throws "The Starter plan only comes with 3 pages" on
 * the 4th page — this is a FILE-LEVEL cap, not a per-plugin cap. The target
 * file already exists with its own default page(s), so this plugin must never
 * blindly call createPage() 3 times; it must find-or-create/rename to land on
 * exactly the 3 named pages (`01 Foundations` / `02 Components` /
 * `03 Screens`) without ever exceeding the ceiling.
 *
 * Strategy (idempotent, deterministic, pure):
 *   1. Any existing page whose name already matches a desired name is REUSED.
 *   2. Any remaining desired name claims one existing "spare" page (a page not
 *      already claimed and not itself one of the desired names) by RENAMING
 *      it, in file order — this is how the file's original default page
 *      (typically "Page 1") becomes "01 Foundations" without a net page-count
 *      increase.
 *   3. Only once spares are exhausted does a remaining desired name CREATE a
 *      new page — and only if doing so keeps the file at or under the cap.
 *   4. If honouring every desired name would exceed the cap, the WHOLE plan
 *      is reported blocked (fail closed) rather than silently dropping a page
 *      or throwing mid-run.
 */

const MAX_PAGES = 3

/**
 * @typedef {{ name: string, action: 'reuse'|'rename'|'create', fromName?: string, idx?: number }} PageAction
 *   `idx` (reuse/rename only) is the ORIGINAL index into existingPageNames —
 *   the executor must key off this, not `fromName`, because Figma allows
 *   duplicate page names and a name-only lookup could grab the wrong page.
 */

/**
 * @param {string[]} existingPageNames current figma.root.children names, in file order
 * @param {string[]} desiredNames the pages this plugin manages, in apply order
 * @returns {{ ok: boolean, actions: PageAction[], blocked?: string, finalPageCount: number }}
 */
function planPages(existingPageNames, desiredNames) {
  const existing = [...(existingPageNames || [])]
  const desired = [...(desiredNames || [])]
  const claimedExistingIdx = new Set()
  /** @type {PageAction[]} */
  const actions = []

  // Pass 1 — exact-name reuse.
  for (const name of desired) {
    const idx = existing.findIndex((n, i) => n === name && !claimedExistingIdx.has(i))
    if (idx !== -1) { claimedExistingIdx.add(idx); actions.push({ name, action: 'reuse', idx }) }
  }

  // Pass 2 — remaining desired names claim spare pages (rename) or create.
  let projectedTotal = existing.length
  for (const name of desired) {
    if (actions.some((a) => a.name === name)) continue // already reused
    const spareIdx = existing.findIndex((n, i) => !claimedExistingIdx.has(i))
    if (spareIdx !== -1) {
      claimedExistingIdx.add(spareIdx)
      actions.push({ name, action: 'rename', fromName: existing[spareIdx], idx: spareIdx })
      continue
    }
    if (projectedTotal + 1 > MAX_PAGES) {
      return { ok: false, actions, blocked: 'Starter plan allows at most ' + MAX_PAGES + ' pages total; creating "' + name + '" would exceed the cap (existing=' + existing.length + ').', finalPageCount: projectedTotal }
    }
    projectedTotal += 1
    actions.push({ name, action: 'create' })
  }

  // Final page count = untouched existing pages (preserved as-is) + the managed desired pages.
  const untouchedExisting = existing.length - claimedExistingIdx.size
  const total = untouchedExisting + desired.length
  if (total > MAX_PAGES) {
    return { ok: false, actions, blocked: 'Resulting page count ' + total + ' would exceed the Starter cap of ' + MAX_PAGES + '.', finalPageCount: total }
  }
  return { ok: true, actions, finalPageCount: total }
}

module.exports = { MAX_PAGES, planPages }
