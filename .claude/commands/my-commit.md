---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Read, Edit, Skill
description: 先跑 code review，通過後產生 commit 訊息並同步更新 CHANGELOG.md 後提交
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`
- Changelog 格式規則: @.claude/rules/changelog.md
- Current CHANGELOG.md: @CHANGELOG.md

## Your task

1. 先用 `code-review`（非 plugin 版，獨立 skill，直接審查目前 diff）對目前的變更跑一次 code review（effort 用 medium 即可）。
2. 檢查 review 結果：
   - 若有 CRITICAL 或 HIGH 等級的問題，**停止流程**，把問題列出來回報給使用者，不要繼續 commit 或更新 CHANGELOG.md。等使用者修正後或明確要求略過再繼續。
   - 若沒有 CRITICAL/HIGH（僅 MEDIUM/LOW 或無發現），才繼續下面的步驟。
3. 依據上方變更內容，依 `.claude/rules/changelog.md` 的規則，在 `CHANGELOG.md` 的 `## [Unreleased]` 底下對應分類（Added/Changed/Fixed/Removed/Deprecated/Security）新增一行條目。若變更不影響使用者可見行為（純內部重構、typo 等），可略過此步驟。
4. `git add` 所有相關變更檔案（包含更新後的 `CHANGELOG.md`）。
5. 依 conventional commits 格式（`<type>: <description>`）產生 commit 訊息。
6. 執行 commit 時，指令最後必須加上 `# via:my-commit` 註解標記，否則會被 PreToolUse hook 擋下。範例：

```
git commit -m "$(cat <<'EOF'
<type>: <description>
EOF
)" # via:my-commit
```

7. 不要使用其他工具或做本任務以外的事（code review 步驟除外）。
