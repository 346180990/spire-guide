/**
 * parser.mjs — Obsidian vault file parser
 *
 * Parses the three distinct file formats found in the STS2 Obsidian vault:
 * 1. Card files: --- frontmatter with :: syntax
 * 2. Relic/Potion files: inline blockquote + yaml code block metadata
 * 3. Mechanic files: --- frontmatter with :: syntax (different fields)
 * 4. Character/Enemy files: free-form markdown with Chinese headers
 */

import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import {
  CHARACTER_MAP, RARITY_MAP, TYPE_MAP,
  DIRECTORY_TYPE_MAP, toSlug, parseWikiLink, translate,
} from './mappings.mjs';

// ─── Frontmatter Parser ─────────────────────────────────────────────────────

/**
 * Parse Obsidian-format frontmatter with `key:: value` syntax.
 * Handles quoted values, WikiLinks, and multi-line values.
 *
 * @param {string} content - Raw file content
 * @returns {{ data: Record<string, any>, bodyStart: number }}
 */
export function parseObsidianFrontmatter(content) {
  const data = {};

  // Check for --- delimited frontmatter (cards, mechanics)
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  let bodyStart = 0;

  if (frontmatterMatch) {
    // Standard --- frontmatter found
    const fmLines = frontmatterMatch[1].split('\n');
    for (const line of fmLines) {
      const parsed = parseFrontmatterLine(line);
      if (parsed) {
        data[parsed.key] = parsed.value;
      }
    }
    bodyStart = frontmatterMatch.index + frontmatterMatch[0].length;
  } else {
    // Try inline :: syntax in body (relics, potions inside ```yaml blocks)
    const yamlBlockMatch = content.match(/```yaml\s*\n([\s\S]*?)\n```/);
    if (yamlBlockMatch) {
      const yamlLines = yamlBlockMatch[1].split('\n');
      for (const line of yamlLines) {
        const parsed = parseFrontmatterLine(line);
        if (parsed) {
          data[parsed.key] = parsed.value;
        }
      }
    }

    // Also parse blockquote metadata for relics/potions
    // Format: > **稀有度**: [[罕见]] | **所属**: [[无色]]
    const blockquoteMatch = content.match(/^>\s*\*\*([^*]+)\*\*:\s*(.+?)(?:\s*\|\s*\*\*([^*]+)\*\*:\s*(.+))?\s*$/m);
    if (blockquoteMatch) {
      const pairs = [];
      pairs.push([blockquoteMatch[1], blockquoteMatch[2]]);
      if (blockquoteMatch[3]) {
        pairs.push([blockquoteMatch[3], blockquoteMatch[4]]);
      }
      for (const [label, rawValue] of pairs) {
        const value = stripWikiLink(rawValue.trim());
        const labelNorm = label.trim();
        if (labelNorm === '稀有度') {
          data.rarity = value;
        } else if (labelNorm === '所属') {
          data.character = value;
        }
      }
    }

    bodyStart = 0; // Process entire body
  }

  // Clean WikiLink values in all fields
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      data[key] = stripWikiLink(value);
    }
  }

  return { data, bodyStart };
}

/**
 * Parse a single `key:: value` line from Obsidian frontmatter.
 * Returns null if the line doesn't match the pattern.
 */
function parseFrontmatterLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  const match = trimmed.match(/^(\w+)::\s*(.+)$/);
  if (!match) return null;

  const key = match[1];
  let rawValue = match[2].trim();

  // Remove surrounding quotes
  if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
    rawValue = rawValue.slice(1, -1);
  }

  // Parse value types
  let value = rawValue;

  // Array: ["item1", "item2"] — but NOT WikiLinks [[page|display]]
  if (rawValue.startsWith('[') && rawValue.endsWith(']') && !rawValue.startsWith('[[')) {
    try {
      value = JSON.parse(rawValue);
    } catch {
      value = rawValue.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    value = Number(rawValue);
  }

  return { key, value };
}

// ─── WikiLink Handling ──────────────────────────────────────────────────────

/**
 * Strip WikiLink brackets from a string, keeping the display text.
 * "[[铁甲战士]]" → "铁甲战士"
 * "[[Shiv|Shivs]]" → "Shivs"
 */
export function stripWikiLink(text) {
  if (typeof text !== 'string') return text;
  // Remove empty WikiLinks `[[]]` entirely
  text = text.replace(/\[\[\]\]/g, '');
  // Replace [[target]] or [[target|display]] with display text
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, display) => {
    return display || target;
  });
}

/**
 * Resolve WikiLinks in body text to our site's URL structure.
 * "[[铁甲战士]]" → "[Ironclad](/games/slay-the-spire-2/characters/ironclad/)"
 * "[[Shiv|Shivs]]" → "[Shivs](/games/slay-the-spire-2/cards/shiv/)"
 *
 * @param {string} text - Body text with WikiLinks
 * @param {string} game - Game slug for URL prefix
 * @param {string} context - Current entity type for resolving relative links
 * @returns {string} Text with WikiLinks resolved to markdown links
 */
export function resolveWikiLinks(text, game = 'slay-the-spire-2', context = 'card') {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, display) => {
    const cleanTarget = target.trim();
    const cleanDisplay = display ? display.trim() : cleanTarget;

    // Try to translate Chinese target to English
    const { translated, found } = translate(cleanTarget, 'character');
    const englishTarget = found ? translated : cleanTarget;

    // Determine URL based on what the target is
    const slug = toSlug(englishTarget);
    let url;

    // Check if it's a character reference
    if (CHARACTER_MAP[cleanTarget]) {
      url = `/games/${game}/characters/${toSlug(CHARACTER_MAP[cleanTarget])}/`;
    }
    // Check if it's a known page
    else if (DIRECTORY_TYPE_MAP[cleanTarget]) {
      const type = DIRECTORY_TYPE_MAP[cleanTarget];
      url = `/games/${game}/${type}s/`;
    }
    // Default to card reference (most common cross-link)
    else {
      url = `/games/${game}/cards/${slug}/`;
    }

    return `[${cleanDisplay}](${url})`;
  });
}

