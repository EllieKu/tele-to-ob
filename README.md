# Tel To Ob

Threads → Telegram → Obsidian 自動化

手機把 Threads 連結傳給 Telegram bot（私聊或群組皆可），電腦上常駐的程式會自動抓取內容，轉成 Markdown
寫入 Obsidian Vault。若作者把一篇拆成多則接龍貼文，會自動依序接成單篇筆記（含每段圖片），並排除留言。
非 Threads 連結則退回 Defuddle（和 Obsidian Web Clipper 同一套引擎）解析。

只有白名單（`TELEGRAM_ALLOWED_USER_IDS`）內的 user id 能觸發抓取，其他人的訊息一律靜默忽略。

## 運作方式（pub/sub）

- Telegram 對話 = 訊息佇列。手機隨時可以傳連結，不受電腦開關機影響。
- 電腦上的 `bot.mjs` 用 long polling 監聽訊息。
- **電腦開機、程式啟動時**：自動把離線期間累積的所有連結一次處理掉。
- **程式持續運作時**：新連結進來幾秒內就處理完成。

---

## 安裝步驟

### 1. 建立 Telegram Bot

1. Telegram 搜尋 **@BotFather**
2. 傳送 `/newbot`，依指示命名，取得 **Bot Token**（形如 `123456:AAxxxx...`）
3. （只在群組使用時需要）傳送 `/setprivacy` → 選你的 bot → **Disable**，bot 才能讀到群組裡的一般訊息

### 2. 取得自己的 user id

傳訊息給 **@userinfobot**，它會直接回覆你的 user id（正數），這就是 `TELEGRAM_ALLOWED_USER_IDS`。
多人共用以逗號分隔，例如 `123456,789012`。

（選填）若要限定只處理某個群組：把 bot 加入群組後傳一則訊息，打開
`https://api.telegram.org/bot<你的TOKEN>/getUpdates`，從回傳 JSON 找 `"chat":{"id": -100xxxxxxxxxx}`，
這串負數就是 `TELEGRAM_GROUP_ID`。

### 3. 安裝套件

```bash
npm install
```

### 4. 設定環境變數

```bash
cp .env.example .env
```

打開 `.env`，填入：
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`（你的 user id；未設定時 bot 會拒絕所有請求）
- `OBSIDIAN_VAULT_PATH`（這台電腦上 Vault 的絕對路徑）
- （選填）`TELEGRAM_GROUP_ID`（只處理特定群組，私聊不需填）
- （選填）`OBSIDIAN_CLIP_FOLDER`（預設 `Clippings`）

### 5. 測試執行

```bash
node bot.mjs
```

看到 `🤖 Bot 已啟動，等待 Threads 連結...` 就代表成功。手機傳一個 Threads 連結給 bot 試試，
應該幾秒內會收到「✅ 已存入 Obsidian」的回覆，Obsidian Vault 裡也會出現新筆記。

---

## 開機自動啟動（讓它真正做到 pub/sub）

用 **pm2** 讓程式開機自動跑、當掉自動重啟：

```bash
npm install -g pm2
pm2 start bot.mjs --name threads-clipper
pm2 save
pm2 startup    # 依照指示執行它印出的指令，設定開機自動啟動
```

之後查看狀態 / 日誌：

```bash
pm2 status
pm2 logs threads-clipper
```

### macOS 替代方案：launchd

如果不想裝 pm2，也可以寫一個 `.plist` 放到 `~/Library/LaunchAgents/`，讓 macOS 開機時
自動執行 `node bot.mjs`。需要的話我可以另外幫你寫這份設定檔。

---

## 失敗處理（重試 + 紀錄）

- 每次抓取失敗，`bot.mjs` 會**自動重試最多 2 次**（間隔 3 秒），處理暫時性的網路問題。
- 重試後仍失敗，會：
  1. 在 Telegram 對話回覆失敗訊息
  2. 把連結、時間、錯誤訊息寫進 `failed.log`（JSON Lines 格式，一行一筆）

之後想批次重跑失敗清單：

```bash
node retry-failed.mjs --dry-run   # 先看會重跑哪些（不執行）
node retry-failed.mjs             # 實際重跑，成功的會從 failed.log 移除
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

## 疑難排解

- **Bot 沒反應**：確認你的 user id 有加進 `TELEGRAM_ALLOWED_USER_IDS`；若用群組，還要確認 `/setprivacy` 已設為 Disable 且 bot 在群組成員列表中
- **抓不到 / 多段不齊全**：公開貼文通常沒問題（內容取自頁面嵌入的 JSON，純 `fetch` 即可，不需瀏覽器）；
  可先用 `node test-clip.mjs <URL> --full` 看實際抓到什麼。少數需登入才看得到的內容、或 Threads 改版導致
  JSON 結構變動時，可能抓不全 —— 後者需更新 `threadsExtract.mjs` 的解析路徑
- **中文檔名亂碼**：確認終端機與檔案系統都是 UTF-8（macOS/Linux 預設沒問題）
