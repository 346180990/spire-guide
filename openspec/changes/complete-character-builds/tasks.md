## 1. Game Version Tracking

- [x] 1.1 Add `version` and `lastVersionCheck` fields to `src/content/games/slay-the-spire-2.yaml`
- [x] 1.2 Add optional `gameVersion` field to guide article frontmatter Zod schema in `src/content/config.ts`
- [x] 1.3 Add version display badge to `ArticleLayout.astro` (shows gameVersion alongside publish/update dates)
- [x] 1.4 Add staleness notice when game version ≠ article version in `ArticleLayout.astro`

## 2. Ironclad Build Guides (2 missing)

- [x] 2.1 Write `ironclad-self-damage-berserker.mdx` — Self-Damage Berserker build (Offering, Hemokinesis, Rupture, Brutality)
- [x] 2.2 Write `ironclad-entrench-block.mdx` — Entrench Block build (Barricade, Entrench, Body Slam, Impervious)

## 3. Silent Build Guides (1 missing)

- [x] 3.1 Write `silent-grand-finale.mdx` — Grand Finale build (Grand Finale, Well-Laid Plans, Acrobatics, Expertise)

## 4. Defect Build Guides (2 missing)

- [x] 4.1 Write `defect-power-spam.mdx` — Power Spam build (Creative AI, Hello World, Storm, Amplify)
- [x] 4.2 Write `defect-claw-zero-cost.mdx` — Claw 0-Cost Cycle build (Claw, Scrape, All for One, Go for the Eyes)

## 5. Regent Build Guides (2 missing)

- [x] 5.1 Write `regent-command-chain.mdx` — Command Chain build (Rally, Battle Orders, Coordinated Strike, Formation)
- [x] 5.2 Write `regent-army-of-light.mdx` — Army of Light build (Call to Arms, Knight Commander, Squire, Royal Guard)

## 6. Necrobinder Build Guides (2 missing)

- [x] 6.1 Write `necrobinder-curseborne-power.mdx` — Curseborne Power build (Accursed Pact, Hex Bolt, Corrupted Offering, Vile Ritual)
- [x] 6.2 Write `necrobinder-minion-sacrifice.mdx` — Minion Sacrifice build (Raise Dead, Skeletal Horde, Sacrifice, Bone Barrier)

## 7. Cross-Linking & Audit

- [x] 7.1 Verify all dashboard archetype `<BuildCard>` components link to the correct guide slugs
- [x] 7.2 Add related guides cross-references between builds for the same character
- [x] 7.3 Run `npx astro build` to verify all guide pages build successfully with valid frontmatter
- [x] 7.4 Audit: confirm archetype count in YAML == guide count per character (excluding overviews and roadmap)

## 8. Content Review

- [x] 8.1 Run all 10 new guides through the content pipeline review checklist
- [x] 8.2 Set appropriate `phase` for each guide (research for AI-assisted, verified for play-tested)
- [x] 8.3 Verify no banned AI-voice phrases per `content-pipeline/banned-phrases.md`
