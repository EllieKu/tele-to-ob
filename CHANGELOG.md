# Changelog

本專案的重大變更會記錄在此檔案。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

## [Unreleased]

### Added
- 新增圖片自動分類功能，透過 `/addimg`、`/delimg`、`/listimg` 指令動態管理分類清單（存於本機 `categories.json`），收到圖片時用 `imageClassify.mjs`（CLIP 模型 zero-shot 分類）比對相似度並存入對應子資料夾，讓圖片不必再手動整理
- 新增 `test-classify.mjs`，可在終端機測試 CLIP 分類結果，不需啟動 bot 或連 Telegram
- 新增 `.claude/commands/my-commit.md` 與 `.claude/rules/changelog.md`，統一 commit 前流程（先跑 code review 再更新 CHANGELOG）與撰寫規則
- 新增 `Dockerfile`、`docker-compose.yml`、`.dockerignore`，讓專案可用 Docker 常駐執行；`docker-compose.yml` 的 Vault／圖片路徑改用 `.env` 既有的 `OBSIDIAN_VAULT_PATH`、`TELEGRAM_IMAGE_SAVE_PATH` 做變數代換，避免寫死個人本機路徑進版控
- 新增 `categories.example.json` 範本與 README Docker 章節，說明首次啟動前需先建立 `categories.json`、`failed.log`，避免 docker-compose 對不存在的單一檔案做 bind mount 時自動建立同名資料夾，導致程式讀寫失敗

### Changed
- 調整 git commit 前的 PreToolUse hook：不再強制所有 `git commit` 都要走 `/my-commit`，只有指令結尾帶 `# via:my-commit` 標記時才會跳出確認提示，避免略過確認直接提交
- `categories.mjs` 新增分類清單記憶體快取，避免每次處理圖片都重複讀取 `categories.json`；調整 `addCategory` 改為前置判斷提早回傳，`removeCategory` 新增無變動時跳過磁碟寫入的短路邏輯，降低不必要的 I/O

### Removed
- 將 `categories.json`、`failed.log` 從版控移除追蹤，改由 `.gitignore` 忽略；這兩個檔案先前被誤提交，導致個人分類清單與失敗記錄跟著 commit 異動，且 pull 時可能覆蓋本機資料

### Security
- 修補 `/addimg` 路徑注入風險：`categories.mjs` 的 `addCategory` 拒絕含 `/`、`\`、`..` 的分類名稱，並在 `bot.mjs` 顯示對應錯誤訊息給使用者，避免圖片分類存檔寫到 `TELEGRAM_IMAGE_SAVE_PATH` 以外的路徑
- `clipCore.mjs` 的 `saveToVault` 新增寫入路徑檢查，確保目標資料夾必定落在 Vault 範圍內，防止路徑跳脫寫到 Vault 以外