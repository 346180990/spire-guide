# AI-Style Removal

**Status:** proposed

Remove decorative emoji prefixes and overly templated section labeling that gives the site an "AI-generated" feel.

### Requirements

- **A1.** Section header "⚠️ Common Pitfalls" SHALL become "Common Pitfalls" (remove emoji prefix)
- **A2.** Severity indicator emoji (🔴🟠🟡) in PitfallStrip SHALL be removed; severity SHALL continue to be indicated by left border color and badge text
- **A3.** "🎮" prefix on Similar To items SHALL be removed (along with the entire Similar To section as per character-page-layout H4)
- **A4.** Power curve emoji (🌱📈💪👑) in QuickReferenceBar SHALL be removed (along with the entire QuickReferenceBar per character-page-layout H3)
- **A5.** Informational emoji that convey game meaning SHALL be preserved:
  - Mechanic icons (💪🔥🩸❤️ etc.) — these are character mechanic identifiers
  - Act icons (🏰🌆🗼) — these indicate game progression
  - Card type icons — if any exist
- **A6.** Stats Row labels SHALL remain unchanged ("Cards in Pool", "Starting Deck", "Guides", "Rare Cards")

### Acceptance

- No ⚠️ prefix on section titles
- No 🔴🟠🟡 on pitfall cards
- Build passes with zero warnings
