# Character Page Layout

## Hero Header + Quick Reference Merge

**Status:** proposed

The character hero header SHALL display difficulty rating and power curve inline, eliminating the standalone QuickReferenceBar section.

### Requirements

- **H1.** Difficulty dots (●○○○○) and text label SHALL render in the hero header, next to the character's role line
- **H2.** Power curve pace text (e.g. "Strong early, scales to infinity") SHALL render below the tagline in the hero header
- **H3.** The `QuickReferenceBar.astro` component SHALL be removed from the layout and the file MAY be deleted
- **H4.** The "Similar To" game analogies section SHALL be removed (not moved elsewhere)

### Acceptance

- Hero header shows: name, role, difficulty dots + label, tagline, pace text
- No orphaned `QuickReferenceBar` imports or references remain
- `QuickReferenceBar.astro` file is deleted
- All 6 character pages build without error

## Mechanics + Starting Deck Layout

**Status:** proposed

Core Mechanics and Starting Deck SHALL stack vertically (full width) instead of sitting side by side in a 2-column grid.

### Requirements

- **S1.** Remove `lg:grid-cols-2` from the Mechanics/StartingDeck container
- **S2.** Each section SHALL render full-width, Mechanics above Starting Deck
- **S3.** No changes to the internal layout of MechanicIconGrid or StartingHand components

### Acceptance

- On desktop, mechanics cards span full width (up to 3 columns per its own grid)
- Starting Deck cards appear below mechanics, also full width
- Mobile layout unchanged

## Card Pool Collapse

**Status:** proposed

The full card pool (all cards grouped by rarity) SHALL be hidden by default behind a toggle.

### Requirements

- **C1.** Card pool section SHALL use a native `<details>` element, closed by default
- **C2.** `<summary>` SHALL display the total card count and character name (e.g. "Show all 75 Ironclad cards")
- **C3.** Opening the toggle SHALL reveal the existing rarity-grouped card grid unchanged
- **C4.** Closing the toggle SHALL hide the grid
- **C5.** No JavaScript required — use `<details open>` or `<details>` HTML behavior

### Acceptance

- Card pool is collapsed on page load
- Clicking summary expands full card grid
- All card images and links work as before
- `<noscript>` fallback: cards are visible (add `<noscript><style>details>summary{display:none}</style></noscript>` or similar)
