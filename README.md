# Tel To Ob

將傳送給 Telegram bot 的連結/圖片儲存在本機

## 專案概述
- Telegram 對話訊息佇列等待接收連結或圖片
- 程式用 long polling 監聽訊息。重新程式啟動時會將離線期間累積的所有訊息一次處理
- 訊息為連結 → 抓取內容解析成 Markdown，寫入 Obsidian Vault
- 訊息為圖片 → 存到 `TELEGRAM_IMAGE_SAVE_PATH` 指定的獨立資料夾（未設定則忽略圖片）
- 使用 CLIP 模型辨識圖片並分類, 分類組別在 Telegram bot 中設定, 初次啟動需要花一點時間下載模型

## Quick Start
```bash
npm install
cp .env.example .env
```

修改 `.env` (需先 Telegram 建立 bot, 並取得 ` Bot Token` 與 `User ID`)

### 執行
```bash
node bot.mjs 
```

### 其他指令

```bash
node retry-failed.mjs --dry-run   # 先看會重跑哪些（不執行）
node retry-failed.mjs             # 實際重跑，成功的會從 failed.log 移除
node test-clip.mjs <URL>          # 終端機預覽 meta + 內容前段
node test-clip.mjs <URL> --full   # 終端機預覽完整 Markdown
node test-clip.mjs <URL> --save   # 編輯器輸出檔案
node test-classify.mjs <圖片路徑>  # 測試圖片分類
```

### Telegram bot設定圖片組別分類
```
/addimg: 新增
/delimg: 刪除
/listimg: 列出清單
```
