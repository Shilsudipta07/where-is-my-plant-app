import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const output = 'public/assets/plants';
await mkdir(output, { recursive: true });
for (const file of await readdir('src/assets/images')) {
  if (!/^(plant_|hero_).*\.jpg$/.test(file)) continue;
  await sharp(path.join('src/assets/images', file))
    .rotate().resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(output, file.replace(/\.jpg$/, '.webp')));
}
console.log('Optimized botanical images as WebP.');
