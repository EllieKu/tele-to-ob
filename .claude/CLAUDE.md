# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

使用繁體中文說明.

## Project Overwview
  
獲取 Telegram bot 訊息內的連結解析後儲存到 obsidian

## Common Commands

```bash
node bot.mjs                      # start a server
node retry-failed.mjs --dry-run   # preview which entries would be retried (no execution)
node retry-failed.mjs             # actually retry; successful ones are removed from failed.log
node test-clip.mjs <URL>          # preview
node test-clip.mjs <URL> --full   # preview full conten
node test-clip.mjs <URL> --save   # output a file
```

