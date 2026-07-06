/**
 * 用 Defuddle 抓取網頁，輸出與 Obsidian Web Clipper 完全相同的格式
 * 用法：node clip.mjs <URL> [vault名稱] [存放資料夾]
 *
 */

import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── 設定 ──────────────────────────────────────────────────
const TARGET_URL = process.argv[2];
const VAULT_NAME = process.argv[3] ?? 'MyVault';       // Obsidian vault 名稱
const CLIP_FOLDER = process.argv[4] ?? 'Clippings';    // vault 內資料夾
const OPEN_IN_OBSIDIAN = true;                         // 完成後自動開啟 Obsidian

if (!TARGET_URL) {
  console.error('用法：node clip.mjs <URL> [vault名稱] [存放資料夾]');
  console.error('範例：node clip.mjs https://www.threads.net/@user/post/xxx MyVault Clippings');
  process.exit(1);
}

// ── 主流程 ────────────────────────────────────────────────
async function main() {
  console.log(`📥 抓取中：${TARGET_URL}`);

  // 1. 抓 HTML
  const res = await fetch(TARGET_URL, {
    headers: {
      // 模擬瀏覽器，避免被擋
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xhtml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  }

  const html = await res.text();

  // 2. 用 Defuddle 解析（與 Web Clipper 完全相同的引擎）
  console.log('🔍 Defuddle 解析中...');
  const { document } = parseHTML(html);
  const result = await Defuddle(document, TARGET_URL, {
    markdown: true,    // 直接輸出 Markdown（Web Clipper 預設行為）
    url: TARGET_URL,
  });

  // 3. Defuddle 回傳欄位（對應 Web Clipper 的 preset variables）
  // result.title       → {{title}}
  // result.author      → {{author}}
  // result.description → {{description}}
  // result.published   → {{published}}
  // result.site        → {{site}}
  // result.domain      → {{domain}}
  // result.image       → {{image}}
  // result.content     → {{content}}（Markdown 格式）

  const now = new Date();
  const clippedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // 4. 組 Frontmatter（與 Web Clipper 預設 template 相同）
  const frontmatter = [
    '---',
    `title: "${escapeYaml(result.title ?? '')}"`,
    `source: "${TARGET_URL}"`,
    result.author      ? `author: "${escapeYaml(result.author)}"` : null,
    result.site        ? `site: "${escapeYaml(result.site)}"` : null,
    result.description ? `description: "${escapeYaml(result.description)}"` : null,
    result.published   ? `published: "${result.published}"` : null,
    `clipped: "${clippedDate}"`,
    result.image       ? `image: "${result.image}"` : null,
    `tags:`,
    `  - clippings`,
    '---',
  ].filter(Boolean).join('\n');

  // 5. 組筆記內容（與 Web Clipper 預設 noteContentFormat 相同）
  const noteContent = [
    frontmatter,
    '',
    `# ${result.title ?? '(無標題)'}`,
    '',
    result.content ?? '（無法萃取內容）',
  ].join('\n');

  // 6. 產生安全的檔名（對應 Web Clipper 的 safe_name filter）
  const safeName = (result.title ?? 'Untitled')
    .replace(/[/\\:*?"<>|#^[\]]/g, '')  // 移除 Obsidian 不允許的字元
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  const fileName = `${safeName}.md`;

  console.log(`\n✅ 解析完成`);
  console.log(`   標題：${result.title}`);
  console.log(`   作者：${result.author ?? '—'}`);
  console.log(`   網站：${result.site ?? result.domain ?? '—'}`);
  console.log(`   字數：${result.wordCount ?? '—'}`);
  console.log(`   解析耗時：${result.parseTime}ms`);

  // 7. 寫入檔案（直接放進 vault，最可靠的方法）
  // 方法 A：透過 obsidian:// URI 開啟（會跳出確認框）
  if (OPEN_IN_OBSIDIAN) {
    await openViaURI(noteContent, fileName);
  }

  // 方法 B：直接輸出到 stdout（給其他程式用）
  console.log('\n── 筆記預覽（前 500 字元）──────────────────────');
  console.log(noteContent.slice(0, 500));
  console.log('──────────────────────────────────────────────');

  // 同時寫一份本地備份
  writeFileSync(`/tmp/${fileName}`, noteContent, 'utf8');
  console.log(`\n💾 本地備份：/tmp/${fileName}`);
}

// ── 透過 URI 開啟 Obsidian ────────────────────────────────
async function openViaURI(content, fileName) {
  // Obsidian URI 有長度限制（約 4000 字元）
  // 超過的話改用剪貼簿方式傳送

  const noteNameEncoded = encodeURIComponent(fileName.replace('.md', ''));
  const folderEncoded = encodeURIComponent(CLIP_FOLDER);
  const vaultEncoded = encodeURIComponent(VAULT_NAME);

  const contentEncoded = encodeURIComponent(content);
  const uri = `obsidian://new?vault=${vaultEncoded}&file=${folderEncoded}/${noteNameEncoded}&content=${contentEncoded}`;

  if (uri.length > 8000) {
    // 超過長度限制：改用剪貼簿傳送（與 Web Clipper 實際作法相同）
    console.log('\n📋 內容太長，複製到剪貼簿後以 URI 觸發...');
    await copyToClipboard(content);
    // 用不帶 content 的 URI 開啟，Obsidian 從剪貼簿讀取
    const shortUri = `obsidian://new?vault=${vaultEncoded}&file=${folderEncoded}/${noteNameEncoded}&clipboard=true`;
    openURI(shortUri);
  } else {
    console.log('\n🚀 透過 URI 開啟 Obsidian...');
    openURI(uri);
  }
}

function openURI(uri) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${uri}"`);
    } else if (platform === 'win32') {
      execSync(`start "" "${uri}"`);
    } else {
      execSync(`xdg-open "${uri}"`);
    }
  } catch (e) {
    console.warn('⚠️  無法自動開啟 Obsidian，請手動執行以下 URI：');
    console.log(uri.slice(0, 200) + '...');
  }
}

async function copyToClipboard(text) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`echo ${JSON.stringify(text)} | pbcopy`);
    } else if (platform === 'linux') {
      execSync(`echo ${JSON.stringify(text)} | xclip -selection clipboard`);
    } else if (platform === 'win32') {
      execSync(`echo ${JSON.stringify(text)} | clip`);
    }
  } catch (e) {
    console.warn('⚠️  無法複製到剪貼簿');
  }
}

// ── 工具函式 ──────────────────────────────────────────────
function escapeYaml(str) {
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

// ── 執行 ──────────────────────────────────────────────────
main().catch(err => {
  console.error('❌ 錯誤：', err.message);
  process.exit(1);
});
