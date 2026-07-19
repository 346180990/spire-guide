# Tasks: Character Page Consolidation & Style Cleanup

## Phase 1: Hero + QuickRef Merge

- [x] **Task 1** — Move difficulty dots, label, and pace text into hero header in `CharacterDashboardLayout.astro`
- [x] **Task 2** — Remove `<QuickReferenceBar>` from layout and delete the import
- [x] **Task 3** — Verify all 6 character YAMLs have `quickRef.difficultyRating` and `quickRef.paceLabel` fields
- [x] **Task 4** — Delete `src/components/QuickReferenceBar.astro`

## Phase 2: Mechanics + Starting Deck Vertical Stack

- [x] **Task 5** — Change `lg:grid-cols-2` container to single-column layout in `CharacterDashboardLayout.astro`
- [x] **Task 6** — Verify vertical stacking looks correct on desktop viewport

## Phase 3: Card Pool Collapse

- [x] **Task 7** — Wrap card pool section in `<details>` element in `CharacterDashboardLayout.astro`
- [x] **Task 8** — Add `<noscript>` fallback so card pool is always visible without JS

## Phase 4: AI-Style Cleanup

- [x] **Task 9** — Remove `⚠️` from PitfallStrip section header and 🔴🟠🟡 severity emoji
- [x] **Task 10** — Review and remove any remaining decorative-only emoji from section headings

## Phase 5: Spire Atmosphere Background

- [x] **Task 11** — Enhance `global.css` background with stronger torchlight glow, bottom abyss, and vignette

## Phase 6: Verification

- [x] **Task 12** — Run `npx astro build` — zero errors (983 pages)
- [x] **Task 13** — Visual check Ironclad page desktop + mobile at localhost:4321
