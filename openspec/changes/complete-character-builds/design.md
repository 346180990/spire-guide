## Context

The site has 6 character dashboards defining 17 archetypes total, but only 9 build guides exist. No game version tracking mechanism exists, so readers cannot assess content freshness. This is a content-only change with minimal schema extension — no new components, routes, or dependencies.

Current state:
- 5 playable characters + 1 Colorless universal page
- 15 guides: 5 overviews + 9 builds + 1 roadmap
- 10 archetypes in YAML dashboards have no corresponding deep guide
- Game metadata lacks version information

## Goals / Non-Goals

**Goals:**
- Track game version in metadata so articles can display "Verified against version X"
- Write all 10 missing build guides matching the archetypes defined in character YAML
- Ensure every archetype card in character dashboards links to its dedicated guide
- Maintain existing content quality standards (human review, EEAT signals, unique insights)

**Non-Goals:**
- Automated version syncing (Steam API polling, etc.) — manual update on patch day is sufficient
- Video content or interactive tools
- Changes to the MDX rendering pipeline or layout components
- New character dashboards or archetype additions (only cover what's already defined)

## Decisions

### 1. Version tracking: two fields in game YAML

Add `version` (string, e.g. `"Early Access 0.3.1"`) and `lastVersionCheck` (ISO date) to `games/slay-the-spire-2.yaml`. Each guide gets an optional `gameVersion` frontmatter field.

**Rationale:** Two-field approach lets us distinguish "what version the game is at" from "what version each article was checked against." A guide written for `0.2.8` remains valid if game is `0.3.1` but the relevant mechanics didn't change — the `updatedDate` + `gameVersion` combo gives readers enough context to judge.

**Alternatives considered:**
- Single `patch` field: loses the ability to differentiate global game state from per-article verification
- Auto-fetching from Steam API: over-engineered for a manual content pipeline; adds dependency and build-time API calls

### 2. Guide file naming: `<character-slug>-<archetype-slug>.mdx`

Example: `ironclad-entrench-block.mdx`, `defect-power-spam.mdx`

**Rationale:** Matches existing naming convention (e.g., `ironclad-strength-build.mdx`, `silent-poison-build.mdx`). Predictable naming enables grep-based audits to verify completeness.

### 3. Guide template: reuse existing structure with archetype-specific depth

Every new guide follows the same structure as existing builds:
- Standard frontmatter (title, description, publishDate, phase, guideType, character, game, gameVersion)
- Breadcrumbs + JSON-LD (handled by ArticleLayout)
- Core Cards header section (linked card images)
- Key Relics section
- Strategy breakdown (Act I → II → III)
- Pitfalls section
- Related guides

**Rationale:** Consistency with existing guides. No new MDX components needed.

### 4. Cross-linking: dashboard archetype cards already link to `/guides/<id>/`

Character dashboard `BuildCard` component renders archetype cards. Existing convention: guide slug matches archetype name in kebab-case. We ensure each new guide follows this convention so dashboard↔guide linking works automatically.

## Risks / Trade-offs

- **Content accuracy**: Writing guides for a game in Early Access means future patches may invalidate them. → Mitigation: `gameVersion` in frontmatter + `updatedDate` signal; prioritize updating high-traffic guides on patch days
- **AI content detection**: New guides will follow the AI-draft → human-review pipeline. Risk of "AI voice" in speed-written content. → Mitigation: All guides go through the existing review checklist before publish
- **Build time**: +10 MDX files is negligible for Astro build (~100ms each). No measurable impact

## Open Questions

- **Exact game version string**: Need to check the current STS2 Early Access version number and enter it in game metadata
- **Publish dates**: New guides should be dated with their actual publish date (not back-dated)
