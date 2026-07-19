## Context

BuildSaga currently serves 886 pages with a generic blue corporate theme (`#1a56db` primary, white `#ffffff` surface, Inter font throughout). The site has zero images beyond favicons. After the obsidian-vault-content-pipeline delivered 869 game reference pages (cards, relics, potions, mechanics, enemies), the content depth is strong but the visual presentation undermines user engagement and topical authority signals for SEO.

The original design.md flagged this: "Image strategy: AI-generated article images? Official game screenshots (copyright concern)? ASCII diagrams? Decision needed before first article goes live — likely start with no images, add screenshots during human review phase."

**Current visual architecture:**
```
global.css (@theme block)
  ├── Colors: corporate blue primary, white surfaces, slate text
  ├── Fonts: Inter (sans), JetBrains Mono (mono)
  └── Base: light background, standard link styling

MainLayout.astro
  ├── White header with backdrop blur
  ├── White content area
  └── Light grey footer

Pages
  ├── Home: dark hero section (only dark area), white cards below
  ├── Game hub: white background, text cards, emoji icons
  ├── Reference pages: white cards, colored badges, markdown prose
  └── Listing pages: white entity cards in grid, filter dropdowns
```

**Constraints:**
- Zero build-time impact: all visual changes must be CSS or external CDN references
- No runtime JS added for visual effects (ad slots already use client-side hydration)
- Must maintain WCAG AA contrast (4.5:1 body, 3:1 large text)
- Must work identically in Astro dev and static build modes
- Must not break existing ad slot positioning or SEO metadata
- Per-game theming must be additive (no code changes to add a new game with custom colors)

## Goals / Non-Goals

**Goals:**
- Transform the site's visual identity from corporate to game-appropriate dark fantasy within the existing Tailwind CSS v4 + Astro architecture
- Add hero/banner images from Steam's public CDN for game hubs and the homepage
- Create a reusable SVG icon system for card types, rarities, and mechanics
- Add CSS-only card frame styling to card reference pages
- Make per-game color theming configurable from game metadata YAML
- Achieve all of the above with zero additional build-time processing

**Non-Goals:**
- Hosting or serving card art images (copyright risk — deferred to future evaluation)
- Image optimization pipeline (Steam CDN handles serving; no local image processing needed)
- Animation framework or JS transitions (CSS transitions only, no Framer Motion or similar)
- Character portrait images (deferred — fewer characters than cards, less impact)
- Dark/light mode toggle (dark will be the only theme for v1; toggle is future work)
- Changes to content MDX generation pipeline (the convert-vault.mjs script is unchanged)

## Decisions

### 1. Theme Delivery: Tailwind @theme Variables + CSS Custom Properties

**Decision:** Define all theme tokens as CSS custom properties inside the existing Tailwind `@theme` block. No separate CSS file, no CSS-in-JS, no runtime theme switching.

**Rationale:** Tailwind CSS v4's `@theme` block already supports custom properties natively. By replacing the current blue corporate values with dark fantasy values, every component that uses `text-text`, `bg-surface`, `border-border`, etc. automatically inherits the new theme. This is a "change the tokens, change everything" approach — minimal code change, maximum visual impact.

**Dark fantasy token map:**
```
Token              Current (Corporate)        New (Dark Fantasy)
─────────────────────────────────────────────────────────────────
--color-primary     #1a56db (blue)            #d4a843 (warm gold)
--color-primary-dark #1e40af                   #b8942e
--color-primary-light #3b82f6                  #f0c960
--color-surface     #ffffff (white)           #1a1a2e (deep navy-black)
--color-surface-alt #f8fafc (light grey)      #222240 (slightly lighter)
--color-surface-dark #1e293b (slate)          #0f0f1a (near-black)
--color-text        #0f172a (near-black)      #e8e6e3 (warm off-white)
--color-text-muted  #475569 (slate)           #9d968d (warm grey)
--color-text-light  #64748b                    #6b6560
--color-border      #e2e8f0 (light grey)      #3d3d5c (subtle purple-grey)
--color-accent-gold #f59e0b                    #f0c960 (brighter for contrast)
--color-accent-green #10b981                   #4ade80
--color-accent-red  #ef4444                    #f87171
```

**Alternatives considered:**
- **CSS variables in `:root` outside Tailwind**: Works but doesn't integrate with Tailwind's utility classes. Would need `var()` references everywhere.
- **Separate `dark-theme.css` that overrides with `[data-theme="dark"]`**: Adds unnecessary complexity for a site that only needs one theme. We can add attribute-based toggling later if needed.
- **CSS-in-JS / styled-components**: Runtime overhead contradicts the static-first architecture.

### 2. Typography: Single Display Font + Body Font

**Decision:** Add Cinzel (Google Fonts, OFL license) as a display font for `h1`-`h3` headings in strategic positions (hero, game hub, card names). Keep Inter for body text and `h4`-`h6`. Use JetBrains Mono for stats/numbers as already configured.

