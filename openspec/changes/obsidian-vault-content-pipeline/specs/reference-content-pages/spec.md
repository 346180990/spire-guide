## ADDED Requirements

### Requirement: Card reference pages

The system SHALL render individual card reference pages at `/games/[game]/cards/[slug]/` with energy cost, card type, rarity, character association, effect description, and upgrade information displayed in a consistent layout.

#### Scenario: Card page renders all fields
- **WHEN** a visitor navigates to `/games/slay-the-spire-2/cards/demon-form/`
- **THEN** the page displays the card name "Demon Form", type "Power", rarity "Rare", character "Ironclad", energy cost 3, and effect description text

#### Scenario: Card page shows phase badge
- **WHEN** a card page is rendered
- **THEN** a phase badge ("Community Research") is displayed indicating the content verification status

#### Scenario: Card without upgrade info
- **WHEN** a card has no upgraded version defined in its frontmatter
- **THEN** the upgrade section is hidden rather than showing empty content

### Requirement: Relic reference pages

The system SHALL render individual relic reference pages at `/games/[game]/relics/[slug]/` with rarity, character association (if any), effect description, and flavor text.

#### Scenario: Relic page renders with character badge
- **WHEN** a visitor navigates to a character-specific relic like "Red Skull" (Ironclad relic)
- **THEN** the page displays the Ironclad character badge linking to the Ironclad character page

#### Scenario: Common relic with no character
- **WHEN** a relic has no character restriction (common/shared relic)
- **THEN** the character badge is hidden and the relic is labeled as "Universal"

### Requirement: Potion reference pages

The system SHALL render individual potion reference pages at `/games/[game]/potions/[slug]/` with potion effect, rarity, and usage guidance.

#### Scenario: Potion page renders effect
- **WHEN** a visitor navigates to a potion page
- **THEN** the potion name, rarity, and effect description are displayed

### Requirement: Mechanic glossary pages

The system SHALL render individual mechanic/glossary pages at `/games/[game]/mechanics/[slug]/` explaining game keywords like Strength, Poison, Exhaust, and Vulnerable.

#### Scenario: Mechanic page with related cards
- **WHEN** a visitor views a mechanic page like "Strength"
- **THEN** the page lists cards that interact with the Strength mechanic, with links to their card reference pages

### Requirement: Enemy reference pages

The system SHALL render individual enemy pages at `/games/[game]/enemies/[slug]/` with HP, moveset, and strategy tips.

#### Scenario: Enemy page with encounter info
- **WHEN** a visitor views an enemy page
- **THEN** the page displays enemy name, HP range, act location, moveset, and any special abilities

### Requirement: Reference page SEO metadata

All reference pages SHALL include unique SEO title, meta description, Open Graph tags, canonical URL, and JSON-LD structured data appropriate to the entity type.

#### Scenario: Card page SEO metadata
- **WHEN** a card page like "Demon Form" is rendered
- **THEN** the `<title>` tag is "Demon Form — Ironclad Rare Power Card | BuildSaga" and the meta description summarizes the card's effect

#### Scenario: JSON-LD for card pages
- **WHEN** a card page is rendered
- **THEN** JSON-LD structured data of type `VideoGame` (for game reference) is included in the `<head>`

### Requirement: Reference collection listing pages

The system SHALL render listing pages at `/games/[game]/cards/`, `/games/[game]/relics/`, `/games/[game]/potions/` that display all entities of that type with filtering by character, rarity, and energy cost.

#### Scenario: Card listing filtered by character
- **WHEN** a visitor navigates to `/games/slay-the-spire-2/cards/` and selects "Ironclad" filter
- **THEN** only cards belonging to Ironclad are displayed

#### Scenario: Relic listing with rarity filter
- **WHEN** a visitor views the relics listing page
- **THEN** they can filter relics by rarity (Common, Uncommon, Rare, Boss, Starter)

### Requirement: Cross-reference breadcrumbs

All reference pages SHALL include breadcrumb navigation showing the hierarchy: Home > Game > [Entity Type] > [Entity Name].

#### Scenario: Breadcrumb on a card page
- **WHEN** a visitor is on a card page
- **THEN** breadcrumbs show "Home > Slay the Spire 2 > Cards > Demon Form" with each segment linked except the current page
