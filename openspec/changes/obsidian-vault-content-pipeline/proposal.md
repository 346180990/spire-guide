## Why

The initial `strategy-guide-site` change gave us the site architecture and 4 sample articles, but building 30-50 deep strategy articles entirely from scratch via AI prompts is slow and leaves massive SEO gaps. We discovered the `mutjan/slay-the-spire-2-obsidian-vault` GitHub repo — a community-maintained structured data source with ~800 markdown files covering every card (480+), relic (250+), potion (63), character (6), mechanic (44), and enemy (9) in Slay the Spire 2. This is a content goldmine. By building a conversion pipeline to transform this Chinese Obsidian-format data into our English MDX reference pages, we can go from 4 articles to 800+ structured, interlinked, SEO-ready pages in days — each one targeting specific search queries like "Demon Form STS2", "Ice Cream relic Slay the Spire 2", or "Ironclad card list". The reference database also feeds the AI strategy article pipeline with verified game data.

## What Changes

- **New content collections**: Add `cards`, `relics`, `potions`, `mechanics`, and `enemies` collections to `src/content.config.ts` with Zod schemas matching the source data structure
- **New dynamic routes**: Card pages (`/games/[game]/cards/[slug]/`), relic pages, potion pages, mechanic pages, enemy pages — each with SEO metadata, JSON-LD, breadcrumbs
- **Conversion script**: Node.js script that clones/pulls the Obsidian vault, parses YAML frontmatter with `::` separators, translates Chinese labels to English (character names, rarities, card types, mechanic keywords), resolves WikiLinks to our URL patterns, and generates clean MDX files under `src/content/`
- **Auto-linking system**: An Astro component or remark plugin that detects card/relic/potion names in strategy guides and automatically links them to reference pages
- **Reference page templates**: Layouts for card pages (energy cost, type, rarity, character, effect description, upgrade info), relic pages (rarity, character, effect, flavor text), potion pages, and mechanic glossary pages
- **Content validation layer**: Schema validation for all generated files to ensure data integrity before build

## Capabilities

### New Capabilities

- `reference-content-pages`: Structured reference pages for game entities (cards, relics, potions, mechanics, enemies) with consistent layouts, SEO metadata, and cross-linking. Each entity type has its own content collection and URL namespace under `/games/[game]/[type]/[slug]/`.
- `obsidian-data-pipeline`: Automated pipeline to ingest Obsidian vault markdown files, parse the non-standard YAML frontmatter format (`key:: value` with WikiLinks), translate Chinese metadata into English, and output clean MDX files matching our content schemas. Includes a character/rarity/type mapping dictionary for the translation layer.
- `auto-link-system`: Build-time content linking that detects game entity names in strategy guide text and automatically wraps them in anchor tags pointing to the corresponding reference pages. Works at the Astro/MDX compilation level so links are in the static HTML output.
- `content-validation`: Schema-based validation run at build time that checks all generated reference content for required fields, valid enums (rarities, character names, card types), and broken cross-references.

### Modified Capabilities

- `game-content-hub` (from strategy-guide-site): Game hub pages must now list reference sections (Cards, Relics, Potions) alongside strategy guides. Character pages need card/relic counts and links to filtered card lists.

## Impact

- **Codebase**: New files in `src/content/cards/`, `src/content/relics/`, `src/content/potions/`, `src/content/mechanics/`, `src/content/enemies/` (800+ generated MDX files); new `scripts/` directory for conversion pipeline; updated `src/content.config.ts` with 5 new collections; new route files under `src/pages/games/[game]/cards/`, `relics/`, `potions/`, `mechanics/`, `enemies/`; new `src/components/` for reference page layouts
- **Dependencies**: No new npm dependencies expected — the conversion script uses Node.js built-ins (`fs`, `path`, `yaml` parsing via regex since the format is simple). May add `glob` for file discovery in the script.
- **Content**: 800+ new reference pages, each with unique SEO title ("Demon Form — Ironclad Rare Power Card | STS2"), meta description, JSON-LD, and cross-links to related entities
- **Build performance**: 800+ pages will increase build time; should benchmark and consider incremental builds or content layer caching via Astro's built-in content cache
- **Existing features**: No breaking changes. Existing strategy guide pages continue working; they gain auto-links to reference pages once the auto-link system is active.
