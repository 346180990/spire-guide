## Context

Greenfield project. We're building an English game strategy guide website monetized through display ads. The first game is Slay the Spire 2, with the architecture designed to add new games without code changes. Content is AI-assisted with mandatory human review. No user authentication — pure content consumption.

**Constraints:**
- Static-first: pages should render at build time where possible
- Mobile-first: majority of gaming guide traffic comes from mobile search
- Low operational overhead: single developer, minimal infrastructure
- SEO-critical: organic search is the primary traffic source
- Ad-friendly: content layout must accommodate display ads without breaking reading flow

## Goals / Non-Goals

**Goals:**
- Serve 30-50 Slay the Spire 2 strategy articles with fast load times (LCP < 2.5s, INP < 200ms on mobile)
- Add a new game by creating content files only — no component or routing code changes
- Support rich game-specific content elements: build cards, tier lists, stat comparison tables, tooltips
- Integrate Google AdSense with responsive, lazy-loaded ad placements
- Generate valid JSON-LD structured data for every article and game hub page
- Produce auto-generated sitemaps that update with each deployment

**Non-Goals:**
- User accounts, comments, or UGC (may add later, out of scope for v1)
- Server-side API or database (fully static + build-time data)
- Real-time game data or API integrations (content is manually/ai-authored)
- Multi-language support (English only for v1)
- E-commerce or affiliate links (ads only for v1 monetization)
- CI/CD pipeline beyond what the hosting platform provides out of the box

## Decisions

### 1. Framework: Astro over Next.js

**Rationale:** This is a content site, not a web application. Astro ships zero JavaScript by default, has first-class MDX support, and its island architecture lets us hydrate only interactive elements (ad slots, search). Next.js would introduce unnecessary JS overhead for pages that are fundamentally static content.

**Alternatives considered:**
- **Next.js**: Better for app-like experiences but overkill for content. Would require more effort to optimize Core Web Vitals.
- **Hugo/Zola**: Faster builds but no component model — we need custom MDX components for game-specific content (build cards, tier lists).
- **Eleventy**: Good but smaller ecosystem for our custom component needs.

### 2. Styling: Tailwind CSS

**Rationale:** Utility-first CSS is ideal for content-heavy sites where most styling is typography, spacing, and layout. Tailwind's responsive utilities make mobile-first design natural. No runtime CSS-in-JS overhead since Tailwind compiles at build time.

### 3. Content Format: MDX + Custom Components

Articles are `.mdx` files in a structured directory hierarchy:

```
src/content/
  games/
    <game-slug>/
      metadata.yaml          # Game name, cover, description, release date
      hub.mdx                # Game hub page content
      guides/
        <guide-slug>.mdx     # Individual guides
```

Each guide has frontmatter for SEO metadata, categorization, and content phase tagging. Custom MDX components (`<BuildCard>`, `<TierList>`, `<StatTable>`, `<GameTooltip>`) enable rich strategy content without leaving markdown.

### 4. Content Organization: Game-First Hierarchy

URL structure:
```
/                           # Home — featured games, latest guides
/games/<slug>/              # Game hub — overview, character list, latest guides
/games/<slug>/guides/<guide-slug>/  # Individual guide article
/games/<slug>/characters/<char>/     # Character-specific guide hub
```

The `/games/<slug>/` namespace means adding a new game requires:
1. A new directory under `src/content/games/<slug>/`
2. A `metadata.yaml` file
3. Guide `.mdx` files

No component or routing changes needed. Navigation and sitemap auto-discover games from the content directory.

### 5. Deployment: Cloudflare Pages

**Rationale:** Cloudflare Pages has no build-minute limits on the free tier (important for eventual content scale), global CDN edge network, and native Astro support via the `@astrojs/cloudflare` adapter. Vercel was considered but has tighter free-tier build limits.

### 6. Content Pipeline: AI Draft → Human Edit → Publish

Articles follow a defined lifecycle managed through git:
1. **Draft**: AI generates initial MDX from a prompt template + game data
2. **Review**: Human editor applies the review checklist, adds personal hooks, verifies facts
3. **Published**: File merged to main branch, triggers deployment

The review checklist is enforced via a markdown template, not tooling — this keeps the pipeline lightweight.

### 7. Ad Integration: Client-Side Islands with Lazy Loading

Ad slots are Astro islands that hydrate only when they enter the viewport. This keeps the initial page load JS-free for content. Ad placements are defined in frontmatter and rendered by an `<AdSlot>` component that respects content flow:

```
Article body pattern:
  [intro paragraph]
  [AdSlot: in-content-1]      ← after first 2-3 paragraphs
  [main content]
  [AdSlot: in-content-2]      ← mid-article
  [conclusion]
  [AdSlot: after-content]     ← after article end
```

## Risks / Trade-offs

- **AI content quality risk**: AI-generated game guides may contain factual errors (wrong card stats, outdated meta). → Mitigation: Every article must pass human review checklist before publish; articles display "last verified" date.
- **SEO risk (AI content penalty)**: Search engines may penalize AI-heavy content. → Mitigation: Human-touch layer (personal hooks, unique structure, verified data), EEAT signals (author byline, about page, update timestamps), no fully automated publishing.
- **Single-game dependency**: Traffic depends entirely on Slay the Spire 2's continued popularity. → Mitigation: Multi-game architecture from day 1 enables rapid expansion; target adding second game within 60 days of launch.
- **Ad revenue ramp**: AdSense requires traffic to earn; Mediavine requires 50K sessions/month. → Mitigation: Focus on long-tail SEO content first; monetization is a function of traffic, not upfront work.
- **Build time growth**: As content scales to hundreds of articles across multiple games, static build times will increase. → Mitigation: Astro's content collections with incremental builds; Cloudflare Pages' build caching. Not a concern at 30-50 articles.

## Open Questions

- **Domain name**: TBD — should be game-agnostic (not tied to Slay the Spire 2)
- **Second game**: Which game to add after Slay the Spire 2? Candidate list should be maintained based on SEO gap analysis.
- **Image strategy**: AI-generated article images? Official game screenshots (copyright concern)? ASCII diagrams? Decision needed before first article goes live — likely start with no images, add screenshots during human review phase.
- **Analytics**: Google Analytics vs privacy-first alternative (Plausible)? GA is free but adds JS weight; Plausible is lighter but paid.
