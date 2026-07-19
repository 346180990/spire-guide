#!/usr/bin/env node
/**
 * convert-vault.mjs — Obsidian Vault → Astro MDX conversion pipeline
 *
 * Reads STS2 Obsidian vault files, parses :: frontmatter, translates
 * Chinese metadata, resolves WikiLinks, and writes clean MDX files.
 *
 * Usage:
 *   node scripts/convert-vault.mjs                    # convert all
 *   node scripts/convert-vault.mjs --dry-run          # validate, no writes
 *   node scripts/convert-vault.mjs --type cards       # cards only
 *   node scripts/convert-vault.mjs --type relics      # relics only
 *   node scripts/convert-vault.mjs --force            # overwrite all
 *   node scripts/convert-vault.mjs --verbose          # per-file logging
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, basename, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVaultFile, detectEntityType, detectCardType } from './parser.mjs';
import {
  CHARACTER_MAP, RARITY_MAP, TYPE_MAP,
  toSlug, translate, CHARACTER_STATS,
} from './mappings.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VAULT = join(ROOT, 'vault-source');
const CONTENT = join(ROOT, 'src', 'content');

// CLI args
const args = process.argv.slice(2);
const FLAGS = {
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  verbose: args.includes('--verbose'),
  type: null,
};
const SINGULAR_MAP = {
  cards: 'card', relics: 'relic', potions: 'potion',
  mechanics: 'mechanic', enemies: 'enemy',
};
const typeIdx = args.indexOf('--type');
if (typeIdx !== -1 && typeIdx + 1 < args.length) {
  const raw = args[typeIdx + 1];
  FLAGS.type = SINGULAR_MAP[raw] || raw;
}

// Pluralization map for output directories
const PLURAL_MAP = {
  card: 'cards',
  relic: 'relics',
  potion: 'potions',
  mechanic: 'mechanics',
  enemy: 'enemies',
};
const stats = { total: 0, success: 0, warnings: 0, errors: 0, skipped: 0 };
const unknownTerms = new Set();
const slugCounts = new Map(); // For duplicate detection

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══ Obsidian Vault → MDX Converter ═══\n');

  if (FLAGS.dryRun) console.log('[DRY RUN] No files will be written.\n');
  if (FLAGS.type) console.log(`Filter: --type ${FLAGS.type}\n`);

  const entityTypes = FLAGS.type
    ? [FLAGS.type]
    : ['card', 'relic', 'potion', 'mechanic', 'enemy'];

  for (const type of entityTypes) {
    const files = await findVaultFiles(type);
    console.log(`\n── ${type.toUpperCase()} (${files.length} files) ──`);
    for (const file of files) {
      await processFile(file, type);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════');
  console.log(`Total:   ${stats.total} files`);
  console.log(`Success: ${stats.success}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Warnings: ${stats.warnings}`);
  console.log(`Errors:  ${stats.errors}`);

  if (unknownTerms.size > 0) {
    console.log(`\n⚠ Unknown Chinese terms (${unknownTerms.size}):`);
    for (const term of [...unknownTerms].sort().slice(0, 50)) {
      console.log(`  - ${term}`);
    }
    if (unknownTerms.size > 50) {
      console.log(`  ... and ${unknownTerms.size - 50} more`);
    }
  }

  if (stats.errors > 0) process.exit(1);
}

// ─── File Discovery ─────────────────────────────────────────────────────────

/**
 * Find all relevant vault files for an entity type.
 */
async function findVaultFiles(type) {
  const files = [];
  const dirs = {
    card: [
      join(VAULT, '02-卡牌', '攻击牌'),
      join(VAULT, '02-卡牌', '技能牌'),
      join(VAULT, '02-卡牌', '能力牌'),
    ],
    relic: [join(VAULT, '03-遗物')],
    potion: [join(VAULT, '04-药水')],
    mechanic: [join(VAULT, '06-机制')],
    enemy: [join(VAULT, '07-敌人')],
  };

  const sourceDirs = dirs[type] || [];
  for (const dir of sourceDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(join(dir, entry.name));
        }
      }
    } catch {
      console.warn(`  Directory not found: ${dir}`);
    }
  }
  return files;
}

// ─── File Processing ────────────────────────────────────────────────────────

/**
 * Process a single vault file: parse, translate, validate, write MDX.
 */
