## ADDED Requirements

### Requirement: SVG icon components for card types

The system SHALL provide SVG icon components for the five card types (Attack, Skill, Power, Status, Curse). Each icon SHALL be visually distinct and render as inline SVG that inherits `currentColor` for CSS styling.

#### Scenario: Attack card icon renders
- **WHEN** a `<CardTypeIcon type="Attack" />` component is used
- **THEN** an inline SVG icon representing an attack (e.g., crossed swords) is rendered, styled by the parent element's text color

#### Scenario: Power card icon renders
- **WHEN** a `<CardTypeIcon type="Power" />` component is used
- **THEN** an inline SVG icon representing a power/ability (e.g., star or burst) is rendered

#### Scenario: Unknown type falls back gracefully
- **WHEN** a `<CardTypeIcon type="Unknown" />` is used with an unrecognized type
- **THEN** a generic card icon or no icon is rendered without throwing an error

### Requirement: SVG icon components for rarities

The system SHALL provide SVG icon components for the six rarity tiers (Common, Uncommon, Rare, Boss, Starter, Special). Each icon SHALL support an optional `withGlow` prop that adds a CSS box-shadow glow in the rarity's color.

#### Scenario: Rare rarity icon with glow
- **WHEN** `<RarityIcon rarity="Rare" withGlow />` is rendered
- **THEN** the icon displays with a blue-colored glow effect

#### Scenario: Common rarity icon without glow
- **WHEN** `<RarityIcon rarity="Common" />` is rendered without `withGlow`
- **THEN** the icon displays in grey with no glow effect

### Requirement: Energy orb component

The system SHALL provide an `<EnergyOrb>` SVG component that displays a circular orb with a numeric or "X" cost overlay. The orb color SHALL correspond to the character's theme color.

#### Scenario: Numeric energy cost
- **WHEN** `<EnergyOrb cost={3} character="Ironclad" />` is rendered
- **THEN** a circular element displays the number "3" with Ironclad red coloring

#### Scenario: X-cost card
- **WHEN** `<EnergyOrb cost="X" />` is rendered
- **THEN** a circular element displays the letter "X" in the energy orb style

#### Scenario: Zero-cost card
- **WHEN** `<EnergyOrb cost={0} />` is rendered
- **THEN** a circular element displays "0", visually distinct from non-zero costs (e.g., dimmer or grey)

### Requirement: Emoji replacement across the site

All game entity references that currently use emoji (cards listing 🂠, relics 🏺, potions 🧪, mechanics 📖, enemies 👾, energy ⚡) SHALL be replaced with the corresponding SVG icon components.

#### Scenario: Game hub reference section uses SVG icons
- **WHEN** the game hub page renders the Reference Database section
- **THEN** each reference type (Cards, Relics, Potions, Mechanics, Enemies) displays an SVG icon instead of an emoji

#### Scenario: Card listing page uses type icons
- **WHEN** the card listing page renders individual entity cards
- **THEN** each card displays its type icon (Attack/Skill/Power/etc.) instead of text-only badges