**Rationale:** Cinzel is an open-source serif font inspired by classical Roman inscriptions — it evokes fantasy/RPG without being cartoonish. It's available on Google Fonts (same CDN already used for Inter), so no new dependency. Body text stays Inter for readability (WCAG compliance at small sizes is easier with sans-serif).

**Font stack:**
```css
--font-display: "Cinzel", ui-serif, serif;
--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;  /* unchanged */
--font-mono: "JetBrains Mono", ui-monospace, monospace;      /* unchanged */
--font-game: var(--font-display);
```

**Alternatives considered:**
- **Cormorant**: More decorative, less readable at small sizes. Good for titles, poor for h3.
- **No serif font (stay Inter-only)**: Misses the game atmosphere opportunity that typography alone can deliver.
- **Game-specific font per title**: Over-engineering for v1. Cinzel works well enough for Slay the Spire's dark fantasy aesthetic.

### 3. Game Asset Source: Steam CDN Direct Reference

**Decision:** Reference Steam header capsule images and screenshots directly from `cdn.cloudflare.steamstatic.com` via `<img>` tags. Store the Steam App ID in game metadata YAML, derive CDN URLs from a utility function.

**Rationale:** Steam's CDN is public, globally distributed, and has no rate limiting for embedded images. The header capsule (600×900 or 460×215 depending on variant) is the official marketing image for the game — using it on a strategy guide site is well-established editorial fair use. No local storage, no build-time processing, no bandwidth costs.

**URL patterns:**
```
Header capsule:  https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/header.jpg
Hero/library:    https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_hero.jpg  
Screenshot N:    https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/ss_{hash}.600x338.jpg
```

**Metadata changes to games YAML:**
```yaml
# slay-the-spire-2.yaml (additions)
steamAppId: "2868840"
coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2868840/header.jpg"
heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2868840/library_hero.jpg"
colorScheme:
  primary: "#d4a843"
  surface: "#1a1a2e"
  accent: "#c41e3a"
```

When `coverImage` is empty/missing, fall back to the existing solid-color hero section. When `colorScheme` is missing, use the global dark fantasy defaults.

**Alternatives considered:**
- **Download and serve locally**: Requires image optimization pipeline, increases build time, consumes Cloudflare Pages bandwidth. No benefit over CDN for static images.
- **Official press kit only**: Mega Crit doesn't maintain a dedicated press kit page. IGDB has a curated selection but CDN URLs are more reliable.
- **Screenshot CDN URLs**: Harder to get (hash-based). Defer screenshots — header + library_hero cover the key placements.

### 4. Icons: Inline SVG Components

**Decision:** Create Astro `.astro` components that render inline SVGs for game icons. One component per icon category, with props controlling variant.

**Rationale:** Inline SVGs are CSS-stylable (inherit `currentColor`, respond to theme changes), have zero additional HTTP requests, and are trivially tree-shaken (only the icons used on a page are rendered). Astro components are the natural fit — they compile to static SVG markup at build time.

**Icon architecture:**
```
src/components/icons/
  ├── CardTypeIcon.astro    (Attack/Skill/Power/Status/Curse)
  ├── RarityIcon.astro      (Common/Uncommon/Rare/Boss/Starter)
  ├── EnergyOrb.astro       (0-9, X — cost indicator with number overlay)
  └── MechanicIcon.astro    (Strength/Poison/Block/etc.)
```

**Usage pattern:**
```astro
<CardTypeIcon type="Attack" size="sm" />
<RarityIcon rarity="Rare" withGlow />
<EnergyOrb cost={3} />
```

**Alternatives considered:**
- **Icon font (Font Awesome, etc.)**: Adds JS/CSS weight, no game-specific icons, harder to customize.
- **SVG sprite sheet**: Requires build tooling, harder to tree-shake, less flexible than components.
- **Emoji-only**: Current approach. Works but looks unpolished and unprofessional for a strategy site.

### 5. CSS Textures: Data URI Background Patterns

**Decision:** Use CSS `background-image` with inline SVG data URIs for subtle texture effects. Apply noise overlays, gradient fades, and parchment textures via Tailwind utility classes.

**Rationale:** SVG data URIs in CSS are a standard technique for background patterns. They add ~200 bytes each (gzipped) and require zero HTTP requests. The `bg-noise`, `bg-parchment`, `bg-dungeon` utilities can be applied to any element.

**Textures to implement:**
```
.bg-noise       → Subtle film grain overlay (SVG feTurbulence)
.bg-parchment   → Warm paper texture for quote blocks, flavor text
.bg-dungeon     → Dark gradient with vignette effect for hero sections
.card-glow-*    → Rarity-specific box-shadow glow utilities
```

**Alternatives considered:**
- **Actual image files in `/public/`**: Unnecessary HTTP requests for 200 bytes of texture. SVG data URIs are self-contained.
- **CSS `backdrop-filter` only**: Works for glass effects but can't produce noise/texture. Layering both gives the best result.

