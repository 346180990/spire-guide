## MODIFIED Requirements

### Requirement: Game metadata definition
The system SHALL support defining game metadata via a structured configuration file that includes the game's canonical slug, display name, description, cover image path, release date, active status, current version, and last version check date.

#### Scenario: Game metadata is loaded at build time
- **WHEN** a `metadata.yaml` file exists in a game's content directory
- **THEN** the system SHALL parse and expose all metadata fields — including `version` and `lastVersionCheck` — for use in page templates, navigation, and sitemaps

#### Scenario: Missing metadata file
- **WHEN** a game content directory exists but lacks a `metadata.yaml`
- **THEN** the build SHALL fail with a clear error message identifying the missing file

#### Scenario: Game metadata with version tracking
- **WHEN** a game's metadata includes `version: "Early Access 0.3.1"` and `lastVersionCheck: "2026-07-23"`
- **THEN** templates SHALL have access to both values for rendering version badges and staleness warnings
