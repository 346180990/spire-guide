## Why

Slay the Spire 2 has sold 7M+ copies in Early Access (March 2026) across 5 playable characters with deep build diversity — yet existing English strategy guides from IGN, Game8, and other major outlets remain shallow, covering only basic tips. Players actively search for specific build guides ("Ironclad best build", "Silent discard guide", "STS2 relic tier list") with high purchase/click intent, creating a content gap that a focused, AI-assisted strategy site can capture. Starting with one game and architecting for multi-game expansion from day 1 lets us prove the model before scaling.

## What Changes

- **New website**: A fast, SEO-optimized English game strategy guide site built with a static-first framework
- **Slay the Spire 2 content hub**: 30-50 deep strategy articles covering character builds, relic tier lists, beginner roadmaps, and co-op strategies
- **Content pipeline**: AI-assisted article generation with mandatory human-touch layer (personal hooks, fact verification, anti-AI-voice editing)
- **Multi-game architecture**: Content structured by game, with reusable templates and URL patterns (`/games/<slug>/...`) to support adding new games without code changes
- **Ad monetization**: Google AdSense integration with non-intrusive ad placements optimized for content-heavy pages
- **No user auth**: Pure content consumption site; readers don't need accounts

## Capabilities

### New Capabilities

- `game-content-hub`: Per-game content organization with hub pages, article listings, and game metadata. Each game gets its own section with character/class guides, build guides, and meta content — all managed through structured content files.
- `article-system`: Rich article rendering with support for tier lists, build cards, stat tables, and cross-referencing between related guides. Articles are authored in MDX with custom components for game-specific content types.
- `content-pipeline`: AI-assisted content generation workflow that produces structured article drafts from game data (card stats, relic data, community research), with a defined human review checklist before publication.
- `seo-foundation`: Server-rendered pages, semantic HTML, JSON-LD structured data (Article, BreadcrumbList, FAQ), auto-generated sitemaps, and performance budgets for Core Web Vitals.
- `ad-integration`: Configurable ad slot system supporting Google AdSense with responsive placements, lazy loading, and content-aware positioning that avoids disrupting reading flow.
- `multi-game-routing`: URL and navigation architecture that treats games as first-class content namespaces, enabling new games to be added via content files alone without routing or component changes.

### Modified Capabilities

None — this is a greenfield project.

## Impact

- **Codebase**: New repository, no existing code affected
- **Dependencies**: Static site framework (Astro or Next.js), MDX for content, Google AdSense script, deployment platform (Vercel or Cloudflare Pages)
- **Infrastructure**: Custom domain registration, DNS configuration, analytics setup (Google Analytics or Plausible)
- **Content**: Initial content research and creation effort for 30-50 articles covering Slay the Spire 2
