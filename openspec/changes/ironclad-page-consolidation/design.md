# Design: Character Page Consolidation

## ① Hero + QuickRef Merge

**Before:**
```
┌─────────────────────────────────────┐
│ [img] Ironclad                      │  ← Hero badge
│ Frontline Warrior  [beginner badge] │
│ "Hit hard, tank harder..."          │
│ Playstyle: aggro                    │
└─────────────────────────────────────┘
          ... (scroll) ...
┌─────────────────────────────────────┐
│ Quick Reference                     │  ← separate bar 10 sections later
│ Difficulty: ●●○○○  Easy            │
│ Power: 🌱→📈→💪→👑                  │
│ Similar to: 🎮 Hearthstone...       │
└─────────────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────────┐
│ [img] Ironclad  [beginner]          │
│ Frontline Warrior · ●●○○○ Easy      │  ← all inline
│ "Hit hard, tank harder..."          │
│ Early strong → scales to infinity   │
└─────────────────────────────────────┘
```

- Difficulty dots, pace label go into hero header
- "Similar to" analogies dropped (least useful info, feels AI)
- Power curve text replaces separate icon row

## ② Mechanics + Starting Deck Vertical

**Before:** `lg:grid-cols-2` side by side  
**After:** Full-width vertical stack, Mechanics on top, Starting Deck below

No other layout changes to either component.

## ③ Card Pool Collapse

```html
<details class="group">
  <summary>All 70 cards in Ironclad's pool ▸</summary>
  <!-- existing card grid -->
</details>
```

Default closed. Uses native `<details>` — no JS.

## ④ AI-Style Cleanup

| Remove | Replace With |
|--------|-------------|
| `⚠️ Common Pitfalls` | `Common Pitfalls` |
| `🔴 🟠 🟡` severity icons in PitfallStrip | CSS-colored dot or border only |
| `💪 🔥 🩸 ❤️` mechanic icons in MechanicIconGrid | Keep (these are character mechanics, not decorative) |
| `🏰 🌆 🗼` act icons in Timeline | Keep (informative, not decorative) |
| `🎮` prefix on Similar To items | Removed along with whole Similar To section |
| `📈 🌱 💪 👑` power curve icons | Simplified to text only |
| `Quick Reference` label | Removed (merged) |
| `Strategy Timeline` → | `Act Strategy` or keep as-is? → keep |

**Rule of thumb:** Keep emoji that convey game information (mechanics, acts). Remove emoji that are "decoration labels" (alert icons, header bullets).

## ⑤ Background Enhancement

Current `global.css` has noise + radial gradients. Enhance:

```css
body {
  background-image:
    /* Top — warm torchlight from above (like looking up at the Spire) */
    radial-gradient(ellipse 900px 500px at 50% 0%, rgba(212, 168, 67, 0.08) 0%, transparent 60%),
    /* Bottom — deep abyss */
    radial-gradient(ellipse 800px 400px at 50% 100%, rgba(15, 15, 26, 0.9) 0%, transparent 60%),
    /* Subtle stone/corridor edge vignette */
    radial-gradient(ellipse 100% 80% at 50% 50%, transparent 60%, rgba(0, 0, 0, 0.4) 100%),
    /* Noise texture */
    url("data:image/svg+xml,...");
}
```

Stronger vignette, slightly more visible torch glow. No image assets needed — pure CSS.
