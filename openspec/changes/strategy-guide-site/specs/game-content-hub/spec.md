## ADDED Requirements

### Requirement: Game metadata definition
The system SHALL support defining game metadata via a structured configuration file that includes the game's canonical slug, display name, description, cover image path, release date, and active status.

#### Scenario: Game metadata is loaded at build time
- **WHEN** a `metadata.yaml` file exists in a game's content directory
- **THEN** the system SHALL parse and expose all metadata fields for use in page templates, navigation, and sitemaps

#### Scenario: Missing metadata file
- **WHEN** a game content directory exists but lacks a `metadata.yaml`
- **THEN** the build SHALL fail with a clear error message identifying the missing file

### Requirement: Game hub page
The system SHALL render a hub page for each game at `/games/<slug>/` that displays the game's metadata, a curated list of character/class summaries, and paginated links to all guides for that game.

#### Scenario: Game hub with guides
- **WHEN** a visitor navigates to `/games/slay-the-spire-2/`
- **THEN** the page SHALL display the game name, description, character summaries, and a list of all published guides for that game

#### Scenario: Game hub with no guides yet
- **WHEN** a game has metadata but zero published guides
- **THEN** the page SHALL display a "guides coming soon" placeholder instead of an empty list

### Requirement: Character/class summary on hub
The system SHALL display character summaries on the game hub page, including the character name, role description, and a link to character-specific guides.

#### Scenario: Character summaries rendered
- **WHEN** a game hub page loads
- **THEN** each character defined in the game's metadata SHALL render as a card with name, role, and a link to filtered guides

### Requirement: Guide content directory structure
The system SHALL organize guides within a game's content directory in a flat `guides/` subdirectory, with each guide as a self-contained `.mdx` file.

#### Scenario: Adding a new guide
- **WHEN** a new `.mdx` file is added to `src/content/games/<slug>/guides/`
- **THEN** the system SHALL automatically include it in the game's guide listing, sitemap, and RSS feed on next build

### Requirement: Active game filtering
The system SHALL only render pages and include in navigation for games whose metadata sets `active: true`.

#### Scenario: Inactive game hidden
- **WHEN** a game's `metadata.yaml` sets `active: false`
- **THEN** its hub page and guides SHALL be excluded from navigation, homepage, and sitemap while remaining accessible by direct URL
