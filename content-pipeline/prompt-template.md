# AI Content Generation Prompt Template

## Purpose

This document defines the standardized prompt template for generating strategy guide article drafts. Use this template with any capable LLM to produce structured MDX drafts that follow our content standards.

## Core Principles

1. **Always provide verified game data as context** — card names, damage values, relic effects, character abilities. Never let the AI hallucinate game mechanics.
2. **Request specific sections** — unstructured AI output tends toward fluff. Define the structure upfront.
3. **Ban AI-voice patterns** — include explicit instructions to avoid common AI writing tells (see `banned-phrases.md`).
4. **Require concrete examples** — every claim about "good cards" or "strong relics" must reference specific names and use cases.

---

## Template: Build Guide

```
You are writing a strategy guide for the game {game_name}. 
Your audience is intermediate players who understand basic mechanics 
but want to optimize their play.

CHARACTER: {character_name}
BUILD TYPE: {build_name}
BUILD DESCRIPTION: {build_summary}
DIFFICULTY: {difficulty_level}

VERIFIED GAME DATA (use these exact values):
Cards in this archetype:
{card_list_with_stats}

Key relics for this archetype:
{relic_list_with_effects}

Synergies to mention:
{synergy_list}

OUTPUT FORMAT:
Generate an MDX file with the following sections. Use the exact 
frontmatter structure shown.

---
title: "{character_name} {build_name} Build Guide — {game_name}"
description: "Complete {build_name} build guide for {character_name} in {game_name}. Core cards, relic priorities, and turn-by-turn strategy."
publishDate: {today_date}
game: {game_slug}
character: {character_name}
guideType: build
phase: research
difficulty: {difficulty_level}
---

## Build Overview
[2-3 sentences explaining the build concept: what this deck does, 
why it's effective, what the win condition is. Be specific. 
Mention the key card that makes this build work.]

## Core Cards
[For each card, list: name, cost, effect (use verified data above), 
and WHY it matters for this specific build. Not just what it does — 
what role it plays.]

## Relic Priority
[Organize into tiers:
- Run-defining (build barely functions without these)
- High impact (significant power spike)
- Nice to have (helps but not essential)]

## Act-by-Act Strategy

### Act 1
[Card picks, path priorities, which elites to fight/avoid, 
upgrade order at campfires]

### Act 2
[How the deck evolves, what to add/remove, boss-specific adjustments]

### Act 3
[Endgame scaling, what kills you, how to prepare for final boss]

## Matchup Guide
[Specific enemy fights that counter this build and how to adapt]

## Alternative Cards
[Budget replacements if you don't find the key cards, 
and cards you should NOT take even if they look good]

## Sample Run
[A brief walkthrough of a successful run with this build: 
key decisions at each act, close calls, turning points]

WRITING RULES:
- DO NOT use: "delve into", "in the world of", "it is important to note", 
  "ultimately", "furthermore", "moreover", "in conclusion", "first and foremost"
- DO write like you're explaining to a friend who plays the game
- DO use short sentences. Vary paragraph length.
- DO include at least one personal observation or "aha moment" 
  about this build
- DO mention when to NOT use something (bad cards, bad relics, bad matchups)
- If you're unsure about a specific interaction, mark it with 
  [Needs Verification] rather than guessing
```

---

## Template: Character Overview (Visual Dashboard YAML)

This template replaces the old prose-based character overview. Instead of generating paragraphs of text, the AI outputs **structured YAML** that renders into a visual dashboard via `CharacterDashboardLayout.astro`. Every character gets one YAML file at `src/content/characters/{character_slug}.yaml`.

```
You are generating structured data for a game strategy dashboard.
Your audience is intermediate players who understand basic mechanics
but want to optimize their play.

CHARACTER: {character_name}
CHARACTER SLUG: {character_slug}
GAME: {game_name}
GAME SLUG: {game_slug}

VERIFIED GAME DATA (use these exact values for all card/relic names):
Available cards for this character:
{card_list_with_slugs}

Available relics:
{relic_list_with_slugs}

Character starting deck:
{starting_deck_cards}

OUTPUT FORMAT:
Generate a complete YAML file following this exact structure.
Use the verified game data for all card and relic names — NEVER invent names.

```yaml
# Character Dashboard — {character_name}
slug: {character_slug}
name: {character_name}
game: {game_slug}
characterImage: ""
role: "{character_role_1_line}"
difficulty: {beginner|intermediate|advanced|expert}
tagline: "{one_sentence_catchphrase_capturing_playstyle}"
playstyle: {aggro|control|scaler|combo|hybrid}
isColorless: false

# ─── Core Mechanics ──────────────────────────────────────────────────
# List 2-5 unique mechanic concepts for this character.
# Each mechanic needs: id (kebab-case), icon (one emoji), name, passive description, evoke description (if applicable), and a one-line tip.
# Use only the icons from this list: ⚡❄️🌑⚛️💪☠️🔪🃏📋👥📜💀👻🐺🔥✨🛡️🗡️
mechanics:
  - id: {mechanic_kebab_id}
    icon: "{one_emoji}"
    name: {Mechanic Display Name}
    passive: "{what_it_does_passively}"
    evoke: "{what_happens_when_evoked}"   # omit if no evoke mechanic
    tip: "{one_line_player_tip}"

