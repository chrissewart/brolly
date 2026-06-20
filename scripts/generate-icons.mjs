import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync(new URL('../icons/icon.svg', import.meta.url));

await Promise.all([
  sharp(svg).resize(192).png().toFile('icons/icon-192.png'),
  sharp(svg).resize(512).png().toFile('icons/icon-512.png'),
]);

console.log('icons/icon-192.png and icons/icon-512.png written');
