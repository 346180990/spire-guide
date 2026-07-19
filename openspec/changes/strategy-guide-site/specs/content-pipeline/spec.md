## ADDED Requirements

### Requirement: AI content generation prompt template
The system SHALL provide a standardized prompt template for generating article drafts, parameterized by game name, character/class, guide type, and known game data (card stats, relic effects from community sources).

#### Scenario: Prompt generates build guide draft
- **WHEN** the prompt template is invoked for "Slay the Spire 2", character "Ironclad", build type "Strength/Demon Form"
- **THEN** the generated output SHALL produce a structured MDX draft with frontmatter, sections for build overview, core cards, relics, strategy, and early/mid/late game priorities

#### Scenario: Prompt includes verified data
- **WHEN** known game data (card names, damage values, relic descriptions) is passed as context
- **THEN** the generated draft SHALL use those exact values rather than hallucinated numbers

### Requirement: Human review checklist
Every article SHALL pass a documented review checklist before publication. The checklist covers: factual accuracy, AI-voice removal, personal hook injection, structural readability, and SEO metadata verification.

#### Scenario: Article passes review
- **WHEN** a human reviewer verifies all checklist items for an article
- **THEN** the article frontmatter SHALL be updated with `reviewed: true` and `reviewedDate` before it is merged for deployment

#### Scenario: Article with unverified claims
- **WHEN** an article contains a claim the reviewer cannot verify (e.g., a card interaction not tested)
- **THEN** that claim SHALL be tagged with a `[Needs Verification]` marker or removed before publication

### Requirement: Anti-AI-voice guidelines
The content pipeline SHALL include a documented list of banned phrases and patterns that signal AI-generated text, and the review process SHALL enforce their removal or replacement.

#### Scenario: AI-voice phrases detected during review
- **WHEN** a draft contains phrases like "delve into", "in the world of", "it is important to note", "ultimately"
- **THEN** the review checklist SHALL flag these as requiring replacement with natural alternatives

### Requirement: Content phase lifecycle
Articles SHALL progress through defined phases: `research` (compiled from community sources, AI-drafted) → `verified` (played and fact-checked by the author) → `authoritative` (includes original testing data and unique insights).

#### Scenario: Article phase upgrade
- **WHEN** an author plays the game, verifies a previously research-phase article's claims, and adds personal gameplay insights
- **THEN** the article frontmatter SHALL be updated to `phase: verified` with a new `updatedDate`

### Requirement: Content source attribution
Articles in the research phase SHALL include a "Sources" section listing community resources used (subreddits, wikis, YouTube channels, Steam guides) to provide reader transparency and EEAT signals.

#### Scenario: Research article with sources
- **WHEN** an article at `phase: research` is rendered
- **THEN** it SHALL display a "Based on community research" notice with links to source materials used for compilation
