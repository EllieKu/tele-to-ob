/**
 * 測試 CLIP 圖片分類結果（不需啟動 bot、不連 Telegram）
 */

import { readFileSync } from 'fs';
import { extname } from 'path';
import { classifyImage } from './imageClassify.mjs';

const imagePath = process.argv[2];
const categoriesArg = process.argv[3];

if (!imagePath || !categoriesArg) {
  console.error('用法：node test-classify.mjs <圖片路徑> <分類1,分類2,...>');
  process.exit(1);
}

const categories = categoriesArg.split(',').map((s) => s.trim()).filter(Boolean);
const ext = extname(imagePath).slice(1).toLowerCase() || 'jpeg';
const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

console.log(`🖼️  圖片：${imagePath}`);
console.log(`🏷️  候選分類：${categories.join(', ')}\n`);

try {
  const buffer = readFileSync(imagePath);
  const category = await classifyImage(buffer, categories, mimeType);
  console.log(`✅ 判斷分類：${category}`);
} catch (err) {
  console.error(`❌ 失敗：${err.message}`);
  process.exit(1);
}
