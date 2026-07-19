import fs from 'fs';
import path from 'path';

const dir = 'D:/project/gnglue/src/content/mechanics';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mdx'));
let count = 0;

files.forEach(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  if (content.includes('description:')) return; // already has one

  const match = content.match(/## Description\r?\n\r?\n(.+?)\r?\n/);
  if (match) {
    let desc = match[1].replace(/\*\*/g, '').replace(/"/g, '\\"');
    // Truncate long descriptions
    if (desc.length > 120) desc = desc.substring(0, 117) + '...';

    const updated = content.replace(
      /(phase: .+\n)/,
      `$1description: "${desc}"\n`
    );
    fs.writeFileSync(path.join(dir, f), updated);
    count++;
    console.log(`  ${f}: ${desc}`);
  }
});

console.log(`\nAdded descriptions to ${count} mechanics`);
