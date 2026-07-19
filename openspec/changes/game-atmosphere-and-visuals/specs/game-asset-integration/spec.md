## ADDED Requirements

### Requirement: Steam App ID metadata field

The game metadata schema SHALL support an optional `steamAppId` string field. When present, the system SHALL derive Steam CDN image URLs from this ID.

#### Scenario: Game with Steam App ID
- **WHEN** a game YAML file includes `steamAppId: "2868840"`
- **THEN** the system generates the header image URL as `https://cdn.cloudflare.steamstatic.com/steam/apps/2868840/header.jpg`

#### Scenario: Game without Steam App ID
- **WHEN** a game YAML file does NOT include a `steamAppId` field
- **THEN** no Steam CDN images are referenced, and the system falls back to CSS-only hero sections

### Requirement: Cover image display on homepage game cards

The system SHALL display a game's cover image on the homepage game card when `coverImage` is configured. When `coverImage` is empty or missing, the system SHALL render the game card as a solid-background text card (current behavior).

#### Scenario: Game card with cover image
- **WHEN** Slay the Spire 2 has `coverImage` set to a valid URL
- **THEN** the homepage game card for Slay the Spire 2 displays the cover image above or behind the game name

#### Scenario: Game card without cover image falls back gracefully
- **WHEN** a game has no `coverImage` configured
- **THEN** the homepage game card renders as a solid dark-background card with text only

### Requirement: Hero banner on game hub pages

The system SHALL display a full-width hero banner image at the top of each game hub page (`/games/[game]/`) when `heroImage` is configured. The banner SHALL have a dark gradient overlay to ensure text readability.

#### Scenario: Game hub with hero image
- **WHEN** a visitor navigates to `/games/slay-the-spire-2/` and the game has `heroImage` configured
- **THEN** a full-width banner image displays at the top with the game name and description overlaid with readable contrast

#### Scenario: Hero image fails to load
- **WHEN** the `heroImage` URL returns an error or the image cannot be displayed
- **THEN** the hero section falls back to the solid dark background with text content intact

### Requirement: Image loading does not block page render

All externally-referenced game images SHALL use `loading="lazy"` and explicit `width`/`height` attributes to prevent Cumulative Layout Shift (CLS). Hero images SHALL use `fetchpriority="high"` and omit `loading="lazy"` to prioritize LCP.

#### Scenario: Lazy loading for below-fold images
- **WHEN** a game card with cover image is rendered below the fold on the homepage
- **THEN** the image uses `loading="lazy"` and does not block initial page render

#### Scenario: Hero image prioritizes LCP
- **WHEN** the hero banner on a game hub page is within the initial viewport
- **THEN** the image uses `fetchpriority="high"` and does NOT use `loading="lazy"`

### Requirement: Per-game color scheme customization

The game metadata schema SHALL support an optional `colorScheme` object with `primary`, `surface`, and `accent` color fields. When present, game-specific pages SHALL apply these colors as CSS custom property overrides.

#### Scenario: Game with custom color scheme
- **WHEN** Slay the Spire 2 has `colorScheme.primary: "#d4a843"` in its metadata
- **THEN** all pages under `/games/slay-the-spire-2/` use `#d4a843` as their primary accent color

#### Scenario: Game without custom color scheme uses defaults
- **WHEN** a game has no `colorScheme` configured
- **THEN** its pages use the global dark fantasy theme colors
