---
paths: ["CHANGELOG.md"]
---

# Changelog 規範

本專案 CHANGELOG.md 遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，並補充以下規則：

## 分類標籤
只能使用以下六種（沒有對應變更就不要建立空標題）：
`Added` / `Changed` / `Fixed` / `Removed` / `Deprecated` / `Security`

## 條目寫法
- 使用繁體中文，完整句子，句尾不加句號
- 說明「做了什麼」+「為什麼／影響」，不要只寫做了什麼
- 涉及新檔案、函式、指令時用反引號標註，例如 `imageClassify.mjs`、`/addimg`
- 一個變更一條，避免把多個不相關改動塞進同一條

## 版本區塊
- 開發中的變更一律先寫在 `## [Unreleased]`
- 發版時把 `[Unreleased]` 改為 `## [x.y.z] - YYYY-MM-DD`（語意化版本），並在上方新增一個空的 `## [Unreleased]`

## 排序
- 同分類內新條目加在最下面（時間順序）
- 分類標題固定順序：Added → Changed → Fixed → Removed → Deprecated → Security
