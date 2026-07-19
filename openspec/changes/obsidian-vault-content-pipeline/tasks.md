## 1. Setup & Source Data

- [x] 1.1 Clone `mutjan/slay-the-spire-2-obsidian-vault` to `./vault-source/` (gitignored)
- [x] 1.2 Create directory structure: `src/content/cards/`, `src/content/relics/`, `src/content/potions/`, `src/content/mechanics/`, `src/content/enemies/`
- [x] 1.3 Create `scripts/` directory with `convert-vault.mjs` stub
- [x] 1.4 Add `vault-source/` to `.gitignore`

## 2. Translation Dictionary & Mapping

- [x] 2.1 Create `scripts/mappings.mjs` with CHARACTER_MAP, RARITY_MAP, TYPE_MAP, MECHANIC_KEYWORD_MAP dictionaries
- [x] 2.2 Add card-type-specific character name variations (死灵契约师/死灵法师 both → Necrobinder)
- [x] 2.3 Add slug-generation utility (Chinese/English name → lowercase-kebab-case)
- [x] 2.4 Create WikiLink resolution map: Chinese page names → English slugs (e.g., `恶魔形态` → `demon-form`)

## 3. Obsidian Vault Parser

- [x] 3.1 Implement `parseObsidianFrontmatter()` — regex-based parser for `key:: value` format with WikiLink stripping
- [x] 3.2 Implement `extractBodyContent()` — strip YAML frontmatter, return body text with WikiLinks resolved
- [x] 3.3 Implement `resolveWikiLinks()` — convert `[[Page Name]]` and `[[display|actual]]` to markdown links or plain text
- [x] 3.4 Implement `detectEntityType()` — classify file by source directory (02-卡牌→card, 03-遗物→relic, etc.)

## 4. Conversion Script

- [x] 4.1 Implement `convertCards()` — read all card files from vault, translate metadata, generate MDX with CardReference component
- [x] 4.2 Implement `convertRelics()` — read all relic files, translate metadata, generate MDX with RelicReference component
- [x] 4.3 Implement `convertPotions()` — read all potion files, translate metadata, generate MDX
- [x] 4.4 Implement `convertMechanics()` — read all mechanic files, translate metadata, generate MDX
- [x] 4.5 Implement `convertEnemies()` — read all enemy files, translate metadata, generate MDX
- [x] 4.6 Add `--dry-run` flag — validate and report without writing files
- [x] 4.7 Add `--force` flag — overwrite existing MDX files even if newer than source
- [x] 4.8 Add `--type <entity-type>` flag — process only one entity type
- [x] 4.9 Add progress reporting — per-file count, warnings for unknown terms, summary at end
- [x] 4.10 Add duplicate slug detection with auto-suffix (`strike` → `strike-ironclad`, `strike-silent`)
- [x] 4.11 Add output validation — validate generated MDX against Zod schemas before writing

## 5. Content Collections & Schemas

- [x] 5.1 Add `cardSchema`, `relicSchema`, `potionSchema`, `mechanicSchema`, `enemySchema` Zod schemas to `src/content.config.ts`
- [x] 5.2 Add `cards`, `relics`, `potions`, `mechanics`, `enemies` collections with `glob()` loaders to `src/content.config.ts`
- [x] 5.3 Verify TypeScript type generation works (`astro sync` or `astro dev` for type check)
- [x] 5.4 Run conversion script to generate initial set of MDX files (start with cards for one character)

## 6. Reference Page Layouts & Components

- [x] 6.1 Create `src/layouts/ReferenceLayout.astro` — base layout for all reference pages (breadcrumbs, phase badge, SEO metadata, JSON-LD)
- [x] 6.2 Create `src/components/reference/CardHeader.astro` — card name, energy cost badge, type badge, rarity badge, character badge
- [ ] 6.3 Create `src/components/reference/CardEffect.astro` — effect description with upgrade comparison (before/after)
- [ ] 6.4 Create `src/components/reference/RelicDisplay.astro` — relic rarity, character restriction, effect, flavor text
- [ ] 6.5 Create `src/components/reference/PotionDisplay.astro` — potion rarity, effect
- [ ] 6.6 Create `src/components/reference/MechanicDisplay.astro` — description, related cards, related relics
- [ ] 6.7 Create `src/components/reference/EnemyDisplay.astro` — HP range, act, elite/boss badge, moveset table
- [ ] 6.8 Create `src/components/reference/EntityBadge.astro` — reusable badge for type/rarity/character/energy tags
- [ ] 6.9 Create `src/components/reference/RelatedEntities.astro` — "Related Cards" / "Related Relics" link lists

