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