// ─── Body Content Extraction ────────────────────────────────────────────────

/**
 * Extract and clean body content from a vault markdown file.
 * Strips frontmatter, dataview blocks, and translates Chinese section headers.
 *
 * @param {string} content - Raw file content
 * @param {number} bodyStart - Character offset where body begins
 * @returns {string} Cleaned body content
 */
export function extractBodyContent(content, bodyStart = 0) {
  let body = content.slice(bodyStart).trim();

  // Remove dataview code blocks (they query the vault — not useful in our site)
  body = body.replace(/```dataview\s*\n[\s\S]*?\n```/g, '');

  // Remove Obsidian tags line (they're already in frontmatter)
  body = body.replace(/^#[一-鿿\w]+(?:\s+#[一-鿿\w]+)*\s*$/gm, '');

  // Translate Chinese section headers
  body = body.replace(/^## (.+)$/gm, (_, heading) => {
    const { translated } = translate(heading.trim(), 'section');
    return `## ${translated}`;
  });

  // Remove "返回 [[...]]" navigation lines (we have breadcrumbs)
  body = body.replace(/^\*返回.+\*$/gm, '');
  body = body.replace(/^\[.+\]\(.+\)$/gm, ''); // Remove standalone external links in nav context

  // Clean up excessive blank lines
  body = body.replace(/\n{3,}/g, '\n\n');

  return body.trim();
}

// ─── Entity Type Detection ──────────────────────────────────────────────────

/**
 * Detect the entity type based on the source file path within the vault.
 *
 * @param {string} filePath - Path to the vault source file
 * @returns {string} Entity type: 'card', 'relic', 'potion', 'mechanic', 'enemy', 'character', 'strategy', 'navigation'
 */
export function detectEntityType(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.includes('/02-卡牌/') || normalized.includes('/02-')) return 'card';
  if (normalized.includes('/03-遗物/') || normalized.includes('/03-')) return 'relic';
  if (normalized.includes('/04-药水/') || normalized.includes('/04-')) return 'potion';
  if (normalized.includes('/06-机制/') || normalized.includes('/06-')) return 'mechanic';
  if (normalized.includes('/07-敌人/') || normalized.includes('/07-')) return 'enemy';
  if (normalized.includes('/01-角色/') || normalized.includes('/01-')) return 'character';
  if (normalized.includes('/08-攻略/') || normalized.includes('/08-')) return 'strategy';
  if (normalized.includes('/05-导航/') || normalized.includes('/05-')) return 'navigation';

  return 'unknown';
}

/**
 * Detect card type from file path (Attack/Skill/Power).
 */
export function detectCardType(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/攻击牌/')) return 'Attack';
  if (normalized.includes('/技能牌/')) return 'Skill';
  if (normalized.includes('/能力牌/')) return 'Power';
  return null;
}

// ─── Full File Parser ───────────────────────────────────────────────────────

/**
 * Parse a complete vault markdown file and return structured data.
 *
 * @param {string} filePath - Absolute path to the vault file
 * @returns {Promise<{ entityType: string, metadata: object, body: string, rawContent: string }>}
 */
export async function parseVaultFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const entityType = detectEntityType(filePath);
  const cardType = detectCardType(filePath);
  const fileName = basename(filePath, '.md');

  const { data, bodyStart } = parseObsidianFrontmatter(content);

  // Build metadata object
  const metadata = {
    name: data.name || fileName,
    slug: toSlug(data.name || fileName),
    game: 'slay-the-spire-2',
  };

  // Card-specific fields
  if (entityType === 'card') {
    if (cardType) metadata.type = cardType;
    if (data.type) {
      const { translated } = translate(stripWikiLink(data.type), 'type');
      metadata.type = translated;
    }
    if (data.rarity !== undefined) {
      const cleaned = stripWikiLink(data.rarity);
      const { translated } = translate(cleaned || '初始', 'rarity');
      metadata.rarity = translated || 'Starter';
    }
    if (data.character) {
      const { translated, found } = translate(stripWikiLink(data.character), 'character');
      metadata.character = found ? translated : 'Colorless';
    }
    if (data.energy_cost !== undefined) metadata.energy_cost = data.energy_cost;
    if (data.aliases && Array.isArray(data.aliases)) metadata.aliases = data.aliases;
  }

  // Relic-specific fields
  if (entityType === 'relic' || entityType === 'potion') {
    metadata.name = data.name || fileName;
    metadata.slug = toSlug(data.name || fileName);
    if (data.rarity !== undefined) {
      const cleaned = stripWikiLink(data.rarity);
      const { translated } = translate(cleaned || '普通', 'rarity');
      metadata.rarity = translated || 'Common';
    }
    if (data.character) {
      const { translated, found } = translate(stripWikiLink(data.character), 'character');
      if (found && translated !== 'Colorless') {
        metadata.character = translated;
      }
    }
  }

  // Mechanic-specific fields
  if (entityType === 'mechanic') {
    metadata.name = data.english_name || data.name || fileName;
    metadata.slug = toSlug(data.english_name || fileName);
    if (data.aliases && Array.isArray(data.aliases)) metadata.aliases = data.aliases;
  }

  // Extract and clean body content
  let body = extractBodyContent(content, bodyStart);

  // Resolve WikiLinks in body
  body = resolveWikiLinks(body, metadata.game, entityType);

  return { entityType, metadata, body, rawContent: content };
}
