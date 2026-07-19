## ADDED Requirements

### Requirement: Ad slot component
The system SHALL provide an `<AdSlot>` component that renders a responsive Google AdSense ad unit with lazy loading, content-aware positioning, and reserved space to prevent layout shift.

#### Scenario: Ad slot reserves space before loading
- **WHEN** an `<AdSlot>` is rendered in an article body
- **THEN** a placeholder container with the correct ad dimensions SHALL occupy the space before the ad script executes, preventing Cumulative Layout Shift

#### Scenario: Ad slot lazy loads
- **WHEN** an `<AdSlot>` is outside the initial viewport
- **THEN** the ad script SHALL only be requested when the slot scrolls within 200px of the viewport

### Requirement: Ad placement strategy
The system SHALL support three named ad placement positions within guide articles: `in-content-1` (after first 2-3 paragraphs), `in-content-2` (mid-article), and `after-content` (after article conclusion).

#### Scenario: In-content ad placement
- **WHEN** a guide article is rendered with `adSlots: [in-content-1, in-content-2, after-content]` in frontmatter
- **THEN** ad slots SHALL appear at the corresponding positions, and the positions SHALL be overridable per article

### Requirement: Responsive ad sizing
Ad slots SHALL render with different size configurations based on viewport width: horizontal banner on desktop, rectangle/square on tablet, and mobile-optimized units on phones.

#### Scenario: Ad resizes for mobile
- **WHEN** a page with an `<AdSlot>` is viewed on a 375px-wide viewport
- **THEN** the ad unit SHALL request a mobile-appropriate size (320x100 or 300x250) rather than a desktop leaderboard (728x90)

### Requirement: Ad density limits
No single article page SHALL display more than 3 ad slots, and no more than 1 ad slot SHALL be visible in the initial viewport on page load.

#### Scenario: Ad density enforced
- **WHEN** an article attempts to configure more than 3 ad slots
- **THEN** the system SHALL render only the first 3 slots and ignore additional ones

### Requirement: AdSense script loading
The Google AdSense script SHALL load asynchronously with the `async` attribute and SHALL NOT block page rendering or content paint.

#### Scenario: AdSense script is non-blocking
- **WHEN** a page with ad slots loads
- **THEN** the page content SHALL render before the AdSense script finishes loading, and the `async` attribute SHALL be present on the script tag

### Requirement: Ad-free content preview
The development and preview environments SHALL display placeholder boxes instead of loading real ad scripts to avoid accidental ad impressions during development.

#### Scenario: Dev environment shows placeholder
- **WHEN** the site runs in development mode (`astro dev`)
- **THEN** ad slots SHALL render as labeled placeholder boxes ("Ad: <size>") instead of requesting real ad scripts
