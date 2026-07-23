## Why

Character YAML dashboards define 17 archetypes across 5 characters, but only 9 have corresponding deep-guide MDX articles. This leaves 10 build guides missing — users who click through from a dashboard archetype card find no dedicated guide. Additionally, the game is in Early Access with no version tracking, making it impossible for readers to know whether content is current after patches.

## What Changes

- **Add game version tracking**: New `version` and `lastVersionCheck` fields in game metadata YAML to anchor content freshness
- **Write 10 missing build guide MDX articles**: One deep-guide article for every archetype currently defined in character dashboards but lacking a dedicated `.mdx` file
- **Ensure archetype↔guide cross-linking**: Each character dashboard archetype card links to its dedicated guide, and each guide links back to the dashboard
- **Update article frontmatter**: Every new guide includes `gameVersion` field so readers can verify content currency

## Capabilities

### New Capabilities

- `game-version-tracking`: Track which game version content was verified against, display version badges on articles, and surface stale content after game patches
- `build-guide-completeness`: Guarantee that every archetype defined in a character dashboard YAML has a corresponding deep-guide MDX article, with bi-directional linking between dashboard and guide

### Modified Capabilities

- `game-content-hub`: Game metadata schema gains `version` and `lastVersionCheck` fields; article frontmatter schema gains optional `gameVersion` field

## Impact

- **Content**: 10 new `.mdx` files under `src/content/guides/`; 1 field addition to `src/content/games/slay-the-spire-2.yaml`
- **Schema**: Optional `gameVersion` and required `version`/`lastVersionCheck` fields (Zod schemas in `src/content/config.ts` may need updating if strict validation is active)
- **Templates**: Article layout may display version badge alongside existing phase/date metadata
- **No code changes to routing, components, or layouts** — content-only change with minimal schema extension
