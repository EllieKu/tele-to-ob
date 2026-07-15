# Changelog

本專案的重大變更會記錄在此檔案。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

## [Unreleased]

### Added
- 新增圖片自動分類功能，透過 `/addimg`、`/delimg`、`/listimg` 指令動態管理分類清單（存於本機 `categories.json`），收到圖片時用 `imageClassify.mjs`（CLIP 模型 zero-shot 分類）比對相似度並存入對應子資料夾，讓圖片不必再手動整理
- 新增 `test-classify.mjs`，可在終端機測試 CLIP 分類結果，不需啟動 bot 或連 Telegram
- 新增 `.claude/commands/my-commit.md` 與 `.claude/rules/changelog.md`，統一 commit 前流程（先跑 code review 再更新 CHANGELOG）與撰寫規則
- 新增 `Dockerfile`、`docker-compose.yml`、`.dockerignore`，讓專案可用 Docker 常駐執行；`docker-compose.yml` 的 Vault／圖片路徑改用 `.env` 既有的 `OBSIDIAN_VAULT_PATH`、`TELEGRAM_IMAGE_SAVE_PATH` 做變數代換，避免寫死個人本機路徑進版控

### Changed
- 調整 git commit 前的 PreToolUse hook：不再強制所有 `git commit` 都要走 `/my-commit`，只有指令結尾帶 `# via:my-commit` 標記時才會跳出確認提示，避免略過確認直接提交

### Security
- 已知問題：`/addimg` 新增的分類名稱未做路徑驗證，若輸入含 `..` 的名稱，圖片分類存檔時可能寫到 `TELEGRAM_IMAGE_SAVE_PATH` 以外的路徑，待後續修補