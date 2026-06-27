/**
 * test-clip.mjs — 測試單一 URL 的抓取/解析結果（不經過 Telegram、不寫入 Vault）
 *
 * 用法：
 *   node test-clip.mjs <URL>            # 預覽解析結果（meta + 內容前段）
 *   node test-clip.mjs <URL> --full     # 印出完整 Markdown
 *   node test-clip.mjs <URL> --save     # 另存一份到 scratchpad/輸出檔，方便用編輯器看
 */

import { clipUrl } from './clipCore.mjs';
import { writeFileSync } from 'fs';

const url  = process.argv[2];
const FULL = process.argv.includes('--full');
const SAVE = process.argv.includes('--save');

if (!url) {
  console.error('用法：node test-clip.mjs <URL> [--full] [--save]');
  process.exit(1);
}

console.log(`📥 抓取中：${url}\n`);

try {
  const { noteContent, fileName, meta } = await clipUrl(url);

  console.log('── 解析結果（meta）─────────────────────────');
  console.log(`  標題：${meta.title ?? '—'}`);
  console.log(`  作者：${meta.author ?? '—'}`);
  console.log(`  網站：${meta.site ?? meta.domain ?? '—'}`);
  console.log(`  發布：${meta.published ?? '—'}`);
  console.log(`  字數：${meta.wordCount ?? '—'}`);
  console.log(`  解析耗時：${meta.parseTime ?? '—'}ms`);
  console.log(`  檔名：${fileName}`);

  console.log('\n── Markdown ────────────────────────────────');
  console.log(FULL ? noteContent : noteContent.slice(0, 800) + '\n...(用 --full 看完整內容)');

  if (SAVE) {
    writeFileSync(fileName, noteContent, 'utf8');
    console.log(`\n💾 已存到目前資料夾：${fileName}`);
  }
} catch (err) {
  console.error(`❌ 失敗：${err.message}`);
  process.exit(1);
}
