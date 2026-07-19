## ADDED Requirements

### Requirement: Auto-link card names in strategy guides

The system SHALL automatically detect card names mentioned in strategy guide MDX content and render them as hyperlinks to the corresponding card reference page.

#### Scenario: Card name in prose
- **WHEN** a strategy guide contains the text "Play Demon Form as early as possible"
- **THEN** "Demon Form" is rendered as `<a href="/games/slay-the-spire-2/cards/demon-form/">Demon Form</a>`

#### Scenario: Case-insensitive matching
- **WHEN** a guide contains "demon form" in lowercase
- **THEN** it is still linked to the Demon Form card page

#### Scenario: No false positives on common words
- **WHEN** a guide contains the word "Strike" as a verb ("Strike first") not referring to the card
- **THEN** the system should still link it (acceptable false positive rate; user can escape with backticks)

### Requirement: Auto-link relic names

The system SHALL automatically detect relic names mentioned in strategy guides and link them to relic reference pages.

#### Scenario: Relic name in strategy text
- **WHEN** a guide contains "Red Skull is essential for this build"
- **THEN** "Red Skull" is linked to `/games/slay-the-spire-2/relics/red-skull/`

### Requirement: Escape mechanism for auto-linking

Authors SHALL be able to prevent auto-linking by wrapping text in backticks (inline code), which the system treats as literal text.

#### Scenario: Escaped card name
- **WHEN** a guide contains `` `Demon Form` `` in backticks
- **THEN** the text is rendered as `<code>Demon Form</code>` without a link

### Requirement: Auto-link at build time via remark plugin

The auto-linking system SHALL operate as an Astro remark/rehype plugin that transforms the MDX AST during the build process, ensuring links are present in the static HTML output.

#### Scenario: Links present in production build
- **WHEN** the site is built with `astro build`
- **THEN** all card and relic names in the static HTML output are anchor tags pointing to reference pages

### Requirement: Link resolution using content collection data

The auto-link plugin SHALL resolve entity names against the content collections (cards, relics, potions) to confirm the target page exists, and generate correct URLs based on the entity slug.

#### Scenario: Link target exists
- **WHEN** a card name matches an entry in the cards collection with slug `demon-form`
- **THEN** the link href is `/games/slay-the-spire-2/cards/demon-form/`

#### Scenario: Link target does not exist
- **WHEN** text matches a pattern that looks like a card name but no corresponding collection entry exists
- **THEN** the text is left as plain text (no link created)
