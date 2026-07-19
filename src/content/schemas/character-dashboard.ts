import { z } from 'astro:content';

// ─── Sub-schemas ───────────────────────────────────────────────────────────

const mechanicItemSchema = z.object({
  id: z.string(),
  icon: z.string(),
  name: z.string(),
  passive: z.string(),
  evoke: z.string().optional(),
  tip: z.string(),
});

const startingDeckCardSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  count: z.number().int().min(1),
  upgradePriority: z.number().int().min(1).optional(),
});

const startingDeckSchema = z.object({
  cards: z.array(startingDeckCardSchema),
});

const archetypeSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  keyCards: z.array(z.string()),
  keyRelics: z.array(z.string()),
  description: z.string().optional(),
});

const actStrategySchema = z.object({
  goal: z.string(),
  picks: z.array(z.string()).default([]),
  upgrade: z.string().optional(),
  elites: z.string().optional(),
});

const strategySchema = z.object({
  act1: actStrategySchema,
  act2: actStrategySchema,
  act3: actStrategySchema,
});

const pitfallSchema = z.object({
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium']),
  tip: z.string(),
});

const quickRefSchema = z.object({
  similarTo: z.array(z.string()).default([]),
  difficultyRating: z.number().int().min(1).max(5),
  powerCurve: z.array(z.string()).default([]),
  paceLabel: z.string().optional(),
});

const tierItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

const tierGroupSchema = z.object({
  tier: z.enum(['S', 'A', 'B', 'C', 'D', 'F']),
  label: z.string().optional(),
  items: z.array(tierItemSchema),
});

// ─── Main Schema ───────────────────────────────────────────────────────────

export const characterDashboardSchema = z.object({
  slug: z.string(),
  name: z.string(),
  game: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  tagline: z.string(),
  playstyle: z.string(),
  characterImage: z.string().optional(),
  role: z.string().optional(),
  mechanics: z.array(mechanicItemSchema).default([]),
  startingDeck: startingDeckSchema.optional(),
  archetypes: z.array(archetypeSchema).default([]),
  strategy: strategySchema.optional(),
  pitfalls: z.array(pitfallSchema).default([]),
  quickRef: quickRefSchema,
  isColorless: z.boolean().default(false),
  relicTiers: z.array(tierGroupSchema).default([]),
});

export type CharacterDashboard = z.infer<typeof characterDashboardSchema>;
