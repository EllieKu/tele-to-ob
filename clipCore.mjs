/**
 * clipCore.mjs — 核心抓取邏輯（從 clip.mjs 拆出，供 bot.mjs 重複呼叫）
 */
import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { extractThreadsThread } from './threadsExtract.mjs';

// 用網址判斷是否為 Threads 連結，決定擷取方法
const THREADS_HOST_REGEX = /^(www\.)?threads\.(net|com)$/i;
function isThreadsUrl(url) {
  try {
    return THREADS_HOST_REGEX.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function escapeYaml(str = '') {
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function safeFileName(title = 'Untitled') {
  return title
    .replace(/[/\\:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'Untitled';
}

// 組 YAML frontmatter（null 欄位自動略過）
function buildFrontmatter(fields) {
  const createdDate = new Date().toISOString().split('T')[0];
  return [
    '---',
    `title: "${escapeYaml(fields.title ?? '')}"`,
    `source: "${fields.source}"`,
    fields.author      ? `author: "${escapeYaml(fields.author)}"` : null,
    fields.description  ? `description: "${escapeYaml(fields.description)}"` : null,
    fields.published    ? `published: "${fields.published}"` : null,
    `created: "${createdDate}"`,
    fields.image        ? `image: "${fields.image}"` : null,
    `tags:`,
    '---',
  ].filter(Boolean).join('\n');
}

// 取貼文文字的第一行當標題（去掉編號、截斷長度）
function titleFromText(text = '') {
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) || '';
  return firstLine.replace(/^\d+[.、)]\s*/, '').slice(0, 80);
}

/**
 * Threads 專用：把作者連續多段貼文接成一篇
 */
function buildThreadsNote(url, thread) {
  const { author, segments } = thread;
  const title = titleFromText(segments[0].text) || `@${author} on Threads`;
  const published = segments[0].takenAt
    ? new Date(segments[0].takenAt * 1000).toISOString().split('T')[0]
    : null;

  // 各段內文依序接起來；該段有圖片就接在文字後面
  const body = segments
    .map((seg) => {
      const imgs = seg.media.map((u) => `![](${u})`).join('\n');
      return [seg.text.trim(), imgs].filter(Boolean).join('\n\n');
    })
    .join('\n\n');

  const frontmatter = buildFrontmatter({
    title,
    source: url,
    author: `@${author}`,
    published,
    image: segments.flatMap((s) => s.media)[0] ?? null,
  });

  const noteContent = [frontmatter, '', `# ${title}`, '', body].join('\n');
  const fileName = `${safeFileName(title)}.md`;
  const meta = { title, author: `@${author}`, wordCount: body.length, segments: segments.length };
  return { noteContent, fileName, meta };
}

/**
 * 抓取 URL 並回傳組好的 Markdown 筆記字串 + 檔名。
 * Threads 連結優先用嵌入式 JSON 抽「作者連續貼文串」；
 * 其他網站（或結構抓不到）退回 Defuddle。
 */
export async function clipUrl(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xhtml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);

  const html = await res.text();

  // 1. Threads 連結才走多段萃取
  if (isThreadsUrl(url)) {
    const thread = extractThreadsThread(html, url);
    if (thread.found) return buildThreadsNote(url, thread);
  }

  // 2. 其他網站（或 Threads 結構抓不到）退回 Defuddle
  const { document } = parseHTML(html);
  const result = await Defuddle(document, url, { markdown: true, url });

  const frontmatter = buildFrontmatter({
    title: result.title,
    source: url,
    author: result.author,
    description: result.description,
    published: result.published,
    image: result.image,
  });

  const noteContent = [
    frontmatter,
    '',
    `# ${result.title || '(無標題)'}`,
    '',
    result.content || '（無法萃取內容，可能需要登入或為動態載入頁面）',
  ].join('\n');

  const fileName = `${safeFileName(result.title)}.md`;

  return { noteContent, fileName, meta: result };
}

/**
 * 直接寫入 Obsidian Vault 的資料夾（最可靠，不受 URI 長度限制）
 */
export function saveToVault(vaultPath, folder, fileName, content) {
  const dir = join(vaultPath, folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // 同名檔案不覆蓋：已存在就加上 -2、-3… 後綴
  const dotIdx = fileName.lastIndexOf('.');
  const base = dotIdx === -1 ? fileName : fileName.slice(0, dotIdx);
  const ext = dotIdx === -1 ? '' : fileName.slice(dotIdx);
  let filePath = join(dir, fileName);
  for (let n = 2; existsSync(filePath); n++) {
    filePath = join(dir, `${base}-${n}${ext}`);
  }

  writeFileSync(filePath, content, 'utf8');
  return filePath;
}
