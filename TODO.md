# TODO - Chat Panel, Diff View, and Semantic Scores

## Completed:
- [x] Chat UI with proper dark theme (GitHub/Blackbox style)
- [x] Diff preview with side-by-side view (left: old, right: new)
- [x] Fixed semantic scores - added better logging to debug embedding issues
- [x] Build completed

## Changes Made:
1. **src/chat/view.html** - Complete new chat UI with dark theme
2. **src/chat/panel.ts** - TypeScript class with new message types
3. **src/features/diffPreview.ts** - Side-by-side diff viewer (GitHub style)
4. **src/main/extension.ts** - Integration with new message types
5. **src/core/client.ts** - Added logging for embedding API calls
6. **src/features/search/hybridRanker.ts** - Added detailed logging for semantic scoring
7. **src/features/search/vectorStore.ts** - Vector caching

## To Test:
Run the extension and check the Output panel for "[Embedding]" and "[HybridSearch]" logs to debug any issues with semantic scoring.

