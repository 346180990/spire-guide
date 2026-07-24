/**
 * remark-auto-link.mjs — Remark plugin that auto-links card and relic names
 * in guide article body text to their detail pages.
 *
 * Reads entity data from a cached JSON map (src/data/entity-url-map.json),
 * generating it on first run if missing.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { visit } from 'unist-util-visit';

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(process.cwd());
const CACHE_DIR = join(PROJECT_ROOT, 'src', 'data');
const CACHE_PATH = join(CACHE_DIR, 'entity-url-map.json');
const CARDS_DIR = join(PROJECT_ROOT, 'src', 'content', 'cards');
const RELICS_DIR = join(PROJECT_ROOT, 'src', 'content', 'relics');

// ─── Frontmatter Parser (no dependencies) ─────────────────────────────────────

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

// ─── Entity Map Builder ───────────────────────────────────────────────────────

function scanDirectory(dir, urlPrefix) {
  const map = {};
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.mdx'));
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const fm = parseFrontmatter(content);
      if (fm.name && fm.slug) {
        map[fm.name] = { url: `${urlPrefix}${fm.slug}/` };
      }
    }
  } catch {
    // Directory may not exist — return empty map
  }
  return map;
}

function generateEntityMap() {
  const cards = scanDirectory(CARDS_DIR, '/games/slay-the-spire-2/cards/');
  const relics = scanDirectory(RELICS_DIR, '/games/slay-the-spire-2/relics/');

  const combined = { ...cards, ...relics };

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  writeFileSync(CACHE_PATH, JSON.stringify(combined, null, 2), 'utf-8');

  return combined;
}

function loadEntityMap() {
  try {
    if (existsSync(CACHE_PATH)) {
      const raw = readFileSync(CACHE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // Cache is missing or corrupt — regenerate
  }
  return generateEntityMap();
}

// ─── Regex Helpers ────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Match Finder ─────────────────────────────────────────────────────────────

function findMatches(text, entityMap, sortedNames) {
  const lowerText = text.toLowerCase();

  const candidates = sortedNames.filter((name) =>
    lowerText.includes(name.toLowerCase()),
  );

  if (candidates.length === 0) return [];

  const matches = [];

  for (const name of candidates) {
    const escaped = escapeRegex(name);
    const regex = new RegExp(escaped, 'gi');

    let m;
    while ((m = regex.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      const overlaps = matches.some(
        (existing) =>
          (start >= existing.start && start < existing.end) ||
          (end > existing.start && end <= existing.end) ||
          (start <= existing.start && end >= existing.end),
      );

      if (!overlaps) {
        matches.push({ start, end, name, url: entityMap[name].url });
      }
    }
  }

  matches.sort((a, b) => a.start - b.start);

  return matches;
}

// ─── Node Builder ─────────────────────────────────────────────────────────────

function autoLinkNodes(value, entityMap, sortedNames) {
  const matches = findMatches(value, entityMap, sortedNames);

  if (matches.length === 0) {
    return [{ type: 'text', value }];
  }

  const nodes = [];
  let pos = 0;

  for (const m of matches) {
    if (m.start > pos) {
      nodes.push({ type: 'text', value: value.slice(pos, m.start) });
    }
    nodes.push({
      type: 'link',
      url: m.url,
      children: [{ type: 'text', value: m.name }],
    });
    pos = m.end;
  }

  if (pos < value.length) {
    nodes.push({ type: 'text', value: value.slice(pos) });
  }

  return nodes;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const LINKABLE_PARENTS = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'tableCell',
  'emphasis',
  'strong',
  'delete',
]);

export default function remarkAutoLink() {
  const entityMap = loadEntityMap();

  const sortedNames = Object.keys(entityMap)
    .filter((name) => name.length >= 3)
    .sort((a, b) => b.length - a.length);

  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (index === null || parent === null) return;

      if (
        parent.type === 'link' ||
        parent.type === 'inlineCode' ||
        parent.type === 'code'
      ) {
        return;
      }

      if (!LINKABLE_PARENTS.has(parent.type)) {
        return;
      }

      const nodes = autoLinkNodes(node.value, entityMap, sortedNames);

      if (nodes.length === 1 && nodes[0].type === 'text') return;

      parent.children.splice(index, 1, ...nodes);
    });
  };
}
