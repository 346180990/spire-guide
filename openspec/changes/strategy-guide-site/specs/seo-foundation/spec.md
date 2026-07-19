## ADDED Requirements

### Requirement: Server-rendered HTML
All pages SHALL be statically rendered to full HTML at build time, ensuring search engines can crawl all content without JavaScript execution.

#### Scenario: Page served as complete HTML
- **WHEN** a crawler fetches any page URL
- **THEN** the response SHALL contain the complete rendered content in the HTML source, including article body text, meta tags, and structured data

### Requirement: JSON-LD structured data for articles
Every guide article SHALL include JSON-LD `Article` structured data with headline, description, datePublished, dateModified, author name, and publisher information.

#### Scenario: Article with JSON-LD
- **WHEN** a guide article page is rendered
- **THEN** a `<script type="application/ld+json">` tag SHALL be present in the `<head>` with valid Article schema including all required properties

### Requirement: JSON-LD BreadcrumbList
Every page below the root SHALL include JSON-LD `BreadcrumbList` structured data reflecting its position in the site hierarchy.

#### Scenario: Guide article breadcrumbs
- **WHEN** a guide article at `/games/slay-the-spire-2/guides/ironclad-strength-build/` is rendered
- **THEN** the BreadcrumbList SHALL contain three items: Home → Slay the Spire 2 → Ironclad Strength Build

### Requirement: Auto-generated sitemap
The system SHALL generate a `sitemap.xml` at build time that includes all active game hubs and published guide articles with their last modified dates and appropriate change frequencies.

#### Scenario: Sitemap includes all content
- **WHEN** the site builds with 3 active games and 45 published guides
- **THEN** the sitemap SHALL contain 48 entries (3 game hubs + 45 guides), each with `<lastmod>` and `<changefreq>` values

### Requirement: Canonical URLs
Every page SHALL include a `<link rel="canonical">` tag pointing to its absolute URL to prevent duplicate content issues.

#### Scenario: Canonical URL on guide page
- **WHEN** a guide article page is rendered
- **THEN** the `<head>` SHALL contain `<link rel="canonical" href="https://<domain>/games/<slug>/guides/<slug>/">`

### Requirement: Meta description and Open Graph
Every page SHALL include a unique `<meta name="description">` tag and Open Graph tags (`og:title`, `og:description`, `og:image`, `og:type`) for social sharing.

#### Scenario: Guide article with OG tags
- **WHEN** a guide article with frontmatter `description: "Complete guide to Ironclad Strength builds in STS2"` is rendered
- **THEN** the Open Graph tags SHALL use the article title, that description, and the article's featured image if one exists

### Requirement: robots.txt
The system SHALL generate a `robots.txt` file that allows crawling of all public pages and points to the sitemap URL.

#### Scenario: robots.txt generated
- **WHEN** the site builds
- **THEN** `robots.txt` SHALL be generated at the site root containing `Allow: /` and `Sitemap: https://<domain>/sitemap.xml`

### Requirement: Performance budget
All pages SHALL meet Core Web Vitals thresholds: Largest Contentful Paint (LCP) under 2.5 seconds, Interaction to Next Paint (INP) under 200ms, Cumulative Layout Shift (CLS) under 0.1, measured at the 75th percentile on mobile.

#### Scenario: Guide article passes performance budget
- **WHEN** a typical guide article (text + 2 build cards + 1 ad slot) loads on a mobile device
- **THEN** LCP SHALL be under 2.5s, CLS SHALL be under 0.1, and the page SHALL have zero layout shifts from ad slots (reserved space via placeholder)
