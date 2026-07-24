/**
 * Generate entity-url-map.json cache from card + relic MDX files.
 * Run this script whenever cards or relics are added/renamed.
 *
 * Usage: node scripts/generate-entity-map.js
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd());
const CACHE_DIR = join(PROJECT_ROOT, 'src', 'data');
const CACHE_PATH = join(CACHE_DIR, 'entity-url-map.json');

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const result = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      let value = kv[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[kv[1]] = value;
    }
  }

  return result;
}

function scanDirectory(dir, urlPrefix) {
  const map = {};
  if (!existsSync(dir)) return map;

  const files = readdirSync(dir).filter((f) => f.endsWith('.mdx'));
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    const fm = parseFrontmatter(content);
    if (fm.name && fm.slug) {
      map[fm.name] = { url: `${urlPrefix}${fm.slug}/` };
    }
  }

  return map;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

console.log('🔍 Scanning cards and relics...');

const cards = scanDirectory(
  join(PROJECT_ROOT, 'src', 'content', 'cards'),
  '/games/slay-the-spire-2/cards/',
);
const relics = scanDirectory(
  join(PROJECT_ROOT, 'src', 'content', 'relics'),
  '/games/slay-the-spire-2/relics/',
);

const combined = { ...cards, ...relics };

if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}
writeFileSync(CACHE_PATH, JSON.stringify(combined, null, 2), 'utf-8');

console.log(`✅ Entity map cached: ${Object.keys(cards).length} cards + ${Object.keys(relics).length} relics → ${CACHE_PATH}`);
