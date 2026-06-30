# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

Telegram bot 常駐程式，監聽 Telegram 私聊或群組訊息，偵測 Threads 連結，自動抓取網頁內容，解析成 Markdown，寫入 Obsidian Vault。採 pub/sub 概念：手機把 Threads 連結傳給 bot（私聊或群組），電腦上常駐的 bot 隨時處理。

抓取 Threads 連結時，會優先從頁面嵌入的 JSON 萃取「作者連續多段貼文」（一篇被拆成好幾則接龍的貼文），依時間接成單篇筆記；非 Threads 連結或結構抓不到時，退回 Defuddle 解析。

安全模型以**白名單**為主：只有 `TELEGRAM_ALLOWED_USER_IDS` 內的 user id 能觸發抓取，其他人的訊息一律靜默忽略。`TELEGRAM_GROUP_ID` 為選填，用來額外限定只處理某個群組。

## 執行指令

```bash
# 安裝依賴
npm install

# 啟動 bot（常駐，建議用 pm2 開機自動啟動，見 README）
node bot.mjs

# 單次手動抓取（獨立舊版工具，見下方說明）
node clip.mjs <URL> [vault名稱] [存放資料夾]

# 批次重跑失敗清單（先預覽）
node retry-failed.mjs --dry-run
node retry-failed.mjs

# 測試任意 URL 的抓取結果（不寫入 Vault；測試用工具）
node test-clip.mjs <URL>          # 預覽 meta + 內容前段
node test-clip.mjs <URL> --full   # 完整 Markdown
```

## 環境設定

複製 `.env.example` 為 `.env`，填入環境變數：

必填：
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`（正數 user id；逗號分隔可多人。未設定時 bot 會拒絕所有請求）
- `OBSIDIAN_VAULT_PATH`（絕對路徑）

選填：
- `TELEGRAM_GROUP_ID`（負數；只處理特定群組，私聊不需填）
- `OBSIDIAN_CLIP_FOLDER`（預設 `Clippings`）

## 架構

```
threadsExtract.mjs ← 通用 Threads 萃取器：解析頁面嵌入 JSON 的 edges → 抽出「作者連續貼文串」
                     （每個 edge 取開頭連續的作者貼文，遇別人留言即停）→ 依時間排序，含每段圖片
     ↑（被 clipCore.mjs 使用）
clipCore.mjs   ← 核心：fetch URL → 用網址判斷（isThreadsUrl）：Threads 連結走 threadsExtract（多段）→ 接成 Markdown
                 非 Threads（或 Threads 結構抓不到）退回 linkedom + Defuddle → 組 YAML frontmatter + Markdown
                 並提供 saveToVault()，用 writeFileSync 直接寫入 Vault
     ↑（被 bot.mjs 與 retry-failed.mjs 共用）
bot.mjs        ← 常駐：Telegram long polling → 白名單驗證 → 偵測訊息中的網址（通用 URL）
                 → 呼叫 clipCore.clipUrl + saveToVault 寫入 Vault
                 └→ 失敗自動重試 2 次（間隔 3 秒）→ 仍失敗寫 failed.log（JSON Lines）
retry-failed.mjs ← 讀 failed.log → 逐筆重呼叫 clipUrl + saveToVault → 成功則從 log 移除

test-clip.mjs  ← 測試工具：對任意 URL 跑 clipUrl 並印出結果，不寫入 Vault
clip.mjs       ← 獨立 CLI 舊版工具，未共用 clipCore（自帶 fetch / frontmatter）
                 透過 obsidian:// URI 開啟 Obsidian，並寫一份 /tmp 備份；不直接寫入 Vault
```

### 關鍵設計決策

- 所有檔案為 ES Modules（`"type": "module"`），使用 `.mjs` 副檔名
- `bot.mjs` 與 `retry-failed.mjs` 共用 `clipCore.mjs`；`clip.mjs` 是早期獨立工具，邏輯未抽到 clipCore
- 寫入 Vault（`clipCore.saveToVault`）用 `fs.writeFileSync` 直接寫檔，不用 Obsidian URI（避免 URI 長度限制）；唯獨 `clip.mjs` 仍走 `obsidian://` URI
- Threads 多段萃取（`threadsExtract.mjs`）走純 `fetch` 取得頁面，內容藏在 `<script type="application/json">` 裡（中文為 unicode 跳脫）；**不需要瀏覽器/Playwright**，靠解析 JSON 的 `edges → thread_items → post` 結構取得各段
- 作者主串 vs 留言的判定：每個 edge 只取「開頭連續、且作者與主貼文相同」的貼文；如此可排除別人的留言與作者對留言的零星回覆
- Threads 筆記標題取第一段內文的首行；`published` 取第一段發文時間；各段圖片（`image_versions2` 取最大張、`carousel_media` 逐張）內嵌於該段文字後
- Frontmatter 欄位為選填（null 欄位 filter 掉，不輸出空值）
- `clipCore` 檔名格式：`標題.md`，frontmatter 含 `created` 欄位，tags 為 ``；`clip.mjs` 則是 `標題.md`、tags 僅 `clippings`；同名檔案由 `saveToVault()` 自動加 `-2`、`-3`… 後綴避免覆蓋
- 特殊字元由 `safeFileName()` 移除（最長 100 字元）
- `bot.mjs` 偵測訊息中的所有網址（通用 `URL_REGEX`），任何 `http/https` 連結都會處理
- 擷取方法由網址決定：`clipCore.isThreadsUrl()` 用 `new URL().hostname` 比對 `threads.net` / `threads.com`（含 `www.`）；是 Threads 才跑多段萃取，否則直接走 Defuddle
