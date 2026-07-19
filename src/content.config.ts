import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { characterDashboardSchema } from './content/schemas/character-dashboard';

// ─── Existing Schemas ───────────────────────────────────────────────────────

const gameMetadataSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  coverImage: z.string().optional(),
  releaseDate: z.string(),
  active: z.boolean().default(true),
  steamAppId: z.string().optional(),
  heroImage: z.string().optional(),
  colorScheme: z.object({
    primary: z.string().optional(),
    surface: z.string().optional(),
    accent: z.string().optional(),
  }).optional(),
  characters: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    role: z.string(),
    description: z.string(),
    image: z.string().optional(),
  })).default([]),
});

const guideSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishDate: z.date(),
  updatedDate: z.date().optional(),
  game: z.string(),
  character: z.string().optional(),
  guideType: z.enum(['build', 'tier-list', 'beginner', 'advanced', 'character-overview', 'roadmap']),
  phase: z.enum(['research', 'verified', 'authoritative']).default('research'),
  reviewed: z.boolean().default(false),
  reviewedDate: z.date().optional(),
  relatedGuides: z.array(z.string()).default([]),
  adSlots: z.array(z.enum(['in-content-1', 'in-content-2', 'after-content'])).default(['in-content-1', 'after-content']),
  featuredImage: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  coreCards: z.array(z.string()).default([]),
  keyRelics: z.array(z.string()).default([]),
});

// ─── New Reference Schemas ──────────────────────────────────────────────────

const cardSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  image: z.string().optional(),
  type: z.enum(['Attack', 'Skill', 'Power', 'Status', 'Curse']).default('Skill'),
  character: z.string().default('Colorless'),
  rarity: z.enum(['Common', 'Uncommon', 'Rare', 'Starter', 'Special', 'Curse']).default('Common'),
  energy_cost: z.union([z.number().int().min(0), z.literal('X')]).optional(),
  upgraded_energy_cost: z.union([z.number().int().min(0), z.literal('X')]).optional(),
  effect: z.string().optional(),
  upgraded_effect: z.string().optional(),
  phase: z.enum(['research', 'verified', 'authoritative']).default('research'),
  aliases: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  related_cards: z.array(z.string()).default([]),
});

const relicSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  image: z.string().optional(),
  rarity: z.enum(['Common', 'Uncommon', 'Rare', 'Boss', 'Starter', 'Special', 'Event', 'Shop']).default('Common'),
  character: z.string().optional(),
  effect: z.string().optional(),
  flavor_text: z.string().optional(),
  phase: z.enum(['research', 'verified', 'authoritative']).default('research'),
});

const potionSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  image: z.string().optional(),
  rarity: z.enum(['Common', 'Uncommon', 'Rare', 'Event', 'Token']).default('Common'),
  character: z.string().optional(),
  effect: z.string().optional(),
  phase: z.enum(['research', 'verified', 'authoritative']).default('research'),
});

const mechanicSchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  description: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  related_cards: z.array(z.string()).default([]),
  related_relics: z.array(z.string()).default([]),
  phase: z.enum(['research', 'verified', 'authoritative']).default('research'),
});

const enemySchema = z.object({
  name: z.string(),
  slug: z.string(),
  game: z.string(),
  image: z.string().optional(),
  act: z.number().int().min(1).max(4).optional(),
  hp_range: z.string().optional(),
  moves: z.array(z.object({
    name: z.string(),
    effect: z.string(),
    damage: z.string().optional(),
  })).default([]),
  weakness: z.string().optional(),
  is_elite: z.boolean().default(false),
  is_boss: z.boolean().default(false),
  phase: z.enum(['research', 'verified', 'authoritative']).default('research'),
});

// ─── Collections ────────────────────────────────────────────────────────────

export const collections = {
  // Existing
  games: defineCollection({
    loader: glob({ pattern: '**/*.yaml', base: './src/content/games' }),
    schema: gameMetadataSchema,
  }),
  guides: defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/guides' }),
    schema: guideSchema,
  }),
  // New reference collections
  cards: defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/cards' }),
    schema: cardSchema,
  }),
  relics: defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/relics' }),
    schema: relicSchema,
  }),
  potions: defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/potions' }),
    schema: potionSchema,
  }),
  mechanics: defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/mechanics' }),
    schema: mechanicSchema,
  }),
  enemies: defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/enemies' }),
    schema: enemySchema,
  }),
  characters: defineCollection({
    loader: glob({ pattern: '**/*.yaml', base: './src/content/characters' }),
    schema: characterDashboardSchema,
  }),
};
