## 1. Project Setup

- [x] 1.1 Initialize Astro project with TypeScript, Tailwind CSS v4, and MDX integration
- [x] 1.2 Configure content collections for games and guides with Zod schemas
- [x] 1.3 Set up project directory structure (src/content/games/, src/components/, src/layouts/, src/pages/)
- [x] 1.4 Create base layouts: MainLayout (global nav + footer) and ArticleLayout (guide-specific with breadcrumbs)
- [x] 1.5 Configure `astro.config.mjs` with Cloudflare adapter, sitemap integration, and image optimization

## 2. Multi-Game Content Infrastructure

- [x] 2.1 Define game metadata Zod schema (slug, name, description, coverImage, releaseDate, active, characters)
- [x] 2.2 Define guide frontmatter Zod schema (title, description, publishDate, updatedDate, game, character, guideType, phase, relatedGuides)
- [x] 2.3 Create `src/content/games/slay-the-spire-2/metadata.yaml` with all 5 characters and game info
- [x] 2.4 Implement `[game]/index.astro` dynamic route for game hub pages
- [x] 2.5 Implement `[game]/guides/[slug].astro` dynamic route for guide articles
- [x] 2.6 Implement `[game]/characters/[character].astro` for character-filtered guide listings
- [x] 2.7 Build homepage (`index.astro`) with active game discovery, sorted by latest guide update
- [x] 2.8 Build auto-generated global navigation component that discovers games from content directory

## 3. Article System & MDX Components

- [x] 3.1 Create `<BuildCard>` MDX component with all props (name, character, difficulty, coreCards, keyRelics, strategy)
- [x] 3.2 Create `<TierList>` MDX component with tier grouping and responsive layout
- [x] 3.3 Create `<StatTable>` MDX component with sortable columns and mobile horizontal scroll
- [x] 3.4 Create `<GameTooltip>` component for inline card/relic name tooltips
- [x] 3.5 Build article page layout with: phase badge, breadcrumbs, related guides footer, publish/update dates
- [x] 3.6 Style all components mobile-first with Tailwind, ensuring readability on 375px+ viewports

## 4. SEO Foundation

- [x] 4.1 Implement JSON-LD Article structured data generation for all guide pages
- [x] 4.2 Implement JSON-LD BreadcrumbList for all non-root pages
- [x] 4.3 Generate `sitemap.xml` with all active game hubs and published guides at build time
- [x] 4.4 Add canonical URL, meta description, and Open Graph tags to every page
- [x] 4.5 Generate `robots.txt` pointing to sitemap
- [x] 4.6 Set up `_headers` or equivalent for performance (caching, content-type, CORS if needed)
- [ ] 4.7 Audit Core Web Vitals: verify LCP < 2.5s, CLS < 0.1, zero JS on content pages by default

## 5. Ad Integration

- [x] 5.1 Create `<AdSlot>` Astro island component with lazy loading and reserved-space placeholder
- [x] 5.2 Implement responsive ad sizing: desktop (728x90), tablet (468x60), mobile (320x100 or 300x250)
- [x] 5.3 Add ad placement logic to ArticleLayout for in-content-1, in-content-2, and after-content positions
- [x] 5.4 Enforce ad density limits (max 3 per article, max 1 above fold)
- [x] 5.5 Load AdSense script with async attribute from a configurable data-ad-client ID
- [x] 5.6 Show placeholder boxes in dev mode instead of loading real ad scripts

## 6. Content Pipeline & First Articles

- [x] 6.1 Create AI prompt template for build guide generation, parameterized by game/character/build type
- [x] 6.2 Document human review checklist (factual accuracy, AI-voice removal, personal hooks, SEO metadata, source attribution)
- [x] 6.3 Document banned AI-voice phrases and replacement guidelines
- [ ] 6.4 Generate and review first batch: Slay the Spire 2 hub page content
- [ ] 6.5 Generate and review: 5 character overview guides (Ironclad, Silent, Defect, Regent, Necrobinder)
- [ ] 6.6 Generate and review: 15-20 build guide articles (3-4 builds per character)
- [ ] 6.7 Generate and review: relic tier list and beginner roadmap articles
- [ ] 6.8 Tag all articles with appropriate phase badges and source attributions

## 7. Deployment & Launch

- [ ] 7.1 Register domain name (game-agnostic, TBD — e.g., buildsaga.com, stratforge.com, etc.)
- [ ] 7.2 Set up Cloudflare Pages project connected to git repository
- [ ] 7.3 Configure build command and environment variables (AdSense publisher ID, site URL)
- [ ] 7.4 Deploy initial version with all STS2 content and verify all routes resolve
- [ ] 7.5 Set up Google AdSense account and add site for review
- [ ] 7.6 Set up analytics (Google Analytics or Plausible) for traffic monitoring
- [ ] 7.7 Verify all pages pass Core Web Vitals on mobile and desktop
- [ ] 7.8 Submit sitemap to Google Search Console for indexing