# ─── Starting Deck ───────────────────────────────────────────────────
startingDeck:
  cards:
    - name: {card_name}
      slug: {card_slug}           # exact slug from verified game data
      count: {quantity_in_deck}
      upgradePriority: {1-5}      # 1 = upgrade first, 5 = lowest priority, omit if never upgrade

# ─── Archetypes ──────────────────────────────────────────────────────
# List the 2-4 main build archetypes for this character.
# keyCards and keyRelics MUST use exact slugs from verified game data.
archetypes:
  - name: {Archetype Display Name}
    difficulty: {beginner|intermediate|advanced|expert}
    keyCards: [{card_slug_1}, {card_slug_2}, {card_slug_3}]
    keyRelics: [{relic_slug_1}, {relic_slug_2}]
    description: "{2-3_sentence_build_concept}"

# ─── Act Strategy Timeline ───────────────────────────────────────────
strategy:
  act1:
    goal: "{what_to_accomplish_act1_one_sentence}"
    picks: [{card_slug_1}, {card_slug_2}, {card_slug_3}]
    upgrade: "{upgrade_order_with_arrows}"
    elites: "{elite_fight_strategy_one_sentence}"
  act2:
    goal: "{what_to_accomplish_act2_one_sentence}"
    picks: [{card_slug_1}, {card_slug_2}, {card_slug_3}]
    upgrade: "{upgrade_order_with_arrows}"
    elites: "{elite_fight_strategy_one_sentence}"
  act3:
    goal: "{what_to_accomplish_act3_one_sentence}"
    picks: [{card_slug_1}, {card_slug_2}, {card_slug_3}]
    upgrade: "{upgrade_order_with_arrows}"
    elites: "{elite_fight_strategy_one_sentence}"

# ─── Common Pitfalls ─────────────────────────────────────────────────
# List 3-6 common mistakes players make with this character.
pitfalls:
  - title: "{mistake_name}"
    severity: {critical|high|medium}
    tip: "{one_sentence_correction}"

# ─── Quick Reference ─────────────────────────────────────────────────
quickRef:
  similarTo: ["{analogy_game_1}", "{analogy_game_2}"]
  difficultyRating: {1-5_integer}
  powerCurve: ["{early_game_phase}", "{mid_game_phase}", "{late_game_phase}"]
  paceLabel: "{short_pace_description}"

# ─── Relic Tier List ─────────────────────────────────────────────────
relicTiers:
  - tier: S
    label: "Run-defining"
    items:
      - name: "{relic_name}"
        description: "{why_its_s_tier}"
        icon: "{emoji}"
  - tier: A
    label: "Strong synergy"
    items:
      - name: "{relic_name}"
        description: "{why_its_a_tier}"
        icon: "{emoji}"
  - tier: B
    label: "Situationally good"
    items:
      - name: "{relic_name}"
        description: "{why_its_b_tier}"
        icon: "{emoji}"
```

YAML WRITING RULES:
- Use EXACT card and relic slugs from the verified game data — do NOT make up names
- Every card/relic referenced in keyCards, keyRelics, picks or relicTiers MUST exist in the verified data above
- If you are unsure about a specific card/relic slug, mark the entire entry with a comment: # [Needs Verification: reason]
- Use literal YAML strings (unquoted) unless the string contains special characters (: { } [ ] , & * ? | - < > = ! % @ `)
- difficultyRating is an integer 1-5 where 1=easiest, 5=hardest
- severity MUST be exactly "critical", "high", or "medium"
- upgradePriority: 1=upgrade first, higher numbers = lower priority, omit if card is never upgraded
- Keep all descriptions concise — dashboards have limited space
- For Colorless characters, omit mechanics, startingDeck, and archetypes; set isColorless: true
- DO NOT use: "delve into", "in the world of", "it is important to note", "ultimately", "furthermore"
```

---

## Template: Tier List

```
[Same preamble and writing rules as Build Guide]

OUTPUT FORMAT:
---
title: "{game_name} {subject} Tier List"
description: "Complete {subject} tier list for {game_name}. 
Every {subject} ranked S through D tier with detailed explanations."
publishDate: {today_date}
game: {game_slug}
guideType: tier-list
phase: research
---

## Tier List: {subject}

### S Tier — Run-Defining
[For each entry: name, effect (from verified data), why it's S tier, 
which characters/archetypes use it best]

### A Tier — Strong & Consistent
[...same format...]

### B Tier — Situationally Good
[...same format...]

### C Tier — Niche or Outclassed
[...same format...]

### D Tier — Avoid
[...same format...]
```

---

## Parameter Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{game_name}` | metadata.yaml `name` | "Slay the Spire 2" |
| `{game_slug}` | metadata.yaml `slug` | "slay-the-spire-2" |
| `{character_name}` | metadata.yaml `characters[].name` | "Ironclad" |
| `{build_name}` | Community research | "Demon Form Strength" |
| `{build_summary}` | Community research | "Stack Strength and kill with Heavy Blade" |
| `{difficulty_level}` | Assessment | "beginner" / "intermediate" / "advanced" / "expert" |
| `{card_list_with_stats}` | Wiki / community DB | Card names, costs, damage/block values |
| `{relic_list_with_effects}` | Wiki / community DB | Relic names and effects |
| `{synergy_list}` | Community research | Known card/relic/character combos |
| `{today_date}` | Calendar | ISO date string |
