## Context

We have a working Astro 7 site (`strategy-guide-site`) with 2 content collections (games, guides) and 4 sample articles. To scale from 4 articles to 800+ pages, we need to ingest structured game data from the `mutjan/slay-the-spire-2-obsidian-vault` GitHub repository. This community-maintained Obsidian vault contains ~800 markdown files covering all STS2 game entities in a non-standard format: YAML frontmatter uses `::` separators instead of `key: value`, metadata labels are in Chinese, and cross-references use WikiLinks (`[[...]]`).

The pipeline must: clone/read the vault → parse the non-standard format → translate Chinese metadata → generate clean English MDX files → validate against Zod schemas → feed into Astro's content layer → render 800+ SEO-optimized HTML pages.

Constraints:
- Zero new npm dependencies for the conversion script (Node.js built-ins only)
- Must be idempotent (safe to re-run)
- Build must not break if some vault files are missing optional fields
- The 4 existing strategy guide articles must continue working without changes

## Goals / Non-Goals

**Goals:**
- Convert all ~480 cards, ~250 relics, ~63 potions, ~44 mechanics, and 9 enemies from the Obsidian vault into our MDX format
- Provide listing pages with client-side filtering for each entity type
- Provide individual reference pages with SEO metadata for every entity
- Enable auto-linking from strategy guides to reference pages
- Validate all generated content at build time
- Keep the pipeline reproducible — anyone can clone the vault and regenerate content

