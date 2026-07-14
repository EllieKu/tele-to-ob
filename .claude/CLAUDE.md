# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

使用繁體中文說明.

## Project Overview

常駐 Node 程式：監聽 Telegram bot 收到的訊息，偵測其中的連結，抓取內容解析成 Markdown，寫入本機 Obsidian Vault。

## Common Commands

```bash
node bot.mjs                      # 啟動常駐 bot（long polling）
node retry-failed.mjs --dry-run   # 預覽 failed.log 中哪些會被重跑（不執行）
node retry-failed.mjs             # 實際重跑失敗連結，成功者從 failed.log 移除
node test-clip.mjs <URL>          # 終端機預覽 meta + 內容前段（不寫入 Vault）
node test-clip.mjs <URL> --full   # 預覽完整 Markdown
node test-clip.mjs <URL> --save   # 輸出成檔案
```

無測試框架、無 build、無 lint。`test-clip.mjs` 是手動驗證抓取結果的主要方式。

## Architecture

抓取邏輯與 I/O 通道分離，讓 bot、批次重跑、測試工具共用同一套核心：

- **[clipCore.mjs](../../clipCore.mjs)** — 核心。`clipUrl(url)` 先 `fetch` HTML，依 hostname 判斷是否為 Threads；是則走 `extractThreadsThread` 多段萃取，否則（或萃取失敗）退回 Defuddle + linkedom。回傳 `{ noteContent, fileName, meta }`。`saveToVault()` 負責寫檔。
- **[threadsExtract.mjs](../../threadsExtract.mjs)** — Threads 專用：解析頁面嵌入 JSON，抽出「作者連續多段貼文」接成一篇（含圖片、排除留言）。
- **[bot.mjs](../../bot.mjs)** — 常駐入口。白名單驗證 → 圖片訊息存到 `TELEGRAM_IMAGE_SAVE_PATH`，否則正則抓連結 → 帶重試呼叫 clipCore → 寫 Vault → 回報結果；連結失敗記錄到 `failed.log`。
- **[retry-failed.mjs](../../retry-failed.mjs)** / **[test-clip.mjs](../../test-clip.mjs)** — 分別批次重跑與單次測試，都直接呼叫 clipCore，不經過 Telegram。

### 關鍵行為

- **白名單**：`TELEGRAM_ALLOWED_USER_IDS` 未設定時會**拒絕所有請求**（安全預設）。非授權用戶靜默忽略。
- **圖片訊息**：存到 `TELEGRAM_IMAGE_SAVE_PATH`（獨立於 Vault 的絕對路徑），只存檔案、不產生 Markdown 筆記。未設定該變數時忽略圖片訊息並印出警告。檔名格式 `時間戳-messageId.副檔名`。
- **重試**：bot 內建 `MAX_RETRIES=2`（不含首次）、間隔 `RETRY_DELAY=3000ms`。全數失敗才寫入 `failed.log`（JSON Lines，每行一筆）。
- **離線補抓**：`polling: true` 讓 bot 啟動時自動處理離線期間累積的訊息。
- **不覆蓋同名檔**：`saveToVault` 對已存在檔名加 `-2`、`-3`… 後綴。
- **frontmatter**：`buildFrontmatter` 對 null 欄位自動略過，`escapeYaml` 處理引號與換行。

## Environment (.env)

依 [.env.example](../../.env.example) 建立。必填 `TELEGRAM_BOT_TOKEN`、`OBSIDIAN_VAULT_PATH`；缺任一 bot 直接 exit。`OBSIDIAN_CLIP_FOLDER` 預設 `Clippings`。`TELEGRAM_GROUP_ID` 選填（限定特定群組）。`TELEGRAM_IMAGE_SAVE_PATH` 選填（圖片訊息存放的獨立路徑，未設定則忽略圖片）。
