/**
 * bot.mjs — 常駐程式：監聽 Telegram 私聊或群組，偵測 Threads 連結，
 *           自動用 Defuddle 抓取並寫入 Obsidian Vault。
 *
 * 用法：
 *   1. cp .env.example .env，填入設定
 *   2. node bot.mjs
 *
 * 安全：只有 TELEGRAM_ALLOWED_USER_IDS 白名單內的用戶可以觸發抓取，
 *       其他人傳訊息給 Bot 會被靜默忽略。
 *
 * 開機自動啟動建議用 pm2（見 README）。
 */

import TelegramBot from 'node-telegram-bot-api';
import { clipUrl, saveToVault } from './clipCore.mjs';
import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import 'dotenv/config';

// ── 設定（從 .env 讀取）────────────────────────────────────
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID    = process.env.TELEGRAM_GROUP_ID;       // 選填：限定特定群組 chat id
const VAULT_PATH  = process.env.OBSIDIAN_VAULT_PATH;     // vault 的本機絕對路徑
const CLIP_FOLDER = process.env.OBSIDIAN_CLIP_FOLDER || 'Clippings';
const FAILED_LOG  = join(dirname(new URL(import.meta.url).pathname), 'failed.log');
const MAX_RETRIES = 2;     // 失敗後自動重試次數（不含第一次嘗試）
const RETRY_DELAY = 3000;  // 每次重試間隔（毫秒）

// 白名單：允許觸發抓取的 Telegram user id（逗號分隔，支援多人）
// 取得方式：傳訊息給 @userinfobot，它會回覆你的 user id
// 若未設定 → 啟動時警告，並拒絕所有請求（避免誤開放）
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

  // 3. 找出訊息裡的所有網址
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
