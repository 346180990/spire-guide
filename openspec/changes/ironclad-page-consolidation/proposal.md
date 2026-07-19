# Proposal: Character Page Consolidation & Style Cleanup

## Problem

The Ironclad character page (and all character dashboard pages) currently renders **13 distinct sections**, some repetitive and others visually "AI-generated." The user wants:

1. **Less vertical scrolling** — merge lightweight sections that repeat information
2. **Remove AI aesthetic** — eliminate decorative emoji prefixes, overly templated labels
3. **Single-game identity** — the site is about Slay the Spire 2, not a multi-game wiki
4. **Better atmosphere** — background should feel like the Spire, not a generic dark theme

## Scope (5 Changes)

| # | Change | Scope |
|---|--------|-------|
| ① | Hero + QuickRef merge | Inline difficulty dots & power curve into hero header, delete QuickReferenceBar |
| ② | Mechanics + Starting Deck vertical | Remove side-by-side grid, stack vertically |
| ③ | Card Pool collapse | Default-collapsed with toggle, reduce initial page height |
| ④ | Remove AI-style elements | Strip emoji prefixes from section headers, rename templated labels |
| ⑤ | Strengthen STS2 background | Enhance dungeon atmosphere, add subtle Spire-themed visual cues |

## What Stays

Stats Row, Strategy Timeline, Archetypes & Builds, Relic Tier List, Pitfall Strip, Guides Listing — zero changes.

## Impact

- **Files modified**: `CharacterDashboardLayout.astro`, `global.css`, possibly `MainLayout.astro`
- **Files deleted**: `QuickReferenceBar.astro` (merged into layout)
- **Pages affected**: All 6 character pages (ironclad, silent, defect, regent, necrobinder, colorless)