## 7. Reference Page Routes

- [ ] 7.1 Create `src/pages/games/[game]/cards/[slug].astro` — card detail page using `getStaticPaths` + `render()`
- [ ] 7.2 Create `src/pages/games/[game]/relics/[slug].astro` — relic detail page
- [ ] 7.3 Create `src/pages/games/[game]/potions/[slug].astro` — potion detail page
- [ ] 7.4 Create `src/pages/games/[game]/mechanics/[slug].astro` — mechanic glossary page
- [ ] 7.5 Create `src/pages/games/[game]/enemies/[slug].astro` — enemy bestiary page
- [ ] 7.6 Verify all routes generate correct static paths and render without errors (`astro build`)

## 8. Listing Pages with Filtering

- [ ] 8.1 Create `src/pages/games/[game]/cards/index.astro` — card listing with client-side filters (character dropdown, type, rarity, energy cost)
- [ ] 8.2 Create `src/pages/games/[game]/relics/index.astro` — relic listing with filters (rarity, character)
- [ ] 8.3 Create `src/pages/games/[game]/potions/index.astro` — potion listing with rarity filter
- [ ] 8.4 Create `src/pages/games/[game]/mechanics/index.astro` — mechanic glossary index
- [ ] 8.5 Create `src/pages/games/[game]/enemies/index.astro` — enemy bestiary index with act/type filters
- [ ] 8.6 Create `src/components/reference/FilterBar.astro` — reusable client-side filter bar component (dropdown selects, clear button)
- [ ] 8.7 Create `src/components/reference/EntityCard.astro` — compact card for listing pages (name, type badge, rarity, short effect preview)

## 9. Auto-Link System (Remark Plugin)

- [ ] 9.1 Create `src/plugins/remark-auto-link.mjs` — remark plugin skeleton with Astro integration
- [ ] 9.2 Implement entity name index builder — loads all card/relic/potion names from collections at build time into a lookup map
- [ ] 9.3 Implement text-node scanning — traverse MDAST tree, match entity names in text nodes
- [ ] 9.4 Implement link transformation — replace matched text with MDAST link nodes pointing to reference URLs
- [ ] 9.5 Implement backtick escape — skip content inside inline code (`<code>` nodes)
- [ ] 9.6 Add case-insensitive matching for entity names
- [ ] 9.7 Register plugin in `astro.config.mjs` MDX configuration
- [ ] 9.8 Test auto-linking in existing strategy guides — verify "Demon Form", "Red Skull", "Reaper" are linked in article body

## 10. Game Hub & Character Page Updates

- [ ] 10.1 Update `src/pages/games/[game]/index.astro` — add "Reference Database" section with cards/relics/potions link cards + entity counts
- [ ] 10.2 Update `src/pages/games/[game]/characters/[character].astro` — add character-specific card list, relic list, and stats (card count, etc.)
- [ ] 10.3 Update `src/components/Navigation.astro` — add reference section links under each game (Cards, Relics, Potions)

## 11. Schema Validation & Integrity

- [ ] 11.1 Add `npm run validate-content` script that runs conversion in dry-run mode and reports errors
- [ ] 11.2 Implement cross-reference integrity check — scan all reference pages for broken internal links
- [ ] 11.3 Add build-time warning for strategy guides referencing non-existent guides in `relatedGuides`
- [ ] 11.4 Verify all generated MDX files pass Zod schema validation in `astro build`

## 12. Build & Performance

- [ ] 12.1 Run `astro build` with full 800+ page content set and measure build time
- [ ] 12.2 Verify all 800+ pages are in the sitemap and have unique canonical URLs
- [ ] 12.3 Verify no broken internal links in build output (use `astro build` warnings or a link checker)
- [ ] 12.4 Check bundle size — ensure reference pages have minimal client JS (only filter bar on listing pages)
- [ ] 12.5 Run Lighthouse on a card page, relic page, and listing page — verify 90+ on SEO and Performance

## 13. Final Polish

- [ ] 13.1 Verify all phase badges show "Community Research" for auto-generated content
- [ ] 13.2 Verify breadcrumbs are correct on all reference page types
- [ ] 13.3 Add ad slots to listing pages (sidebar or between entities)
- [ ] 13.4 Update sitemap generation to include all new routes
- [ ] 13.5 Final `astro build` with zero errors and zero warnings
