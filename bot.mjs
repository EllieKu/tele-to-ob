/**
 * bot.mjs — 常駐程式：監聽 Telegram 私聊或群組，偵測 Threads 連結，
 *           自動用 Defuddle 抓取並寫入 Obsidian Vault。
 *
 */

import TelegramBot from 'node-telegram-bot-api';
import { clipUrl, saveToVault } from './clipCore.mjs';
import { loadCategories, addCategory, removeCategory } from './categories.mjs';
import { classifyImage } from './imageClassify.mjs';
import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// ── 設定 ────────────────────────────────────
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID    = process.env.TELEGRAM_GROUP_ID;       // 選填：限定特定群組 chat id
const VAULT_PATH  = process.env.OBSIDIAN_VAULT_PATH;     // vault 的本機絕對路徑
const CLIP_FOLDER = process.env.OBSIDIAN_CLIP_FOLDER || 'Clippings';
const IMAGE_SAVE_PATH = process.env.TELEGRAM_IMAGE_SAVE_PATH; // 選填：圖片訊息的獨立存放路徑
const FAILED_LOG  = join(dirname(fileURLToPath(import.meta.url)), 'failed.log');
const MAX_RETRIES = 2;     // 失敗後自動重試次數（不含第一次嘗試）
const RETRY_DELAY = 3000;  // 每次重試間隔（毫秒）

const ALLOWED_USER_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!BOT_TOKEN || !VAULT_PATH) {
  console.error('❌ 請先設定 .env（TELEGRAM_BOT_TOKEN, OBSIDIAN_VAULT_PATH）');
  process.exit(1);
}

if (ALLOWED_USER_IDS.length === 0) {
  console.warn('⚠️  未設定 TELEGRAM_ALLOWED_USER_IDS，將拒絕所有請求。請設定你的 user id。');
}

if (!IMAGE_SAVE_PATH) {
  console.warn('⚠️  未設定 TELEGRAM_IMAGE_SAVE_PATH，收到圖片訊息時將忽略。');
}

// ── 失敗紀錄（JSON Lines，每行一筆，方便之後用 retry-failed.mjs 重跑）──
function logFailure({ url, chatId, messageId, error }) {
  const entry = {
    timestamp: new Date().toISOString(),
    url,
    chatId,
    messageId,
    error: String(error),
  };
  try {
    appendFileSync(FAILED_LOG, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.error('⚠️  無法寫入 failed.log：', e.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 帶重試的抓取
async function clipUrlWithRetry(url, onAttemptFail) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await clipUrl(url);
    } catch (err) {
      lastErr = err;
      if (onAttemptFail) onAttemptFail(attempt, err);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY);
    }
  }
  throw lastErr;
}

// 下載 Telegram 圖片訊息的最高解析度版本
async function downloadPhoto(fileId) {
  const fileUrl = await bot.getFileLink(fileId);
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = (new URL(fileUrl).pathname.match(/\.\w+$/) || ['.jpg'])[0];
  return { buffer, ext };
}

// ── 比對連結（通用網址；Threads 自動走多段萃取，其他網站退回 Defuddle）──
const URL_REGEX = /https?:\/\/[^\s]+/gi;

// polling: true → 啟動時自動補抓離線期間累積的訊息，之後持續監聽新訊息
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Bot 已啟動，等待連結...');
console.log(`   白名單用戶：${ALLOWED_USER_IDS.length > 0 ? ALLOWED_USER_IDS.join(', ') : '（未設定，將拒絕所有請求）'}`);
if (GROUP_ID) console.log(`   限定群組 chat id：${GROUP_ID}`);