async function processFile(filePath, type) {
  stats.total++;
  const relPath = relative(VAULT, filePath);

  try {
    // Parse the vault file
    const { entityType, metadata, body } = await parseVaultFile(filePath);

    // Handle duplicate slugs
    let slug = metadata.slug;
    const existing = slugCounts.get(slug);
    if (existing !== undefined) {
      // Duplicate! Disambiguate with character suffix
      const char = metadata.character ? toSlug(metadata.character) : 'unknown';
      slug = `${slug}-${char}`;
      slugCounts.set(metadata.slug, existing + 1);
      if (!FLAGS.verbose) {
        console.warn(`  ⚠ Duplicate slug: ${metadata.slug} → ${slug} (${relPath})`);
      }
      stats.warnings++;
    } else {
      slugCounts.set(metadata.slug, 1);
    }
    metadata.slug = slug;

    // Add unknown terms to tracking set
    for (const [key, val] of Object.entries(metadata)) {
      if (typeof val === 'string' && /[一-鿿]/.test(val)) {
        unknownTerms.add(val);
      }
    }

    // Generate MDX content
    const mdx = generateMdx(type, { ...metadata, slug }, body);

    // Determine output path
    const outputDir = join(CONTENT, PLURAL_MAP[type] || `${type}s`);
    const outputPath = join(outputDir, `${slug}.mdx`);

    // Skip if newer and not forced
    if (!FLAGS.force) {
      try {
        const existingStat = await stat(outputPath);
        const sourceStat = await stat(filePath);
        if (existingStat.mtime > sourceStat.mtime) {
          if (FLAGS.verbose) console.log(`  - SKIP ${slug} (up to date)`);
          stats.skipped++;
          return;
        }
      } catch { /* File doesn't exist, proceed */ }
    }

    if (FLAGS.dryRun) {
      console.log(`  ✓ [DRY] ${slug}.mdx ← ${relPath}`);
      stats.success++;
      return;
    }

    // Write file
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, mdx, 'utf-8');

    if (FLAGS.verbose) {
      console.log(`  ✓ ${slug}.mdx ← ${relPath}`);
    } else if (stats.total % 50 === 0) {
      process.stdout.write(`  ${stats.total} files processed...\r`);
    }

    stats.success++;
  } catch (err) {
    console.error(`  ✗ ERROR ${relPath}: ${err.message}`);
    stats.errors++;
  }
}

// ─── MDX Generation ─────────────────────────────────────────────────────────

/**
 * Generate a clean MDX file from parsed vault data.
 */
function generateMdx(type, metadata, body) {
  switch (type) {
    case 'card': return generateCardMdx(metadata, body);
    case 'relic': return generateRelicMdx(metadata, body);
    case 'potion': return generatePotionMdx(metadata, body);
    case 'mechanic': return generateMechanicMdx(metadata, body);
    case 'enemy': return generateEnemyMdx(metadata, body);
    default: return `---\n# Unknown type\n---\n\n${body}`;
  }
}

/**
 * Card MDX: Standard --- frontmatter with full schema.
 */
function generateCardMdx(m, body) {
  const frontmatter = [
    '---',
    `name: "${escapeYaml(m.name)}"`,
    `slug: "${m.slug}"`,
    `game: "${m.game}"`,
    `type: "${m.type || 'Skill'}"`,
    `character: "${m.character || 'Colorless'}"`,
    `rarity: "${m.rarity || 'Common'}"`,
    `phase: "research"`,
  ];
  if (m.energy_cost !== undefined) frontmatter.push(`energy_cost: ${m.energy_cost}`);
  if (m.aliases && m.aliases.length > 0) {
    frontmatter.push(`aliases: [${m.aliases.map(a => `"${a}"`).join(', ')}]`);
  }
  frontmatter.push('---');

  return [...frontmatter, '', body.trim(), ''].join('\n');
}

/**
 * Relic MDX: Standard --- frontmatter with effect field.
 */
function generateRelicMdx(m, body) {
  const frontmatter = [
    '---',
    `name: "${escapeYaml(m.name)}"`,
    `slug: "${m.slug}"`,
    `game: "${m.game}"`,
    `rarity: "${m.rarity || 'Common'}"`,
    `phase: "research"`,
  ];
  if (m.character) frontmatter.push(`character: "${m.character}"`);
  frontmatter.push('---');
  return [...frontmatter, '', body.trim(), ''].join('\n');
}

/**
 * Potion MDX: Same structure as relic.
 */
function generatePotionMdx(m, body) {
  const frontmatter = [
    '---',
    `name: "${escapeYaml(m.name)}"`,
    `slug: "${m.slug}"`,
    `game: "${m.game}"`,
    `rarity: "${m.rarity || 'Common'}"`,
    `phase: "research"`,
  ];
  if (m.character) frontmatter.push(`character: "${m.character}"`);
  frontmatter.push('---');
  return [...frontmatter, '', body.trim(), ''].join('\n');
}

/**
 * Mechanic MDX: Keyword glossary page.
 */
function generateMechanicMdx(m, body) {
  const frontmatter = [
    '---',
    `name: "${escapeYaml(m.name)}"`,
    `slug: "${m.slug}"`,
    `game: "${m.game}"`,
    `phase: "research"`,
  ];
  if (m.aliases && m.aliases.length > 0) {
    frontmatter.push(`aliases: [${m.aliases.map(a => `"${a}"`).join(', ')}]`);
  }
  frontmatter.push('---');
  return [...frontmatter, '', body.trim(), ''].join('\n');
}

/**
 * Enemy MDX: Bestiary entry.
 */
function generateEnemyMdx(m, body) {
  const frontmatter = [
    '---',
    `name: "${escapeYaml(m.name)}"`,
    `slug: "${m.slug}"`,
    `game: "${m.game}"`,
    `phase: "research"`,
  ];
  if (m.act) frontmatter.push(`act: ${m.act}`);
  if (m.is_elite) frontmatter.push('is_elite: true');
  if (m.is_boss) frontmatter.push('is_boss: true');
  frontmatter.push('---');
  return [...frontmatter, '', body.trim(), ''].join('\n');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeYaml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildProps(obj, keys) {
  const parts = [];
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const val = typeof obj[key] === 'string' ? `"${escapeYaml(obj[key])}"` : obj[key];
      parts.push(`${key}={${val}}`);
    }
  }
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

// ─── Run ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
