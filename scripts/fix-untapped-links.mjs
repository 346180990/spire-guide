// Updates all untapped.gg markdown links to HTML with rel=nofollow
import { readFileSync, writeFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cardsDir = join(root, 'src', 'content', 'cards');

const files = (await readdir(cardsDir)).filter(f => f.endsWith('.mdx'));
console.log(`Processing ${files.length} card files...`);

// Pattern: - [在Untapped.gg查看](https://sts2.untapped.gg/en/cards/xxx)
const pattern = /- \[在Untapped\.gg查看\]\(https:\/\/sts2\.untapped\.gg\/en\/cards\/([^)]+)\)/g;

let updated = 0;

for (const file of files) {
  const filePath = join(cardsDir, file);
  const content = readFileSync(filePath, 'utf-8');

  if (!pattern.test(content)) continue;

  // Reset regex state
  pattern.lastIndex = 0;

  const newContent = content.replace(
    /- \[在Untapped\.gg查看\]\(https:\/\/sts2\.untapped\.gg\/en\/cards\/([^)]+)\)/g,
    '<a href="https://sts2.untapped.gg/en/cards/$1" rel="nofollow noopener" target="_blank">View stats on Untapped.gg</a>'
  );

  writeFileSync(filePath, newContent, 'utf-8');
  updated++;
}

console.log(`Updated ${updated} files.`);