// ── 訊息處理 ──────────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId  = msg.chat.id;
  const userId  = String(msg.from?.id ?? '');
  const text    = msg.text || msg.caption || '';

  // 1. 白名單驗證：非授權用戶靜默忽略
  if (ALLOWED_USER_IDS.length === 0 || !ALLOWED_USER_IDS.includes(userId)) {
    console.log(`🚫 忽略非授權用戶：${userId} (@${msg.from?.username ?? '?'})`);
    return;
  }

  // 2. 選填：限定特定群組（私聊用不到，但保留彈性）
  if (GROUP_ID && String(chatId) !== String(GROUP_ID)) return;

  // 3. 分類管理指令：/addimg /delimg /listimg
  if (text.startsWith('/')) {
    const [command, ...rest] = text.trim().split(/\s+/);
    const arg = rest.join(' ');

    if (command === '/addimg') {
      if (!arg) {
        await bot.sendMessage(chatId, '用法：/addimg <分類名稱>', { reply_to_message_id: msg.message_id });
        return;
      }
      try {
        const list = addCategory(arg);
        await bot.sendMessage(chatId, `✅ 已新增分類：${arg}\n目前分類：${list.join(', ') || '（無）'}`, { reply_to_message_id: msg.message_id });
      } catch (err) {
        await bot.sendMessage(chatId, `❌ ${err.message}`, { reply_to_message_id: msg.message_id });
      }
      return;
    }

    if (command === '/delimg') {
      if (!arg) {
        await bot.sendMessage(chatId, '用法：/delimg <分類名稱>', { reply_to_message_id: msg.message_id });
        return;
      }
      const list = removeCategory(arg);
      await bot.sendMessage(chatId, `✅ 已移除分類：${arg}\n目前分類：${list.join(', ') || '（無）'}`, { reply_to_message_id: msg.message_id });
      return;
    }

    if (command === '/listimg') {
      const list = loadCategories();
      await bot.sendMessage(chatId, `🏷️ 目前分類：${list.join(', ') || '（無）'}`, { reply_to_message_id: msg.message_id });
      return;
    }
  }

  // 4. 圖片訊息：依分類結果存到 TELEGRAM_IMAGE_SAVE_PATH 下的對應子資料夾
  if (msg.photo && msg.photo.length > 0) {
    if (!IMAGE_SAVE_PATH) {
      console.warn('⚠️  收到圖片但未設定 TELEGRAM_IMAGE_SAVE_PATH，已略過');
      return;
    }
    const photo = msg.photo[msg.photo.length - 1]; // 取最高解析度
    try {
      const { buffer, ext } = await downloadPhoto(photo.file_id);
      const fileName = `${Date.now()}-${msg.message_id}${ext}`;

      let category = null;
      try {
        const categories = loadCategories();
        category = await classifyImage(buffer, categories);
      } catch (err) {
        console.warn(`⚠️  圖片分類失敗，將存入未分類資料夾：${err.message}`);
      }

      const savedPath = saveToVault(IMAGE_SAVE_PATH, category || '', fileName, buffer);
      const categoryInfo = category ? `（分類：${category}）` : '';
      console.log(`✅ 圖片已存入：${savedPath}`);
      await bot.sendMessage(chatId, `🖼️ 圖片已存入${categoryInfo}\n📄 ${fileName}`, { reply_to_message_id: msg.message_id });
    } catch (err) {
      console.error(`❌ 圖片儲存失敗：${err.message}`);
      await bot.sendMessage(chatId, `❌ 圖片儲存失敗：${err.message}`, { reply_to_message_id: msg.message_id });
    }
    return;
  }

  // 5. 找出訊息裡的所有網址
  const links = text.match(URL_REGEX);
  if (!links || links.length === 0) return;

  for (const link of links) {
    const cleanLink = link.replace(/[)\]}>,.]+$/, ''); // 去掉句尾誤夾帶的標點
    console.log(`\n🔗 偵測到連結：${cleanLink}`);

    try {
      await bot.sendMessage(chatId, `📥 抓取中：${cleanLink}`, { reply_to_message_id: msg.message_id });

      const { noteContent, fileName, meta } = await clipUrlWithRetry(cleanLink, (attempt, err) => {
        console.warn(`   ↻ 第 ${attempt + 1} 次嘗試失敗：${err.message}，準備重試...`);
      });
      const savedPath = saveToVault(VAULT_PATH, CLIP_FOLDER, fileName, noteContent);

      console.log(`✅ 已存入：${savedPath}`);
      const segInfo = meta.segments > 1 ? `（${meta.segments} 段）` : '';
      await bot.sendMessage(
        chatId,
        `✅ 已存入 Obsidian\n📄 ${fileName}\n📝 ${meta.title || '(無標題)'}${segInfo}\n📊 ${meta.wordCount || 0} 字`,
        { reply_to_message_id: msg.message_id }
      );
    } catch (err) {
      console.error(`❌ 處理失敗（已重試 ${MAX_RETRIES} 次）：${err.message}`);
      logFailure({ url: cleanLink, chatId, messageId: msg.message_id, error: err.message });
      await bot.sendMessage(
        chatId,
        `❌ 抓取失敗（已重試 ${MAX_RETRIES} 次）：${err.message}\n已記錄到 failed.log，稍後可用 retry-failed.mjs 重跑`,
        { reply_to_message_id: msg.message_id }
      );
    }
  }
});

bot.on('polling_error', (err) => {
  console.error('⚠️  Polling 錯誤：', err.message);
});

// 優雅關閉
process.on('SIGINT', () => {
  console.log('\n👋 Bot 關閉中...');
  bot.stopPolling();
  process.exit(0);
});
