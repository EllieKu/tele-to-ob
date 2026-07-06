# Tel To Ob

連結傳給 Telegram bot 後，電腦上常駐的程式會自動抓取該連結內容後寫入本機 Obsidian。

## 運作方式

- Telegram 對話訊息佇列等待接收連結
- 程式用 long polling 監聽訊息。重新程式啟動時會將離線期間累積的所有連結一次處理

---

## Quick Start
```bash
npm install
cp .env.example .env
```

修改 `.env` (需先 Telegram 建立 bot, 並取得 ` Bot Token` 與 `User ID`)

```bash
node bot.mjs 
```

其他指令

```bash
node retry-failed.mjs --dry-run   # 先看會重跑哪些（不執行）
node retry-failed.mjs             # 實際重跑，成功的會從 failed.log 移除
node test-clip.mjs <URL>          # 終端機預覽 meta + 內容前段
node test-clip.mjs <URL> --full   # 終端機預覽完整 Markdown
node test-clip.mjs <URL> --save   # 編輯器輸出檔案
```

---

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `threadsExtract.mjs` | 通用 Threads 萃取器：解析頁面嵌入 JSON，抽出「作者連續多段貼文」依序接成一篇（含圖片、排除留言） |
| `clipCore.mjs` | 核心邏輯：抓取 URL → 先試 Threads 多段萃取，抓不到才退回 Defuddle → 組 Markdown，並提供 `saveToVault()` 寫入 Vault |
| `bot.mjs` | 常駐程式：監聽 Telegram、白名單驗證、偵測連結、呼叫 clipCore、寫入 Vault、失敗自動重試與記錄 |
| `retry-failed.mjs` | 批次重跑 `failed.log` 裡記錄的失敗連結（共用 clipCore） |
| `test-clip.mjs` | 測試工具：對任意 URL 跑抓取並印出結果，不寫入 Vault（`node test-clip.mjs <URL> [--full]`） |
| `clip.mjs` | 獨立命令列舊版工具（手動單次抓取，不需 Telegram；走 `obsidian://` URI，未共用 clipCore） |
| `.env.example` | 環境變數範本 |
