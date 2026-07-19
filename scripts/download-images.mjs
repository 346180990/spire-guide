// Downloads all hotlinked images from Fextralife CDN to local public/images/
// and updates MDX frontmatter to use local paths
import { readFileSync, writeFileSync, mkdirSync, createWriteStream, statSync, unlinkSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public', 'images');

const collections = {
  cards: 'cards',
  relics: 'relics',
  potions: 'potions',
};

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function downloadFile(url, destPath, retries = 3) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(destPath);
    protocol.get(url, { timeout: 30000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        try { unlinkSync(destPath); } catch {}
        downloadFile(response.headers.location, destPath, retries).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        try { unlinkSync(destPath); } catch {}
        if (retries > 0) {
          setTimeout(() => downloadFile(url, destPath, retries - 1).then(resolve).catch(reject), 1000);
        } else {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        }
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', (err) => {
      file.close();
      try { unlinkSync(destPath); } catch {}
      if (retries > 0) {
        setTimeout(() => downloadFile(url, destPath, retries - 1).then(resolve).catch(reject), 1000);
      } else {
        reject(err);
      }
    });
  });
}

async function processCollection(name, subdir) {
  const contentDir = join(root, 'src', 'content', name);
  const imageDir = join(publicDir, subdir);
  ensureDir(imageDir);

  const files = (await readdir(contentDir)).filter(f => f.endsWith('.mdx'));
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing ${name}/ (${files.length} files)`);
  console.log(`${'='.repeat(60)}`);

  let downloaded = 0, skipped = 0, failed = 0;
  const CONCURRENCY = 20;
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) break;
      const filePath = join(contentDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const imageMatch = content.match(/^image:\s*"([^"]+)"/m);

      if (!imageMatch) { skipped++; continue; }
      const imageUrl = imageMatch[1];
      if (imageUrl.startsWith('/images/')) { skipped++; continue; }

      const urlParts = imageUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      const localPath = join(imageDir, filename);
      const localUrl = `/images/${subdir}/${filename}`;

      try {
        let needsDownload = true;
        try { if (statSync(localPath).size > 500) needsDownload = false; } catch {}
        if (needsDownload) {
          await downloadFile(imageUrl, localPath);
        }
        const updatedContent = content.replace(
          /^image:\s*"https:\/\/static0\.fextralifeimages\.com\/file\/slaythespire2\/[^"]+"/m,
          `image: "${localUrl}"`
        );
        writeFileSync(filePath, updatedContent, 'utf-8');
        downloaded++;
        if (downloaded % 50 === 0) console.log(`  ${name}: ${downloaded} done...`);
      } catch (err) {
        console.log(`  FAILED ${file}: ${err.message}`);
        failed++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log(`  ${name}: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
  return { downloaded, skipped, failed };
}

async function main() {
  console.log('Downloading images from Fextralife CDN to local...');
  let total = { downloaded: 0, skipped: 0, failed: 0 };
  for (const [collection, subdir] of Object.entries(collections)) {
    const r = await processCollection(collection, subdir);
    total.downloaded += r.downloaded;
    total.skipped += r.skipped;
    total.failed += r.failed;
  }
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TOTAL: ${total.downloaded} downloaded, ${total.skipped} skipped, ${total.failed} failed`);
}

main().catch(console.error);
