## ADDED Requirements

### Requirement: One guide per archetype
For every archetype defined in a character dashboard YAML file (`src/content/characters/<character>.yaml`), the system SHALL have a corresponding deep-guide MDX article in `src/content/guides/` with a matching slug convention.

#### Scenario: Archetype has corresponding guide
- **WHEN** `ironclad.yaml` defines an archetype `Entrench Block`
- **THEN** a guide file SHALL exist at `src/content/guides/ironclad-entrench-block.mdx` (or equivalent) whose `character` frontmatter matches the Ironclad slug and whose content matches the archetype's key cards and description

#### Scenario: Audit verifies completeness
- **WHEN** a manual or scripted audit compares character YAML archetypes against guide files
- **THEN** the count of archetypes without guides SHALL be zero

### Requirement: Guide frontmatter completeness
Every build guide SHALL include all required frontmatter fields: `title`, `description`, `publishDate`, `phase`, `guideType`, `character`, `game`, `gameVersion`, and optionally `updatedDate`, `difficulty`, `featuredImage`, `headerCards`, `headerRelics`, and `relatedGuides`.

#### Scenario: Valid guide frontmatter
- **WHEN** a new guide is created
- **THEN** all required frontmatter fields SHALL be present and pass Astro content collection validation

### Requirement: Dashboard to guide cross-linking
Character dashboard archetype cards (`<BuildCard>`) SHALL link to their corresponding guide article when one exists.

#### Scenario: Archetype card links to guide
- **WHEN** a character dashboard displays an archetype with `name: "Corruption Exhaust Engine"`
- **THEN** the archetype card SHALL render as an anchor link to `/games/slay-the-spire-2/guides/ironclad-exhaust-build/` (the matching guide slug)

### Requirement: Guide back-links to dashboard
Every build guide SHALL include a link back to its character dashboard in either the breadcrumbs or related guides section.

#### Scenario: Guide breadcrumb includes character link
- **WHEN** a user reads the guide at `/games/slay-the-spire-2/guides/defect-orb-focus-build/`
- **THEN** the breadcrumb navigation SHALL include a link to `/games/slay-the-spire-2/characters/defect/`

### Requirement: Content phase and quality standards
Every new build guide SHALL follow the established content pipeline: AI draft → human review with the standard review checklist → publish with `phase: research` or `phase: verified` as appropriate.

#### Scenario: Guide enters research phase
- **WHEN** a new guide is first published
- **THEN** its phase SHALL be set to `research` with the Community Research notice displayed on the article page

#### Scenario: Guide reaches verified phase
- **WHEN** a guide has been play-tested and fact-checked by a human editor
- **THEN** its phase SHALL be updated to `verified` and the Community Research notice SHALL be replaced with a "Player Verified" badge
