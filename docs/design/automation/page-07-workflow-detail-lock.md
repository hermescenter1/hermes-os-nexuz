# Automation Page 07 — Workflow Detail — Visual Lock Record

```text
PAGE07_VISUAL_LOCK=YES
OWNER_VISUAL_APPROVAL=PASS
PAGE07_STATUS=DESIGN_LOCKED
LOCKED_SHA=9c93acf9655ae933684f9fefe8bde426156febc0
LOCKED_ON=2026-09-04
LOCKED_BY=OWNER
BRANCH=claude/hermes-automation-design-handoff-f50e62
PR=NONE · MERGE=NO · DEPLOY=NO
```

## What this record locks

The **visual design** of the automation workflow-detail page — route
`/{locale}/automation/workflows/[id]` — as it stands at `9c93acf`. That is the
page module `src/app/[locale]/automation/workflows/[id]/page.tsx`, its client
surface `src/components/automation/WorkflowDetailClient.tsx`, and the scoped
`.hermes-ops-navy` block in `src/app/globals.css`.

Locked characteristics:

| Aspect | Locked state |
|---|---|
| Canvas | Scoped navy ladder — canvas `#121D26` < nested tile `#14232C` < panel `#182731`; rail `#0F1A23`; header `#1B2C38 → #17242F` |
| Tokens | Text, brand cyan, status colours and borders remain the **shipped** estate tokens; only `--color-text-muted` is bound in scope (`#8496A6`) |
| Structure | Elevated header module → underlined tab rail → `xl` two-column workspace with a persistent identity rail |
| Executions | Model switch, not scroll: table from `md` up, stacked cards below |
| Touch targets | 44px at 390px for tabs, Edit, Back and per-row View |
| Primitives | Hermes design-system only (Card tiers, Badge, `buttonVariants`, `StatusIndicator`, `TechnicalValue`) |

## Evidence this lock rests on

Measured on the locked tree, not asserted:

- Background audit — every surface classifies **DARK NAVY**; none BLACK,
  NEAR-BLACK, LIGHT or WHITE. Classifier proven with red controls
  (`#000000`, `#06080D` → near-black; `#FFFFFF`, `#F5F7F8` → light).
- Contrast — all measured pairs meet WCAG AA (lowest 5.18:1, eyebrow text).
- Responsive — `OVERFLOW=0` at 1440, 1024 and 390 in both `en` and `fa`;
  table active (4 rows) ≥ md, cards active (4) below.
- RTL — `LEFT_EDGE_ESCAPES=0` across all Persian views; identifiers stay LTR
  inside `<bdi dir="ltr">`.
- Page 08 non-regression — the visually locked builder shares the automation
  shell; its computed styles were byte-compared before and after and are
  identical, with `navyScopePresent: false`.
- Screenshots — 12 authenticated views (en/fa × 1440/390 × three tabs, plus
  en at 1024), captured under local-only ephemeral review auth.

## Scope boundaries

- The lock covers **Page 07 only**. Pages 01–06 and the locked Page 08 builder
  are untouched and keep the estate's shipped canvas.
- The `.hermes-ops-navy` scope is opted into by this one route. The shared
  automation layout carries two inert marker class names and no default rules.
- The Phase 104 signature and token contracts are unaffected: the scope
  declares none of the pinned custom properties, re-painting the `.ds-glass-*`
  and utility **rules** instead. No `!important`.

## Change control

A locked page is not frozen forever, but it stops being a design decision an
implementer can make alone. Any change to the characteristics in the table
above requires a new owner visual approval and a new entry in this record.
Behavioural, security, redaction, i18n and accessibility fixes are **not**
gated by this lock.

## Known, accepted deviations

Recorded at lock time and accepted by the owner:

1. The Page 07 canvas sits one step lighter than the dashboard's
   `bg-background-base` (`#071018`) — a deliberate choice for a page with a
   large empty region, not a colour match.
2. Nested card radius stays at the shared 12px design-system primitive; it was
   not forked, to protect Page 08.
3. The theme is page-scoped, so the navy rail sits beside the estate's darker
   rail on adjacent automation routes.