**Non-Goals:**
- Real-time sync with vault updates (manual re-run is sufficient)
- Translating Chinese strategy guide content (only metadata labels are translated; body content is already in English)
- Editing vault content (we consume, we don't contribute back)
- Supporting other Obsidian vault features (dataview queries, embedded notes, canvas files) — these are skipped
- Image/assets from the vault (no images in the source vault)

## Decisions

### Decision 1: Conversion script as standalone Node.js script (not Astro integration)

**Chosen**: A single `scripts/convert-vault.mjs` script using Node.js built-ins (`fs`, `path`, `url`).

**Rationale**: The conversion is a one-time (or infrequent) operation, not something that runs on every build. Keeping it separate from Astro's build pipeline means:
- Faster builds (no vault processing during `astro build`)
- Easier debugging (run the script independently)
- Clear separation of concerns (data ingestion vs. site rendering)

**Alternative considered**: Astro content loader plugin that reads vault files directly. Rejected because it would couple build performance to vault file count, make incremental builds harder, and complicate caching.

### Decision 2: Flat file structure with game field for scoping

**Chosen**: All reference content files live in flat directories (`src/content/cards/*.mdx`, `src/content/relics/*.mdx`, etc.) with a `game` field in frontmatter.

**Rationale**: This matches the existing guide collection pattern (flat `src/content/guides/` with `game` field). Astro's `getCollection('cards', ({ data }) => data.game === 'slay-the-spire-2')` provides efficient filtering. Adding a new game later means adding files with `game: new-game-slug` — no directory restructuring needed.

**Alternative considered**: Nested directories (`src/content/cards/slay-the-spire-2/*.mdx`). Rejected because it creates the same double-slug URL issue we already fixed for guides.

### Decision 3: Hardcoded Chinese→English translation dictionary

**Chosen**: A static mapping object in the conversion script covering all known Chinese terms (~50 entries: 6 characters, 5 rarities, 3 card types, 6 character role labels, ~30 mechanic keywords).

**Rationale**: The dataset is bounded and finite. A mapping dictionary is:
- Deterministic (same input always produces same output)
- Zero dependencies (no LLM API costs or rate limits)
- Instant (no network calls)
- Easy to audit and correct

The script logs warnings for unknown Chinese terms so we can extend the dictionary iteratively.

**Alternative considered**: AI/LLM translation. Rejected for cost, latency, non-determinism, and overkill for ~50 bounded terms.

### Decision 4: Remark plugin for auto-linking (not runtime JS)

**Chosen**: An Astro remark plugin (`remark-auto-link.mjs`) that transforms the MDX AST at build time, replacing card/relic/potion name strings with link nodes.

**Rationale**: Build-time linking means links are static HTML — no client JS, no hydration cost, fully crawlable by search engines. The remark plugin has access to the content collections at build time (via Astro's `getCollection`), so it can verify link targets exist.

**Alternative considered**: Client-side JS that scans the DOM and wraps text. Rejected because it adds JS weight, delays link rendering (CLS risk), and search engines might not see the links.

### Decision 5: Zod schemas with lenient validation for optional fields

**Chosen**: Most fields are `z.string().optional()` or have `.default()` values. Only `name`, `slug`, `game`, and `type` are required. Invalid enum values log warnings but don't fail the build.

**Rationale**: The source data is community-maintained and may have gaps. Being too strict would block the build for minor data issues. We want to surface problems (warnings) without preventing the site from deploying.

**Alternative considered**: Strict validation that fails the build on any schema violation. Rejected as too brittle for community-sourced data with unknown completeness.

### Decision 6: Five new content collections (not a single "reference" collection)

**Chosen**: Separate collections for `cards`, `relics`, `potions`, `mechanics`, and `enemies`.

**Rationale**:
- Different schemas per entity type (cards have energy_cost, relics don't; relics have flavor text, cards don't; etc.)
- Separate URL namespaces (`/cards/`, `/relics/`, `/potions/`)
- Easier to query and filter independently
- Matches the source vault's organization

**Alternative considered**: Single `reference` collection with a `type` discriminator field. Rejected because Zod discriminated unions add complexity, and the URL/route structure naturally separates these anyway.

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Source (manual clone)                                           │
│  ┌──────────────────────────┐                                       │
│  │ mutjan/slay-the-spire-2- │   git clone to ./vault-source/        │
│  │ obsidian-vault (GitHub)  │   (gitignored, not committed)         │
│  └──────────┬───────────────┘                                       │
│             │                                                       │
│             ▼                                                       │
│  2. Parse (scripts/convert-vault.mjs)                               │
│  ┌──────────────────────────┐                                       │
│  │ Read .md files           │                                       │
│  │ Parse :: frontmatter     │   Regex-based, no yaml library        │
│  │ Strip WikiLink [[]]      │                                       │
│  │ Translate CN → EN        │   Hardcoded dictionary                │
│  │ Resolve cross-refs       │   WikiLinks → our URL patterns        │
│  │ Validate against schemas │   Zod (same schemas as content.config)│
│  │ Write .mdx files         │   src/content/{cards,relics,...}/*.mdx│
│  └──────────┬───────────────┘                                       │
│             │                                                       │
│             ▼                                                       │
│  3. Astro Content Layer (src/content.config.ts)                     │
│  ┌──────────────────────────┐                                       │
│  │ glob() loader per type   │                                       │
│  │ Zod schema validation    │                                       │
│  │ Type generation          │   `astro:content` types               │
│  └──────────┬───────────────┘                                       │
│             │                                                       │
│             ▼                                                       │
│  4. Routes (src/pages/games/[game]/{cards,relics,...}/)             │
│  ┌──────────────────────────┐                                       │
│  │ [slug].astro → detail    │   Individual entity pages             │
│  │ index.astro → listing    │   Filterable listing pages            │
│  └──────────┬───────────────┘                                       │
│             │                                                       │
│             ▼                                                       │
│  5. Build Output (dist/)                                            │
│  ┌──────────────────────────┐                                       │
│  │ ~800 static HTML pages   │   With SEO metadata, JSON-LD,         │
│  │ Cross-linked              │   breadcrumbs, ad slots              │
│  └──────────────────────────┘                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Content Collection Schemas

```typescript
// Card schema — added to src/content.config.ts
const cardSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  type: z.enum(['Attack', 'Skill', 'Power', 'Status', 'Curse']),
  character: z.string(),  // character slug, or 'colorless'/'curse'
  rarity: z.enum(['Common', 'Uncommon', 'Rare', 'Starter', 'Special', 'Curse']),
  energy_cost: z.number().int().min(0).optional(),
  effect: z.string(),
  upgraded_effect: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  related_cards: z.array(z.string()).default([]),
});

const relicSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  rarity: z.enum(['Common', 'Uncommon', 'Rare', 'Boss', 'Starter', 'Special', 'Event']),
  character: z.string().optional(),  // undefined = universal
  effect: z.string(),
  flavor_text: z.string().optional(),
});

const potionSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  rarity: z.enum(['Common', 'Uncommon', 'Rare']),
  effect: z.string(),
});

const mechanicSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  description: z.string(),
  related_cards: z.array(z.string()).default([]),
  related_relics: z.array(z.string()).default([]),
});

const enemySchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  act: z.number().int().min(1).max(4),
  hp_range: z.string(),
  moveset: z.array(z.object({
    name: z.string(),
    effect: z.string(),
    damage: z.string().optional(),
  })).default([]),
  is_elite: z.boolean().default(false),
  is_boss: z.boolean().default(false),
});
```

## URL Structure

```
/games/slay-the-spire-2/
├── cards/                              → Card listing (filterable)
│   ├── demon-form/                     → Card detail page
│   ├── anger/
│   └── ... (~480 pages)
├── relics/                             → Relic listing (filterable)
│   ├── ice-cream/
│   └── ... (~250 pages)
├── potions/                            → Potion listing
│   └── ... (63 pages)
├── mechanics/                          → Mechanic glossary
│   ├── strength/
│   └── ... (44 pages)
├── enemies/                            → Enemy bestiary
│   └── ... (9+ pages)
├── characters/ironclad/                → Existing character pages
├── guides/ironclad-overview/           → Existing strategy guides
└── index/                              → Existing game hub
```

## Translation Dictionary (excerpt)

```javascript
const CHARACTER_MAP = {
  '铁甲战士': 'Ironclad',
  '静默猎手': 'Silent',
  '故障机器人': 'Defect',
  '储君': 'Regent',
  '死灵契约师': 'Necrobinder',
  '死灵法师': 'Necrobinder',
  '无色': 'Colorless',
};

const RARITY_MAP = {
  '普通': 'Common',
  '罕见': 'Uncommon',
  '稀有': 'Rare',
  '初始': 'Starter',
  '特殊': 'Special',
  '诅咒': 'Curse',
  'BOSS': 'Boss',
  '事件': 'Event',
};

const TYPE_MAP = {
  '攻击牌': 'Attack',
  '技能牌': 'Skill',
  '能力牌': 'Power',
  '状态牌': 'Status',
  '诅咒牌': 'Curse',
};
```

## Risks / Trade-offs

- **[Risk] Vault source data has errors or missing fields** → Mitigation: Lenient validation — missing optional fields get defaults, unknown enum values get logged as warnings. The human review phase catches data errors before content is marked `verified`.
- **[Risk] 800+ pages increase build time** → Mitigation: Astro content layer caches by default. The glob loader only re-reads changed files. First build is expected to be slow (~2-3 minutes); subsequent builds with cached content should be fast (<30s). Benchmark and add `--experimental-content-collection-cache` if needed.
- **[Risk] Auto-linking produces false positives** → Mitigation: The remark plugin only links exact matches against known entity names from the collections. Common English words that happen to be card names ("Strike", "Anger") will get linked — this is acceptable (users can escape with backticks). If false positives become a UX issue, we can add a deny-list for common words.
- **[Risk] Vault upstream updates break the conversion** → Mitigation: The vault is git-pinned (we clone a specific commit). Updates are manual and deliberate — we re-clone and re-run the script when we want new data. The script's `--dry-run` mode lets us preview changes before writing.
- **[Trade-off] Hardcoded translation dictionary vs. dynamic translation** → The dictionary approach means new games with different languages require new dictionaries. This is acceptable because: (a) adding a dictionary is a few dozen lines, (b) each game only needs one dictionary, and (c) we explicitly scoped to one game at a time.

## Open Questions

1. **Should card/relic pages include user comments?** → Deferred. No user auth exists yet. Could add Disqus or giscus later.
2. **Should listing pages be paginated or infinite-scroll?** → Start with full-list rendering (client-side filtering makes this fast for <500 items). Add pagination only if performance requires it.
3. **How to handle vault strategy guide pages (Chinese prose)?** → Skip them initially. They're in the `08-攻略/` directory and require full-text AI translation, which is a separate concern from the structured data pipeline.
