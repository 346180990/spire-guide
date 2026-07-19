## ADDED Requirements

### Requirement: Article frontmatter schema
Each guide article SHALL include required frontmatter fields: title, description (for SEO meta), publishDate, updatedDate, game slug, and optional fields for character/class association, guide type (build/tier-list/beginner/advanced), and content phase (research/verified/authoritative).

#### Scenario: Valid article frontmatter
- **WHEN** an article `.mdx` file includes all required frontmatter fields
- **THEN** the article SHALL render with correct metadata, breadcrumbs, and structured data

#### Scenario: Missing required frontmatter
- **WHEN** an article lacks a required frontmatter field
- **THEN** the build SHALL fail with an error identifying the missing field and file

### Requirement: Build card component
The system SHALL provide a `<BuildCard>` MDX component that renders a formatted build summary including: build name, character/class, difficulty rating, core cards list, key relics list, and a strategy summary.

#### Scenario: Build card renders all fields
- **WHEN** a `<BuildCard>` is used in an article with all props provided
- **THEN** it SHALL display the build name, character name, difficulty badge, card list with names, relic list with names, and strategy paragraph in a styled card

#### Scenario: Build card with missing optional fields
- **WHEN** a `<BuildCard>` omits the relics or difficulty props
- **THEN** those sections SHALL be hidden rather than displaying empty or placeholder content

### Requirement: Tier list component
The system SHALL provide a `<TierList>` MDX component that renders a ranked list of items grouped into tiers (S/A/B/C/D), with each entry supporting a name, description, and optional icon reference.

#### Scenario: Tier list with multiple tiers
- **WHEN** a `<TierList>` is used with items in S, A, B, and C tiers
- **THEN** it SHALL render each tier as a labeled section with items sorted within their tier, using distinct visual styles per tier level

### Requirement: Stat comparison table
The system SHALL provide a `<StatTable>` MDX component that renders a responsive comparison table with sortable columns, suitable for comparing card stats, relic effects, or character attributes.

#### Scenario: Stat table with sortable columns
- **WHEN** a `<StatTable>` renders with numeric columns
- **THEN** users SHALL be able to click column headers to sort ascending/descending

#### Scenario: Stat table on mobile
- **WHEN** a `<StatTable>` renders on a viewport under 640px
- **THEN** the table SHALL scroll horizontally with sticky row headers rather than breaking layout

### Requirement: Article cross-referencing
The system SHALL support linking between related guides through a `relatedGuides` frontmatter field that auto-generates "Related Guides" sections at the article footer.

#### Scenario: Related guides section
- **WHEN** an article has `relatedGuides` frontmatter referencing two other guide slugs
- **THEN** the article footer SHALL render links to those guides with their titles automatically resolved

### Requirement: Content phase badge
Each article SHALL display a content phase indicator based on its frontmatter: "Community Research" for research phase, "Player Verified" for verified phase, "Authoritative" for authoritative phase.

#### Scenario: Phase badge on research article
- **WHEN** an article has `phase: research` in frontmatter
- **THEN** a "Community Research" badge SHALL appear near the article title with appropriate styling indicating the content confidence level
