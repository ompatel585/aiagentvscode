# Refactoring TODO

## Objective
Remove numeric prefixes from file names and organize files into logical folders.

## File Mapping (Old → New)
- `src/1_extension.ts` → `src/main/extension.ts`
- `src/2_indexer.ts` → `src/features/indexer.ts`
- `src/3_client.ts` → `src/core/client.ts`
- `src/4_patcher.ts` → (empty, will be removed)
- `src/5_types.ts` → `src/core/types.ts`
- `src/6_relevance.ts` → `src/features/search/relevance.ts`
- `src/7_summary.ts` → `src/features/summary.ts`
- `src/8_embeddings.ts` → `src/features/search/embeddings.ts`
- `src/9_vectorStore.ts` → `src/features/search/vectorStore.ts`
- `src/10_retryLoop.ts` → `src/core/retryLoop.ts`
- `src/11_astPatcher.ts` → `src/features/patcher/astPatcher.ts`
- `src/12_diffPreview.ts` → `src/features/diffPreview.ts`
- `src/13_terminalTool.ts` → `src/features/terminalTool.ts`
- `src/14_testRunner.ts` → `src/features/testRunner.ts`
- `src/15_slashCommands.ts` → `src/commands/slashCommands.ts`
- `src/16_rulesLoader.ts` → `src/commands/rulesLoader.ts`
- `src/17_statusBar.ts` → `src/ui/statusBar.ts`
- `src/chat/panel.ts` → `src/chat/panel.ts` (no change)
- `src/chat/view.html` → `src/chat/view.html` (no change)

## Folder Structure
```
src/
├── main/
│   └── extension.ts
├── core/
│   ├── client.ts
│   ├── retryLoop.ts
│   └── types.ts
├── features/
│   ├── indexer.ts
│   ├── summary.ts
│   ├── diffPreview.ts
│   ├── terminalTool.ts
│   ├── testRunner.ts
│   ├── patcher/
│   │   └── astPatcher.ts
│   └── search/
│       ├── embeddings.ts
│       ├── relevance.ts
│       └── vectorStore.ts
├── chat/
│   ├── panel.ts
│   └── view.html
├── commands/
│   ├── slashCommands.ts
│   └── rulesLoader.ts
└── ui/
    └── statusBar.ts
```

## Steps
- [x] 1. Create new folder structure
- [x] 2. Create all new files with updated imports
- [x] 3. Update package.json main entry point
- [x] 4. Delete old files
- [x] 5. Compile and verify

## Dependencies Update
All import paths need to be updated to use new relative paths:
- `./3_client` → `./core/client`
- `./5_types` → `./core/types`
- `./7_summary` → `./features/summary`
- `./8_embeddings` → `./features/search/embeddings`
- `./9_vectorStore` → `./features/search/vectorStore`
- `./10_retryLoop` → `./core/retryLoop`
- `./11_astPatcher` → `./features/patcher/astPatcher`
- `./12_diffPreview` → `./features/diffPreview`
- `./13_terminalTool` → `./features/terminalTool`
- `./14_testRunner` → `./features/testRunner`
- `./15_slashCommands` → `./commands/slashCommands`
- `./16_rulesLoader` → `./commands/rulesLoader`
- `./17_statusBar` → `./ui/statusBar`
- `./chat/panel` → `./chat/panel`

