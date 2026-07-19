# Human Review Checklist

Every article must pass this checklist before the `reviewed: true` flag is set and the article is merged to production. Reviewers should read the article in full and verify each item.

## Phase 1: Factual Accuracy (CRITICAL — must pass)

### For MDX Articles

- [ ] All card names match official game names (no hallucinated cards)
- [ ] All damage/block values match verified game data
- [ ] All relic names and effects are correct
- [ ] All character/class mechanics are accurately described
- [ ] Synergies described actually work (no imaginary combos)
- [ ] Boss/elite names and mechanics are accurate
- [ ] Any [Needs Verification] markers are resolved or escalated
- [ ] No obviously wrong strategic advice (e.g., "skip Demon Form in a Strength build")

### For Character Dashboard YAML (NEW)

- [ ] `npx astro build` completes without Zod validation errors on the YAML file
- [ ] All card slugs in `startingDeck.cards[].slug`, `archetypes[].keyCards[]`, and `strategy.*.picks[]` match existing files in `src/content/cards/`
- [ ] All relic slugs in `archetypes[].keyRelics[]` and `relicTiers[].items[].name` match existing files in `src/content/relics/`
- [ ] `mechanics[].icon` uses only emoji from the approved icon list (⚡❄️🌑⚛️💪☠️🔪🃏📋👥📜💀👻🐺🔥✨🛡️🗡️)
- [ ] `difficulty` is exactly one of: beginner, intermediate, advanced, expert
- [ ] `quickRef.difficultyRating` is an integer 1-5
- [ ] `pitfalls[].severity` is exactly one of: critical, high, medium
- [ ] `relicTiers[].tier` is exactly one of: S, A, B, C, D, F
- [ ] `isColorless` is true if and only if the character is Colorless
- [ ] Colorless characters omit `mechanics`, `startingDeck`, and `archetypes` fields
- [ ] If Zod validation fails, YAML must be corrected and re-validated before proceeding to Phase 2
- [ ] Run `src/content/schemas/character-dashboard.ts` Zod schema validation: `npx tsx -e "import {characterDashboardSchema} from './src/content/schemas/character-dashboard'; import {readFileSync} from 'fs'; import {parse as yamlParse} from 'yaml'; const data = yamlParse(readFileSync('src/content/characters/{character_slug}.yaml','utf8')); characterDashboardSchema.parse(data); console.log('✓ Schema valid');"`

## Phase 2: Anti-AI-Voice Removal (HIGH — must pass)

- [ ] No banned phrases detected (see `banned-phrases.md` for full list)
- [ ] Sentences vary in length — no monotonous rhythm
- [ ] At least 2 sentence fragments or conversational breaks per section
- [ ] No paragraph starts with "However,", "Additionally,", "Furthermore,", "Moreover,"
- [ ] No paragraph ends with "...making it a strong choice" or similar AI filler closers
- [ ] Audio test: read a paragraph out loud. Does it sound like a human wrote it?

## Phase 3: Personal Hooks (HIGH — must pass)

- [ ] At least one personal observation or "aha moment" per major section
- [ ] At least one mention of a common mistake or trap
- [ ] At least one "I found that..." or "In my experience..." style insight
- [ ] At least one contrasting opinion ("Some players prefer X, but I think Y because...")
- [ ] The article doesn't read like a Wikipedia summary — it has a voice

## Phase 4: Structure & Readability

- [ ] Title is descriptive and search-friendly (includes game name + key terms)
- [ ] Description is 120-160 characters and includes primary keyword
- [ ] Article uses proper heading hierarchy (h2 > h3 > h4, no skipped levels)
- [ ] No section is longer than 4 paragraphs without a subheading or component
- [ ] MDX components (BuildCard, TierList, StatTable) render correctly
- [ ] Links work and point to real pages
- [ ] Mobile layout check: content readable at 375px width
- [ ] Ad slots don't break reading flow

## Phase 5: SEO & Metadata

- [ ] `title` frontmatter: 40-65 characters, includes primary keyword
- [ ] `description` frontmatter: 120-160 characters, compelling click-through
- [ ] `publishDate` is correct
- [ ] `updatedDate` is set if article was revised
- [ ] `character` field set if guide is character-specific
- [ ] `guideType` is accurate
- [ ] `relatedGuides` links to at least 2 other existing guides
- [ ] `difficulty` field is appropriate for the content

## Phase 6: Attribution & Sources

- [ ] If `phase: research`, Sources section lists community resources used
- [ ] Source links are to primary sources (wikis, official sites), not aggregators
- [ ] No plagiarized content — all text is original writing

## Sign-off

After completing all phases, update the article frontmatter:

```yaml
reviewed: true
reviewedDate: YYYY-MM-DD
```

If the article was play-tested (author actually played the build), also update:

```yaml
phase: verified
```
