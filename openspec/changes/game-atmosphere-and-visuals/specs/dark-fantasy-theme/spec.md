## ADDED Requirements

### Requirement: Dark theme color palette

The system SHALL use a dark fantasy color palette as the default site theme, replacing the corporate blue/white scheme. The palette SHALL use warm off-white text (`#e8e6e3`), deep navy surfaces (`#1a1a2e`), and gold accents (`#d4a843`) as primary colors.

#### Scenario: All pages render with dark background
- **WHEN** any page on the site is loaded
- **THEN** the page background is a dark color (near-black or deep navy), NOT white

#### Scenario: Gold accent replaces blue for links and interactive elements
- **WHEN** a link or interactive element is rendered
- **THEN** it uses a warm gold/amber color, NOT corporate blue

### Requirement: Game-appropriate display typography

The system SHALL use a fantasy-style serif font (Cinzel) for primary headings (h1-h3) while keeping the Inter sans-serif font for body text. All text SHALL meet WCAG AA contrast minimums (4.5:1 for body, 3:1 for large text).

#### Scenario: Card name heading uses display font
- **WHEN** a card detail page like "Demon Form" is rendered
- **THEN** the card name heading is displayed in Cinzel or the configured display font, NOT Inter

#### Scenario: Body text uses readable sans-serif
- **WHEN** any article or reference page content is rendered
- **THEN** the body paragraph text uses Inter or system sans-serif font

#### Scenario: Font swap fallback prevents layout shift
- **WHEN** the Cinzel font file is still loading from Google Fonts
- **THEN** heading text renders immediately in the fallback serif font with `font-display: swap`, without blocking page render

### Requirement: CSS texture effects

The system SHALL provide CSS utility classes for background texture effects including noise/grain overlays, parchment texture, and dungeon vignette gradients. These SHALL use inline SVG data URIs with zero additional HTTP requests.

#### Scenario: Noise texture applied to hero section
- **WHEN** a hero section element has the `bg-noise` class
- **THEN** a subtle film grain overlay is visible on top of the background

#### Scenario: Parchment texture on flavor text
- **WHEN** a relic's flavor text or a blockquote has the `bg-parchment` class
- **THEN** a warm paper-like texture is visible behind the text

#### Scenario: Dungeon vignette on game hub header
- **WHEN** the game hub page header uses the `bg-dungeon` class
- **THEN** a dark gradient with vignette effect (darker edges, lighter center) is visible

### Requirement: Rarity glow color system

The system SHALL support color-coded visual indicators for game entity rarities with distinct colors and optional glow/box-shadow effects matching in-game rarity conventions.

#### Scenario: Rare card gets blue glow border
- **WHEN** a card or entity with rarity "Rare" is displayed in a card grid
- **THEN** its card border or glow effect uses blue coloring

#### Scenario: Common cards use grey with no glow
- **WHEN** a card with rarity "Common" is displayed
- **THEN** its indicator uses grey coloring with a subtle or no glow effect

#### Scenario: Boss relics get distinctive styling
- **WHEN** a relic with rarity "Boss" is displayed
- **THEN** its indicator uses a distinctive color (e.g., deep red/orange) that differentiates it from standard rarities

### Requirement: Dark theme accessibility

The system SHALL maintain WCAG AA compliance in dark theme: body text contrast ratio of at least 4.5:1 against its background, and large text (headings ≥18px bold) contrast ratio of at least 3:1.

#### Scenario: Body text meets contrast minimum
- **WHEN** a color contrast checker tests body text (`#e8e6e3`) against the surface background (`#1a1a2e`)
- **THEN** the contrast ratio is at least 4.5:1

#### Scenario: Ad slot areas remain visible
- **WHEN** an ad slot is placed within dark-themed content
- **THEN** the ad container has sufficient visual separation (border or subtle background difference) from surrounding content
