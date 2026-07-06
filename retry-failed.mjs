/**
 * retry-failed.mjs — 批次重跑 failed.log 裡記錄的失敗連結
 *
 * 用法：
 *   node retry-failed.mjs              # 重跑全部失敗紀錄
 *   node retry-failed.mjs --dry-run    # 只列出會重跑哪些，不實際執行
 *
 * 成功的項目會從 failed.log 移除；仍失敗的項目會留在 failed.log（並更新錯誤訊息）。
 */

import { clipUrl, saveToVault } from './clipCore.mjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const VAULT_PATH  = process.env.OBSIDIAN_VAULT_PATH;
const CLIP_FOLDER = process.env.OBSIDIAN_CLIP_FOLDER || 'Clippings';
const FAILED_LOG  = join(dirname(fileURLToPath(import.meta.url)), 'failed.log');
const DRY_RUN     = process.argv.includes('--dry-run');

if (!VAULT_PATH) {
  console.error('❌ 請先設定 .env（OBSIDIAN_VAULT_PATH）');
  process.exit(1);
}

if (!existsSync(FAILED_LOG)) {
  console.log('✅ 沒有 failed.log，沒有需要重跑的項目。');
  process.exit(0);
}

const lines = readFileSync(FAILED_LOG, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

if (lines.length === 0) {
  console.log('✅ failed.log 是空的，沒有需要重跑的項目。');
  process.exit(0);
}

console.log(`📋 找到 ${lines.length} 筆失敗紀錄`);

if (DRY_RUN) {
  lines.forEach((line, i) => {
    const { url, timestamp, error } = JSON.parse(line);
    console.log(`  ${i + 1}. [${timestamp}] ${url}\n     上次錯誤：${error}`);
  });
  console.log('\n（--dry-run 模式，未實際執行）');
  process.exit(0);
}

const stillFailed = [];
let successCount = 0;

for (const [i, line] of lines.entries()) {
  const entry = JSON.parse(line);
  console.log(`\n[${i + 1}/${lines.length}] 重跑：${entry.url}`);

  try {
    const { noteContent, fileName, meta } = await clipUrl(entry.url);
    const savedPath = saveToVault(VAULT_PATH, CLIP_FOLDER, fileName, noteContent);
    console.log(`  ✅ 成功 → ${savedPath}`);
    successCount++;
  } catch (err) {
    console.log(`  ❌ 仍失敗：${err.message}`);
    stillFailed.push(JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
      error: err.message,
      retriedAt: new Date().toISOString(),
    }));
  }
}

// 重寫 failed.log，只留仍失敗的項目
if (stillFailed.length > 0) {
  writeFileSync(FAILED_LOG, stillFailed.join('\n') + '\n', 'utf8');
} else {
  writeFileSync(FAILED_LOG, '', 'utf8');
}

console.log(`\n── 完成 ──`);
console.log(`✅ 成功：${successCount}`);
console.log(`❌ 仍失敗：${stillFailed.length}（保留在 failed.log）`);
