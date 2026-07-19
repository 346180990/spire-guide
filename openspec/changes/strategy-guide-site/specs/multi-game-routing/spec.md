## ADDED Requirements

### Requirement: Game-scoped URL structure
All game-specific pages SHALL be scoped under `/games/<game-slug>/`, where `<game-slug>` is derived from the game's content directory name.

#### Scenario: Game-scoped guide URL
- **WHEN** a guide exists at `src/content/games/slay-the-spire-2/guides/ironclad-build.mdx`
- **THEN** it SHALL be accessible at `/games/slay-the-spire-2/guides/ironclad-build/`

#### Scenario: Adding a new game creates routes automatically
- **WHEN** a new directory `src/content/games/starrupture/` is created with `metadata.yaml` and at least one guide
- **THEN** all routes under `/games/starrupture/` SHALL work on the next build without any changes to route definitions or navigation components

### Requirement: Homepage game discovery
The homepage SHALL list all active games ordered by most recently updated guide date, with each game displaying its name, cover image, total guide count, and a link to its hub page.

#### Scenario: Homepage with multiple games
- **WHEN** the site has 3 active games with varying guide counts
- **THEN** the homepage SHALL display all 3 games sorted by recency, with correct guide counts

#### Scenario: Homepage with single game
- **WHEN** the site has only 1 active game
- **THEN** the homepage SHALL prominently feature that game without making the single-game state look like an incomplete site

### Requirement: Navigation auto-generation
The site's global navigation SHALL auto-populate with active games from the content directory, requiring no manual navigation configuration when games are added or removed.

#### Scenario: Navigation updates with new game
- **WHEN** a new active game is added to the content directory
- **THEN** its name and hub link SHALL appear in the global navigation on next build

### Requirement: Cross-game content isolation
Guides, characters, and metadata for one game SHALL NOT leak into another game's pages, listings, or search results.

#### Scenario: Game-specific guide listing
- **WHEN** a visitor is on `/games/slay-the-spire-2/guides/`
- **THEN** only guides belonging to Slay the Spire 2 SHALL be listed, even if other games share similar guide titles or character names

### Requirement: Game slug uniqueness
The system SHALL enforce unique game slugs at the content directory level, with the build failing if two game directories resolve to the same URL slug.

#### Scenario: Duplicate slug detection
- **WHEN** two game directories would produce the same URL slug (e.g., `slay-the-spire-2` and `Slay-the-Spire-2`)
- **THEN** the build SHALL fail with an error identifying the conflicting directories

### Requirement: Character-filtered guide views
Each game SHALL support character/class-filtered guide views at `/games/<slug>/characters/<character-slug>/` that list only guides associated with that character.

#### Scenario: Character-filtered guide listing
- **WHEN** a visitor navigates to `/games/slay-the-spire-2/characters/ironclad/`
- **THEN** only guides whose frontmatter specifies `character: ironclad` SHALL be listed
