## 1. Dark Fantasy Theme Foundation

- [x] 1.1 Replace `@theme` color tokens in `global.css` with dark fantasy palette (dark surfaces, gold primary, warm off-white text, subtle purple-grey borders)
- [x] 1.2 Update tier colors (`--color-tier-*`) to complement dark backgrounds
- [x] 1.3 Add Cinzel font to Google Fonts preconnect and font-family declarations in `MainLayout.astro`
- [x] 1.4 Add `--font-display` CSS variable for Cinzel and update h1-h3 to use it
- [x] 1.5 Update `@layer base` prose styles (links, code blocks, blockquotes) for dark background readability
- [x] 1.6 Verify header, footer, and all shared layout elements render correctly with new theme

## 2. CSS Textures and Visual Effects

- [x] 2.1 Create `.bg-noise` utility class using SVG feTurbulence data URI for subtle film grain
- [x] 2.2 Create `.bg-parchment` utility class for warm texture on flavor text and blockquotes
- [x] 2.3 Create `.bg-dungeon` utility class for dark vignette gradient on hero sections
- [x] 2.4 Create `.card-glow-{rarity}` utility classes for rarity-specific box-shadow effects (Common grey, Uncommon green, Rare blue, Boss orange)
- [x] 2.5 Add gradient overlay utilities (`.bg-gradient-to-t from-surface`, etc.) for text readability on top of images

## 3. Game Asset Integration

- [x] 3.1 Add `steamAppId`, `heroImage`, and `colorScheme` fields to game metadata Zod schema in `content.config.ts`
- [x] 3.2 Update `slay-the-spire-2.yaml` with Steam App ID, cover/hero image URLs, and dark fantasy color scheme
- [x] 3.3 Create a `getGameAssets()` utility in `src/lib/game-assets.ts` that derives Steam CDN URLs from App ID with fallback behavior
- [x] 3.4 Update homepage game cards to display `coverImage` with lazy loading, fallback to solid card when missing
- [x] 3.5 Update game hub page (`[game]/index.astro`) with full-width hero banner section using `heroImage`, gradient overlay, and LCP-optimized loading
- [x] 3.6 Add image error handling fallback: when hero/cover image fails to load, show gradient placeholder

## 4. SVG Icon System

- [x] 4.1 Create `src/components/icons/CardTypeIcon.astro` with distinct SVG paths for Attack, Skill, Power, Status, Curse
- [x] 4.2 Create `src/components/icons/RarityIcon.astro` with SVG shapes and optional `withGlow` prop
- [x] 4.3 Create `src/components/icons/EnergyOrb.astro` with circular SVG, number overlay, and character color support
- [x] 4.4 Create `src/components/icons/MechanicIcon.astro` for common mechanic keywords (Strength, Block, Poison, etc.)
- [x] 4.5 Replace emoji on game hub reference section with SVG icon components
- [x] 4.6 Replace emoji in EntityCard badges and CardHeader with SVG icon components
- [x] 4.7 Replace ⚡ emoji in energy cost displays with `<EnergyOrb>` component

## 5. Card Visual Frame

- [x] 5.1 Create `src/components/reference/CardFrame.astro` component with energy orb, art placeholder area, name, type/rarity badges, and effect slot
- [x] 5.2 Define character gradient map (Ironclad=red, Silent=green, Defect=blue, Regent=gold, Necrobinder=purple, Colorless=grey)
- [x] 5.3 Add card type icon watermark to art placeholder area (centered, semi-transparent)
- [x] 5.4 Add responsive sizing so card frame works on mobile (320px+) through desktop
- [x] 5.5 Integrate `CardFrame` into card detail page route (`[game]/cards/[slug].astro`) wrapped in `ReferenceLayout`
- [x] 5.6 Verify relic, potion, mechanic, enemy detail pages remain visually unchanged (CardFrame is card-only)

## 6. Per-Game Theming

- [x] 6.1 Create a `GameThemeProvider.astro` component that applies CSS custom property overrides from game metadata `colorScheme`
- [x] 6.2 Wrap all game-specific pages with `GameThemeProvider`
- [x] 6.3 Verify that games without `colorScheme` render with global defaults and no broken styles

## 7. Verification and Polish

- [x] 7.1 Run production build and verify zero errors, no visual regressions
- [x] 7.2 Verify WCAG AA contrast ratios for all text/background pairs in dark theme
- [x] 7.3 Check CLS impact: verify all images have explicit dimensions and lazy loading where appropriate
- [ ] 7.4 Manual visual check: homepage, game hub, card listing, card detail, relic detail, potion listing, mechanics page
- [ ] 7.5 Verify mobile viewport (375px) — card frame scales, hero text readable, icons sized correctly
- [ ] 7.6 Verify ad slots remain correctly positioned and visible in dark theme
