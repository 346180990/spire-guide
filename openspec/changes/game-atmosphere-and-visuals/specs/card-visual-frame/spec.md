## ADDED Requirements

### Requirement: Card frame visual layout

The system SHALL provide a `<CardFrame>` Astro component that wraps card detail page content in a CSS-styled layout resembling an in-game card. The frame SHALL include: an energy cost orb (top-left), a card art placeholder area with character-themed gradient background, the card name in display font, type/rarity/character badges, and the effect text area.

#### Scenario: Card frame renders with character gradient
- **WHEN** `<CardFrame name="Demon Form" type="Power" rarity="Rare" character="Ironclad" cost={3}>` is rendered
- **THEN** the card art placeholder area displays a red-to-dark-orange gradient background corresponding to Ironclad

#### Scenario: Card frame with X-cost
- **WHEN** a card with `cost="X"` is rendered in the card frame
- **THEN** the energy orb displays "X"

#### Scenario: Card frame is responsive
- **WHEN** a card frame is viewed on a mobile device (viewport < 640px)
- **THEN** the frame scales down appropriately without horizontal overflow or clipped content

### Requirement: Character theme color mapping

The system SHALL define a mapping of character names to gradient color pairs for the card art placeholder area. The mapping SHALL cover Ironclad (red), Silent (green), Defect (blue), Regent (gold), Necrobinder (purple), and Colorless (grey).

#### Scenario: Silent character gradient
- **WHEN** a Silent card is rendered with the card frame
- **THEN** the art placeholder area displays a green-to-teal gradient

#### Scenario: Colorless card gradient
- **WHEN** a Colorless card (no specific character) is rendered
- **THEN** the art placeholder area displays a grey-to-slate gradient

#### Scenario: Unknown character falls back to default
- **WHEN** a card with a character name not in the mapping is rendered
- **THEN** the art placeholder uses a neutral dark gradient without error

### Requirement: Card type icon in art placeholder

The card frame's art placeholder area SHALL display the card type icon (Attack ⚔️ / Skill 🛡️ / Power ⭐ / Status 💀 / Curse 🔮) centered within the gradient area as a large watermark-style icon.

#### Scenario: Attack card shows crossed swords in art area
- **WHEN** an Attack card is rendered in the card frame
- **THEN** the art placeholder area displays a large Attack-type SVG icon centered in the gradient

#### Scenario: Status card art area is visually distinct
- **WHEN** a Status card is rendered
- **THEN** the art area uses a distinct visual treatment (dimmer gradient) to indicate it's not a playable card

### Requirement: Card frame does not break existing page layout

The `<CardFrame>` component SHALL integrate with the existing `ReferenceLayout` without breaking breadcrumbs, JSON-LD structured data, phase badges, or SEO metadata. The component SHALL be optional — reference pages without a card frame SHALL render identically to their current state.

#### Scenario: Card page with card frame maintains SEO
- **WHEN** a card page uses `<CardFrame>` wrapped in `<ReferenceLayout>`
- **THEN** the page still includes breadcrumb navigation, JSON-LD structured data, phase badge, and canonical URL

#### Scenario: Reference pages without card frame are unchanged
- **WHEN** a relic, potion, mechanic, or enemy page renders without `<CardFrame>`
- **THEN** the page layout is visually identical to the current implementation
