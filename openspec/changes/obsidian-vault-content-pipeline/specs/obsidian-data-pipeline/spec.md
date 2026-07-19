## ADDED Requirements

### Requirement: Parse Obsidian vault YAML frontmatter

The conversion script SHALL parse markdown files from the Obsidian vault that use `key:: value` frontmatter syntax and extract all metadata fields into a structured JavaScript object.

#### Scenario: Parse card frontmatter
- **WHEN** the script processes a card file with frontmatter containing `name:: Demon Form`, `type:: "[[能力牌]]"`, `character:: "[[铁甲战士]]"`, `rarity:: "[[罕见]]"`, `energy_cost:: 3`
- **THEN** the output object has `name: "Demon Form"`, `type: "能力牌"`, `character: "铁甲战士"`, `rarity: "罕见"`, `energy_cost: 3`, with WikiLink brackets stripped

#### Scenario: Handle missing optional fields
- **WHEN** a card file has no `upgrade_description` field in frontmatter
- **THEN** the parser sets the field to `undefined` rather than throwing an error

### Requirement: Translate Chinese labels to English

The conversion script SHALL translate Chinese metadata labels (character names, card types, rarities, mechanic keywords) to their English equivalents using a built-in mapping dictionary.

#### Scenario: Translate character name
- **WHEN** frontmatter contains `character: "铁甲战士"`
- **THEN** the output has `character: "Ironclad"`

#### Scenario: Translate rarity
- **WHEN** frontmatter contains `rarity: "罕见"`
- **THEN** the output has `rarity: "Uncommon"`

#### Scenario: Translate card type
- **WHEN** frontmatter contains `type: "攻击牌"`
- **THEN** the output has `type: "Attack"`

#### Scenario: Unknown Chinese term
- **WHEN** the mapper encounters a Chinese term not in the dictionary
- **THEN** the script logs a warning with the unknown term and file path, and keeps the original value

### Requirement: Resolve WikiLinks to URL paths

The conversion script SHALL convert Obsidian WikiLinks (`[[Page Name]]`) in both frontmatter and body content into standard markdown links pointing to our site's URL structure.

#### Scenario: Resolve card WikiLink in frontmatter
- **WHEN** a card file has `character: "[[铁甲战士]]"` in frontmatter
- **THEN** the character field becomes `Ironclad` (from the translation map) and generates a link to `/games/slay-the-spire-2/characters/ironclad/`

#### Scenario: Resolve WikiLink in body text
- **WHEN** the body text contains "与[[恶魔形态]]配合效果极佳"
- **THEN** the output text contains a markdown link to `/games/slay-the-spire-2/cards/demon-form/` with display text "Demon Form"

### Requirement: Generate clean MDX output files

The conversion script SHALL write MDX files to `src/content/[type]/` directories with our standard frontmatter format (`key: value` YAML between `---` delimiters) and English body content.

#### Scenario: Generate card MDX
- **WHEN** the script processes a card file
- **THEN** it writes a file like `src/content/cards/demon-form.mdx` with `---` delimited frontmatter containing `name`, `slug`, `type`, `character`, `rarity`, `energy_cost`, `effect`, `game` fields, followed by the cleaned English body content and MDX components (CardTooltip, RelatedCards)

#### Scenario: Generate file with unique slug
- **WHEN** two cards have the same English name (e.g., two different "Strike" cards for different characters)
- **THEN** the script disambiguates by appending character suffix: `strike-ironclad`, `strike-silent`

### Requirement: Batch processing with progress reporting

The conversion script SHALL process all vault files in batches by type (cards, relics, potions, mechanics, enemies) and report progress with counts of successes, warnings, and errors.

#### Scenario: Process all cards
- **WHEN** the script runs with `--type cards`
- **THEN** it processes all card files in the vault's card directories, prints a progress count every 50 files, and reports "Processed X cards: Y success, Z warnings, W errors"

### Requirement: Dry-run mode

The conversion script SHALL support a `--dry-run` flag that validates and reports without writing any files.

#### Scenario: Dry run validation
- **WHEN** the script runs with `--dry-run`
- **THEN** it parses and translates all files, reports any errors or unknown terms, displays the total count, but writes nothing to disk

### Requirement: Incremental conversion

The conversion script SHALL support idempotent re-processing by checking if the output MDX file already exists and comparing modification timestamps with the source vault file.

#### Scenario: Skip unchanged files
- **WHEN** a card MDX file already exists and is newer than the source vault file
- **THEN** the script skips that file unless `--force` flag is provided
