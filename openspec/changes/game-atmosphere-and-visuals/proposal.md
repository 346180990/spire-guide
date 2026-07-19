## Why

The site currently has zero images, uses a generic blue corporate color palette, and lacks any visual connection to gaming. After the obsidian-vault-content-pipeline delivered 869 reference pages, the content depth is strong but users land on pages that feel like technical documentation, not a game strategy site. Game strategy is a competitive SEO vertical — sites with immersive visuals (card art, dark fantasy theming, game-specific styling) retain users longer and signal topical authority to search engines. The original design.md flagged "Image strategy" as an open question; the content pipeline is now stable enough that we can address it.

## What Changes

- **Dark fantasy theme**: Replace the blue corporate palette (`#1a56db` primary, white `#ffffff` surface) with a dark dungeon-inspired theme (deep backgrounds, gold/amber accents, warm torchlight highlights) that evokes the feel of Slay the Spire 2's actual game aesthetic
- **Game hero banners**: Pull official Steam header capsule and screenshot images from Steam's public CDN for the homepage hero section and game hub pages — editorial use for a strategy guide site falls clearly within fair use
- **CSS-generated textures**: Add subtle background noise, gradient overlays, and parchment-like texture effects using pure CSS (inline SVG data URIs, no external image files) to give depth to cards and page sections
- **Custom SVG icon system**: Replace emoji placeholders (🂠 🏺 🧪 📖 👾 ⚡) with custom SVG icons for card types (Attack ⚔️ / Skill 🛡️ / Power ⭐ / etc.), rarity indicators, and game mechanics
- **Rarity glow system**: Color-coded borders and subtle box-shadow glows on entity cards and badges corresponding to in-game rarity tiers
- **Gaming-appropriate typography**: Add a fantasy-style serif font for headings (e.g., Cinzel or Cormorant) while keeping Inter for body text readability — mirroring how the game itself uses distinct display fonts
- **Reference page card frame**: For card detail pages, add an optional CSS card-frame component that visually resembles a game card (energy cost orb, card art area, framed effect text) rather than a plain `<div>` with badges

## Capabilities

### New Capabilities

- `dark-fantasy-theme`: Site-wide dark theme with game-appropriate color palette, typography, and CSS texture effects
- `game-asset-integration`: Pull and display game header/banner images from Steam's public CDN, with support for per-game cover images in content metadata
- `custom-icon-system`: SVG icon set for card types, rarities, character classes, and game mechanics — replacing emoji placeholders
- `card-visual-frame`: CSS-only card frame component for card reference pages that visually resembles an in-game card layout

### Modified Capabilities

None — this change adds visual layers on top of existing content pages without modifying their requirements.

## Impact

- **`src/styles/global.css`**: Major theme variable changes (colors, fonts, background utilities)
- **`tailwind.config` / `@theme` block**: New color tokens, font families, box-shadow utilities for rarity glows
- **All layouts** (`MainLayout`, `ReferenceLayout`, `ArticleLayout`): Visual inheritance from theme changes; optional hero banner slot additions
- **All pages**: Inherit new theme automatically; game hub page gains hero banner; reference pages gain visual card frames
- **`src/components/reference/*`**: EntityCard, EntityBadge, CardHeader gain rarity glow and icon integration
- **`public/`**: New `src/assets/` directory with SVG icons; no external image hosting needed for icons
- **`src/content/games/*.yaml`**: New optional fields (`coverImage`, `heroImage`, `colorScheme`) for per-game visual customization
- **Build performance**: CSS-only changes have zero impact on build time; Steam CDN images are external (no build processing); SVG icons are static assets
- **Accessibility**: Dark theme must maintain WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text)