### 6. Card Frame: CSS-Only Visual Layout

**Decision:** Build a `CardFrame.astro` component that wraps card page content in a CSS-styled frame resembling an in-game card. Pure CSS — no canvas, no images, no JS.

**Rationale:** A game card has a recognizable visual structure: energy cost orb (top-left), card art area (center-top), card name (below art), type banner, effect text box. We can replicate this layout with CSS borders, backgrounds, and the energy orb SVG icon. For cards without actual art, the "art area" shows a color gradient based on character/type, with a large type icon centered in it.

**Card frame layout:**
```
┌─────────────────────────┐
│ ⚡3                     │  ← EnergyOrb (absolute positioned)
│                         │
│    ┌───────────────┐    │
│    │  Card Art Area │    │  ← Gradient bg + type icon
│    │    (⚔️ icon)   │    │     (color based on character)
│    └───────────────┘    │
│                         │
│    DEMON FORM           │  ← Card name (Cinzel, bold)
│    ─────────────────    │
│    Power · Rare · Iron  │  ← Type/rarity badges row
│    ─────────────────    │
│    At start of turn,    │  ← Effect text
│    gain 2 Strength.     │
│                         │
└─────────────────────────┘
```

**Character gradient map:**
```
Ironclad    → deep red to dark orange
Silent      → deep green to dark teal
Defect      → deep blue to cyan
Regent      → gold to amber
Necrobinder → deep purple to dark violet
Colorless   → grey to dark slate
```

**Alternatives considered:**
- **Actual card image from wiki (fair use)**: Higher visual fidelity but copyright risk. CSS frame is zero-risk and still conveys game atmosphere.
- **Canvas-drawn card**: Over-engineered for a static content page. CSS layout is simpler and more accessible.
- **No card frame (current state)**: Misses the most impactful visual improvement for the most-visited reference pages.

### 7. Per-Game Theming: YAML-Driven Color Overrides

**Decision:** Extend the game metadata schema with an optional `colorScheme` object. When present, CSS custom properties on `<html>` or a wrapper element are overridden for that game's pages. When absent, global defaults apply.

**Schema addition:**
```typescript
// content.config.ts
const gameMetadataSchema = z.object({
  // ...existing fields...
  steamAppId: z.string().optional(),
  heroImage: z.string().optional(),
  colorScheme: z.object({
    primary: z.string().optional(),    // e.g. "#d4a843"
    surface: z.string().optional(),
    accent: z.string().optional(),
  }).optional(),
});
```

**Implementation approach:**
Game-specific pages (under `/games/[game]/`) apply overrides via CSS custom properties on a wrapper `<div>`:
```astro
<div style={{
  '--color-primary': game.data.colorScheme?.primary,
  '--color-surface': game.data.colorScheme?.surface,
}}>
  <!-- page content -->
</div>
```

**Alternatives considered:**
- **Separate CSS file per game**: Fragmentation, build complexity, cache issues.
- **Data attributes on `<html>`**: `[data-game="slay-the-spire-2"]` selectors. More CSS weight but cleaner component code. Could adopt this if per-game theming grows beyond a few tokens.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **Steam CDN availability**: If Steam CDN blocks hotlinking or changes URL patterns, images break. | Fallback to solid-color hero when `<img>` fails to load (onerror handler or CSS fallback). Steam CDN has been stable for 15+ years — low risk. |
| **Dark theme readability**: Dark backgrounds with bright text can cause eye strain if contrast is too high. | Use warm off-white (`#e8e6e3`) instead of pure white, and deep navy (`#1a1a2e`) instead of pure black. Test all text/background pairs against WCAG AA thresholds. |
| **Cinzel font load time**: Adding a second Google Font adds ~30KB of font files. This impacts LCP on first visit if the font blocks rendering. | Use `font-display: swap` and preload only the heading weights (400, 700). Body text in Inter renders immediately. |
| **Card frame visual clutter**: A CSS card frame on every card detail page could feel repetitive or gimmicky. | Make the card frame a reusable component that reference pages *opt into* — not forced. The 495 card pages use it; relics/potions/mechanics/enemies use simpler display components. |
| **Per-game theming complexity**: As more games are added, maintaining per-game color overrides could become tedious. | For v1, only Slay the Spire 2 has overrides. The system is additive — games without `colorScheme` use sensible defaults. |

## Open Questions

- **Screenshot integration**: Should game hub pages show a screenshot gallery, or just the header image? Screenshot CDN URLs use content hashes that change — not practical to hardcode. Defer to future exploration.
- **Font licensing for game-specific display fonts**: Cinzel is OFL (free). If a future game needs a specific display font, we'd need to verify the license. Cross that bridge when we get there.
- **Ad contrast in dark theme**: Current ad slots are designed for light backgrounds. Google AdSense auto-adapts to dark themes to some degree, but we should verify after deployment.
