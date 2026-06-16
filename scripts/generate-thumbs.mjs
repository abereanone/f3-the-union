import sharp from 'sharp';
import { readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const mediaDir = join(__dirname, '..', 'media');
const thumbDir = join(mediaDir, 'thumbs');

const THUMB_WIDTH = 200;
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

if (!existsSync(thumbDir)) {
  await mkdir(thumbDir);
}

const files = await readdir(mediaDir);
const images = files.filter(f => EXTENSIONS.has(extname(f).toLowerCase()));

for (const file of images) {
  const input = join(mediaDir, file);
  const output = join(thumbDir, file);
  try {
    await sharp(input)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toFile(output);
    console.log(`✓ ${file}`);
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
  }
}

console.log(`\nDone — ${images.length} thumbnails written to media/thumbs/`);
