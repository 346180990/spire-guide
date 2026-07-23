## ADDED Requirements

### Requirement: Game version metadata
The system SHALL support a `version` field and a `lastVersionCheck` field in game metadata YAML to track which version of the game the content is verified against.

#### Scenario: Version fields defined in game metadata
- **WHEN** `src/content/games/<slug>.yaml` contains `version: "Early Access 0.3.1"` and `lastVersionCheck: "2026-07-23"`
- **THEN** the system SHALL parse both fields and expose them for use in templates

#### Scenario: Missing version fields
- **WHEN** a game metadata file lacks `version` or `lastVersionCheck`
- **THEN** the build SHALL succeed with a warning, treating both as empty strings

### Requirement: Article game version tracking
Each guide article frontmatter SHALL support an optional `gameVersion` field indicating which game version the article content was last verified against.

#### Scenario: Article displays verified version
- **WHEN** a guide has `gameVersion: "Early Access 0.3.1"` in its frontmatter
- **THEN** the article page SHALL display that version alongside the publish/update dates

#### Scenario: Article without version
- **WHEN** a guide lacks the `gameVersion` field
- **THEN** the article SHALL render normally without a version badge (backward compatible)

### Requirement: Version-aware content staleness warning
When a game's `version` differs from an article's `gameVersion`, the system SHALL display a subtle notice that the article may not reflect the current game balance.

#### Scenario: Version mismatch detected
- **WHEN** game metadata `version` is `"Early Access 0.4.0"` and an article's `gameVersion` is `"Early Access 0.3.1"`
- **THEN** the article SHALL display a non-intrusive notice: "This guide was last verified against version 0.3.1. Game is now at 0.4.0 — some details may have changed."

#### Scenario: Versions match
- **WHEN** game version matches article version
- **THEN** no staleness notice SHALL be displayed
