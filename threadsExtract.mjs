/**
 * threadsExtract.mjs — 通用：從 Threads 貼文頁面的嵌入式 JSON，
 * 萃取「作者連續貼文串」（一篇被拆成多段的文章），接成單篇內容。
 *
 * 規則（與特定貼文無關）：
 *   1. 找到對話的 edges 陣列（每個 edge 是討論串裡的一個項目）
 *   2. 主作者 = URL 指向那則貼文的作者
 *   3. 文章正段 = 每個 edge「開頭連續的作者貼文」，遇到別人留言就停
 *   4. 依發文時間排序接起來；排除別人的留言與作者對留言的零星回覆
 */
import { parseHTML } from 'linkedom';

// 從一堆已解析的 JSON 物件裡，遞迴找出第一個「對話 edges」陣列
function findEdges(roots) {
  let edges = null;
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (!edges && Array.isArray(node.edges) && node.edges[0]?.node?.thread_items) {
      edges = node.edges;
      break;
    }
    for (const k in node) stack.push(node[k]);
  }
  return edges;
}

// 取一則貼文裡最大張的圖片 / 影片連結
function mediaUrls(post) {
  const urls = [];
  const bestImage = (iv) =>
    iv?.candidates?.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;

  const collect = (m) => {
    // media_type: 1=圖片, 2=影片, 8=輪播(carousel)
    if (m.media_type === 2 && m.video_versions?.length) {
      urls.push(m.video_versions[0].url);
    } else if (m.media_type === 1) {
      const u = bestImage(m.image_versions2);
      if (u) urls.push(u);
    }
  };

  if (Array.isArray(post.carousel_media)) {
    post.carousel_media.forEach(collect);
  } else {
    collect(post);
  }
  return urls;
}

function toSegment(post) {
  return {
    code: post.code,
    username: post.user?.username,
    takenAt: post.taken_at || 0,
    text: post.caption?.text ?? '',
    media: mediaUrls(post),
  };
}

/**
 * @returns {{ found: boolean, author?: string, segments?: Array }}
 */
export function extractThreadsThread(html, url) {
  const { document } = parseHTML(html);
  const roots = [...document.querySelectorAll('script[type="application/json"]')]
    .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
    .filter(Boolean);

  const edges = findEdges(roots);
  if (!edges) return { found: false };

  const mainCode = url.match(/\/post\/([^/?#]+)/)?.[1];

  // 主作者：以 URL 那則貼文的作者為準，找不到就用第一個 edge 的第一則
  let author = null;
  for (const e of edges) {
    for (const it of e.node?.thread_items ?? []) {
      if (it.post?.code === mainCode) { author = it.post?.user?.username; break; }
    }
    if (author) break;
  }
  author ??= edges[0]?.node?.thread_items?.[0]?.post?.user?.username;
  if (!author) return { found: false };

  // 每個 edge 取開頭連續的作者貼文，遇到別人就停
  const segments = [];
  const seen = new Set();
  for (const e of edges) {
    for (const it of e.node?.thread_items ?? []) {
      const p = it.post;
      if (!p || p.user?.username !== author) break;
      if (seen.has(p.code)) continue;
      seen.add(p.code);
      segments.push(toSegment(p));
    }
  }

  segments.sort((a, b) => a.takenAt - b.takenAt);
  return { found: segments.length > 0, author, segments };
}
