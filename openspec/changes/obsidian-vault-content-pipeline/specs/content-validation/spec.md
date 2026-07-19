## ADDED Requirements

### Requirement: Zod schema validation for all reference collections

All reference content collections (cards, relics, potions, mechanics, enemies) SHALL define Zod schemas in `src/content.config.ts` that validate required fields and enum constraints at build time.

#### Scenario: Card schema requires name
- **WHEN** a card MDX file is missing the `name` field
- **THEN** Astro's content layer logs a validation error and the build fails

#### Scenario: Invalid rarity enum value
- **WHEN** a card has `rarity: "Mythical"` (not a valid STS2 rarity)
- **THEN** the build fails with a Zod validation error specifying the file and invalid value

#### Scenario: Valid file passes validation
- **WHEN** a card file has all required fields with valid enum values
- **THEN** it passes schema validation and the content is available to routes

### Requirement: Conversion script output validation

The conversion script SHALL validate each generated MDX file against the expected Zod schema (using the same schema definitions) before writing, and report validation errors.

#### Scenario: Conversion catches missing energy_cost
- **WHEN** the conversion script processes a card where the source frontmatter has no `energy_cost` field
- **THEN** the script reports a validation warning: "demon-form.mdx: missing required field 'energy_cost'" but still writes the file (allows manual fixes)

### Requirement: Duplicate slug detection

The conversion script SHALL detect when two source files would produce the same output slug and automatically disambiguate them.

#### Scenario: Duplicate slug detected
- **WHEN** two source files both map to slug `strike`
- **THEN** the script appends the character suffix to distinguish them (`strike-ironclad`, `strike-silent`) and logs a warning about the disambiguation

### Requirement: Cross-reference integrity check

The system SHALL validate at build time that all cross-references between content files point to existing pages (no broken links between reference pages or from strategy guides to reference pages).

#### Scenario: Broken reference link
- **WHEN** a strategy guide's frontmatter `relatedGuides` lists a slug that doesn't exist
- **THEN** a build warning is emitted but the build does not fail (soft validation)

#### Scenario: Card-to-character link integrity
- **WHEN** a card references `character: "Ironclad"`
- **THEN** the Ironclad character entry must exist in the games collection metadata
