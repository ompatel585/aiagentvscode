# 🤖 Om AI Agent — VSCode Extension

> An intelligent AI coding agent for Visual Studio Code powered by Google Gemini 2.5 Flash. It understands your entire codebase through hybrid semantic + graph-based search, generates precise multi-file code edits, and applies them safely with AST-validated patching.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Module Reference](#module-reference)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Installation & Setup](#installation--setup)
- [Usage Guide](#usage-guide)
- [Slash Commands](#slash-commands)
- [Configuration](#configuration)
- [Project Rules System](#project-rules-system)
- [Scoring & Ranking Algorithm](#scoring--ranking-algorithm)
- [Patch Format Specification](#patch-format-specification)
- [Technology Stack](#technology-stack)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Overview

Om AI Agent is a VS Code extension that brings agentic AI capabilities directly into your editor. Unlike simple autocomplete tools, it reasons about your **entire codebase** — understanding imports, exports, class hierarchies, and symbol relationships — before generating precise, multi-file edits.

The agent uses a **multi-signal hybrid ranking system** combining:
- Semantic vector embeddings (Google `text-embedding-004`)
- AST-based code graph traversal (TypeScript compiler API)
- Keyword density and intent analysis
- Symbol matching
- File recency and type priority

All edits are validated through TypeScript's compiler diagnostics before being written to disk.

---

## Features

| Feature | Description |
|---|---|
| **Hybrid Context Search** | 7-signal scoring system that finds exactly the right files before prompting the AI |
| **Code Graph Analysis** | AST-level import/export graph with symbol resolution across the workspace |
| **Multi-Pass Patching** | Iterative patch validation with up to 3 correction passes |
| **AST-Safe Writes** | Patches are validated with TypeScript's `getSyntacticDiagnostics()` before writing |
| **Side-by-Side Diff** | GitHub-style diff preview before applying any changes |
| **Slash Commands** | `/explain`, `/fix`, `/doc`, `/test`, `/commit` in the chat panel |
| **Vector Caching** | Embeddings are cached to avoid redundant API calls |
| **Project Rules** | `.om-ai-rules.md` injected into every prompt (like `.cursorrules`) |
| **Retry Loop** | Automatic retry with clarifying instructions on malformed AI responses |
| **Context Compression** | Token-budget-aware context trimming for large codebases |

---

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension Host                    │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │  Chat Panel  │    │  Slash Cmds  │    │   Extension Main  │    │
│  │  (Webview)   │◄──►│  /explain    │◄──►│  Command Palette │    │
│  │  panel.ts   │    │  /fix /doc   │    │  extension.ts    │    │
│  └──────┬──────┘    │  /test       │    └────────┬─────────┘    │
│         │           └──────────────┘             │              │
│         ▼                                        ▼              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    CORE PIPELINE                         │    │
│  │                                                          │    │
│  │  ┌──────────────┐    ┌─────────────┐    ┌────────────┐  │    │
│  │  │ HybridSearch │    │  RetryLoop  │    │ RulesLoader│  │    │
│  │  │  (Ranker)    │───►│  callBrain  │◄───│ .om-ai-    │  │    │
│  │  │              │    │             │    │ rules.md   │  │    │
│  │  └──────┬───────┘    └──────┬──────┘    └────────────┘  │    │
│  │         │                  │                            │    │
│  │         ▼                  ▼                            │    │
│  │  ┌──────────────┐    ┌─────────────┐                   │    │
│  │  │  Code Graph  │    │  Multi-Pass │                   │    │
│  │  │  (AST Parse) │    │  Patcher    │                   │    │
│  │  └──────────────┘    └──────┬──────┘                   │    │
│  │                             │                           │    │
│  │                             ▼                           │    │
│  │                    ┌─────────────────┐                  │    │
│  │                    │  AST Patcher    │                  │    │
│  │                    │  (Syntax Check) │                  │    │
│  │                    └────────┬────────┘                  │    │
│  └────────────────────────────┼────────────────────────────┘    │
│                               │                                  │
│                               ▼                                  │
│                    ┌──────────────────┐                         │
│                    │  Diff Preview    │                         │
│                    │  (Side-by-Side)  │                         │
│                    └────────┬─────────┘                         │
│                             │  apply / cancel                   │
│                             ▼                                   │
│                    ┌──────────────────┐                         │
│                    │  Workspace Files │                         │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (HTTP)
              ┌───────────────────────────────┐
              │     Google Generative AI API   │
              │  • gemini-2.5-flash (Brain)    │
              │  • text-embedding-004 (Embed)  │
              └───────────────────────────────┘
```

### Module Dependency Graph

```
extension.ts (main)
├── chat/panel.ts              ← Webview UI
├── commands/slashCommands.ts  ← /explain /fix /doc /test /commit
│   └── core/client.ts         ← Gemini API wrapper
├── commands/rulesLoader.ts    ← .om-ai-rules.md loader
├── features/indexer.ts        ← Workspace file discovery
├── features/diffPreview.ts    ← Side-by-side diff UI
├── features/search/
│   ├── hybridRanker.ts        ← Main search + scoring
│   │   ├── vectorStore.ts     ← Embedding cache + cosine similarity
│   │   └── graph/codeGraph.ts ← AST-based import/symbol graph
│   ├── embeddings.ts          ← (deprecated) simple semantic search
│   ├── contextCompressor.ts   ← Token budget trimmer
│   └── relevance.ts           ← Relevance utilities
├── features/patcher/
│   ├── multiPassPatcher.ts    ← Multi-pass validation loop
│   └── astPatcher.ts          ← Bottom-up line-range patch applicator
└── core/
    ├── client.ts              ← Gemini Brain + Embedding API
    ├── retryLoop.ts           ← 3-attempt retry with correction
    └── types.ts               ← Shared TypeScript types
```

---

## Module Reference

### `core/client.ts` — Gemini API Client

The central API wrapper. Exposes two functions:

**`callBrain(payload)`**
- Model: `gemini-2.5-flash` with `temperature: 0.1`, `responseMimeType: application/json`
- Sends the instruction, project summary, and semantic context (relevant file snippets)
- Implements 4-strategy JSON parse fallback: direct → strip fences → regex extract → `"success"` key search
- Returns: `{ success, summary, changes: [{ path, edits: [{ startLine, endLine, newText }] }] }`

**`callEmbeddingAPI(text)`**
- Model: `text-embedding-004`
- Returns a float array of 768 dimensions
- Logs embedding dimension count and any API errors

---

### `core/retryLoop.ts` — Retry Wrapper

Calls `callBrain` up to **3 times**. On each failure (no changes array, invalid JSON), it appends `"Return valid JSON with changes array."` to the instruction and retries. Returns the first successful response or `{ success: false, changes: [] }`.

---

### `features/search/hybridRanker.ts` — Hybrid Search Engine

The most sophisticated module. Scores every file in the workspace across **7 signals**:

| Signal | Weight | Description |
|---|---|---|
| `keyword` | 25% | Content pattern matching, path boosts, entity density |
| `intent` | 15% | File type boost based on detected query intent (ui/backend/config/test/data) |
| `semantic` | 20% | Cosine similarity of query embedding vs file embedding |
| `graph` | 15% | Symbol direct matches + related file proximity + import centrality |
| `symbol` | 15% | Named symbol matching against extracted query entities |
| `recency` | 5% | Days-since-modified decay over 365-day window |
| `type` | 5% | File extension priority (`.ts` → 1.0, `.tsx` → 0.95, `.js` → 0.8, ...) |

**Intent Detection** classifies queries into: `ui`, `backend`, `config`, `data`, `test`, `general` — and adjusts file type boosts accordingly.

**Token Budget**: Results are returned with a configurable `maxTokens` (default 80,000) and `maxFiles` (default 15) cap, preventing context overflow.

---

### `features/graph/codeGraph.ts` — AST Code Graph

Builds a workspace-wide dependency graph using the **TypeScript Compiler API** (`ts.createSourceFile`). For each `.ts/.tsx/.js/.jsx/.mjs` file:

- **Parses imports**: Extracts all `import` declarations into `node.imports[]`
- **Parses exports**: Collects exported functions, classes, interfaces, type aliases, and variable declarations into `node.exports[]`
- **Symbol table**: Records every symbol with `{ name, kind, file, line, endLine, scope }`
- **Reverse relationships**: Builds `importedBy[]` arrays for calculating file centrality

Graph is **cached in memory** (`cachedGraph`) and can be force-rebuilt.

---

### `features/patcher/astPatcher.ts` — AST-Safe Patch Applicator

Applies line-range patches bottom-up (sorted by `startLine` descending) to prevent offset drift:

1. Creates the file if it doesn't exist (including parent directories)
2. Sorts edits by `startLine` descending
3. Applies each edit via `Array.splice()` on the lines array
4. For TypeScript files, validates with `ts.getSyntacticDiagnostics()`
5. **Only writes to disk if syntax is valid** — otherwise logs errors and skips

---

### `features/patcher/multiPassPatcher.ts` — Multi-Pass Validator

Runs up to **3 validation passes** on a set of patches:

1. Validates import resolution (warns on broken relative imports)
2. Validates edit range integrity (`startLine <= endLine`)
3. Validates cross-file dependency ordering
4. If critical errors found, calls `fixPatchErrors()` to attempt AI-driven correction
5. Returns `{ success, changes, pass, diagnostics }`

---

### `features/search/vectorStore.ts` — Embedding Cache

Maintains an in-memory cache of `text → float[]` embeddings. Exports:
- `getEmbedding(text)` — returns cached or freshly computed embedding
- `cosineSimilarity(a, b)` — dot product normalized by magnitudes

---

### `commands/slashCommands.ts` — Slash Command Dispatcher

Parses user messages starting with `/` and routes to specialized handlers:

| Command | Behavior |
|---|---|
| `/explain` | Explains selected editor code via `callBrain` |
| `/fix [description]` | Returns a fix instruction for the caller to dispatch |
| `/doc` | Generates JSDoc/TSDoc comments for selected code |
| `/test` | Generates Jest unit tests for selected code |
| `/commit` | Generates a conventional commit message from staged diff |

---

### `commands/rulesLoader.ts` — Project Rules

Reads `.om-ai-rules.md` from workspace root and injects it into every prompt. Supports creating a default rules file via `initRulesFile()`. This enables project-specific AI behavior (similar to Cursor's `.cursorrules`).

---

### `chat/panel.ts` — Chat Webview

A `WebviewViewProvider` that renders a dark-themed chat UI using VS Code's webview theming tokens (`--vscode-*` CSS variables). Supports:
- `postLog(text)` — grey status messages
- `postMessage(text)` — AI assistant bubbles
- Inbound `{ type: 'prompt', text }` messages from the webview
- Clear history button

---

### `features/diffPreview.ts` — Side-by-Side Diff Viewer

Creates a VS Code webview panel with a GitHub-style side-by-side diff:
- Left column: original file content
- Right column: patched file content
- Lines colored green (additions) / red (deletions)
- Buttons: **Apply Changes** (writes patches) or **Cancel**
- Displays total additions/deletions counts

---

### `features/indexer.ts` — File Indexer

Simple wrapper around `vscode.workspace.findFiles` that returns all `.ts/.tsx/.js/.jsx` files excluding `node_modules`, `dist`, and `.git`.

---

## Data Flow Diagrams

### DFD Level 0 — Context Diagram

```
                    ┌───────────────────┐
   User Input       │                   │   File Edits
  (chat / slash) ──►│   Om AI Agent     │──► (workspace files)
                    │   VSCode Ext      │
   API Keys        ►│                   │◄── Workspace Files
  (GEMINI_API_KEY)  │                   │
                    └───────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Google Gemini API │
                    └───────────────────┘
```

---

### DFD Level 1 — Main Processes

```
  ┌────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  [User]                                                        │
  │    │ natural language instruction                              │
  │    ▼                                                           │
  │  ┌────────────────────┐                                        │
  │  │  P1: Parse Input   │──── slash command? ──►  P1a: SlashCmd  │
  │  └────────┬───────────┘                         Dispatcher    │
  │           │ plain instruction                                  │
  │           ▼                                                    │
  │  ┌────────────────────┐   file list      ┌──────────────────┐ │
  │  │  P2: Index & Build │─────────────────►│  D1: Code Graph  │ │
  │  │  Code Graph        │◄─────────────────│  (in-memory)     │ │
  │  └────────┬───────────┘   graph data     └──────────────────┘ │
  │           │                                                    │
  │           ▼                                                    │
  │  ┌────────────────────┐   query embedding ┌─────────────────┐ │
  │  │  P3: Hybrid Search │──────────────────►│  D2: Vector     │ │
  │  │  (7-signal scorer) │◄──────────────────│  Cache          │ │
  │  └────────┬───────────┘   cached vectors  └─────────────────┘ │
  │           │ ranked file contexts                               │
  │           ▼                                                    │
  │  ┌────────────────────┐   prompt          ┌─────────────────┐ │
  │  │  P4: Call Brain    │──────────────────►│  External:      │ │
  │  │  (Gemini 2.5)      │◄──────────────────│  Gemini API     │ │
  │  └────────┬───────────┘   JSON patches    └─────────────────┘ │
  │           │                                                    │
  │           ▼                                                    │
  │  ┌────────────────────┐                                        │
  │  │  P5: Multi-Pass    │─── error? ──► retry / fix patches     │
  │  │  Patch Validation  │                                        │
  │  └────────┬───────────┘                                        │
  │           │ valid patches                                      │
  │           ▼                                                    │
  │  ┌────────────────────┐                                        │
  │  │  P6: Diff Preview  │◄── user reviews ──► apply / cancel    │
  │  └────────┬───────────┘                                        │
  │           │ confirmed                                          │
  │           ▼                                                    │
  │  ┌────────────────────┐                                        │
  │  │  P7: AST Patcher   │── validates syntax ──► write files    │
  │  └────────────────────┘                                        │
  │                                                                 │
  └────────────────────────────────────────────────────────────────┘
```

---

### DFD Level 2 — Hybrid Search (P3 detail)

```
  instruction + query
        │
        ▼
  ┌─────────────────────┐
  │ detectQueryIntent() │
  │  - action: add/     │
  │    modify/delete/   │
  │    explain          │
  │  - type: ui/        │
  │    backend/config/  │
  │    data/test        │
  │  - entities: []     │
  │  - pathBoosts: []   │
  │  - contentPats: []  │
  └────────┬────────────┘
           │ intent object
           ▼
  ┌─────────────────────┐   API call  ┌──────────────────────┐
  │ buildEmbeddingQuery │────────────►│  text-embedding-004  │
  │ (focused terms)     │◄────────────│  768-dim vector      │
  └────────┬────────────┘   queryEmb  └──────────────────────┘
           │
           ▼
  For each workspace file:
  ┌────────────────────────────────────────────────────────────┐
  │                                                             │
  │  ① keywordScore = scoreByKeywords(path, content, intent)   │
  │     - content pattern matches (0.03 each, cap 0.15)        │
  │     - path boost matches (+0.40)                           │
  │     - target filename hints (+0.35)                        │
  │     - entity in path (+0.15)                               │
  │                                                             │
  │  ② intentScore = getIntentTypeBoost(path, intent)          │
  │     - ui → prefer .tsx/.jsx                                │
  │     - backend → prefer routes/controllers                  │
  │     - config → prefer config/* .json                       │
  │                                                             │
  │  ③ semanticScore = cosineSimilarity(queryEmb, fileEmb)     │
  │     - only if keywordScore > 0.02 (saves API quota)        │
  │     - normalized from [-1,1] → [0,1]                       │
  │                                                             │
  │  ④ graphScore (from codeGraph):                            │
  │     - direct symbol match (+0.15 each, cap 0.5)            │
  │     - related file depth (+0.03 each, cap 0.2)             │
  │     - import centrality (+0.02 per importer, cap 0.15)     │
  │                                                             │
  │  ⑤ symbolScore = matched query symbols / total symbols     │
  │                                                             │
  │  ⑥ recencyScore = 1 - (daysSinceModified / 365)            │
  │                                                             │
  │  ⑦ typeScore from FILE_TYPE_PRIORITY map                    │
  │                                                             │
  │  TOTAL = Σ(score_i × weight_i)                             │
  │                                                             │
  └────────────────────────────────────────────────────────────┘
           │ scored files (sorted desc)
           ▼
  Apply token budget: maxFiles=15, maxTokens=80,000
           │
           ▼
  Top ranked files with content → Brain prompt context
```

---

### DFD Level 2 — Patch Application (P7 detail)

```
  AI Response JSON
  { changes: [{ path, edits: [{ startLine, endLine, newText }] }] }
        │
        ▼
  For each file patch:
  ┌────────────────────────────────────────────────────────────┐
  │                                                             │
  │  1. File exists? No → mkdirSync + writeFileSync("")        │
  │                                                             │
  │  2. Read original content                                   │
  │                                                             │
  │  3. Sort edits by startLine DESCENDING                      │
  │     (bottom-up prevents offset drift)                       │
  │                                                             │
  │  4. For each edit:                                          │
  │     a. Clamp start/end to valid line range                  │
  │     b. Split newText into lines array                       │
  │     c. lines.splice(start, deleteCount, ...newLines)        │
  │     d. Rejoin with \n                                       │
  │                                                             │
  │  5. For .ts / .tsx files only:                              │
  │     a. ts.createProgram() with custom host                  │
  │     b. program.getSyntacticDiagnostics()                    │
  │     c. If errors → log and SKIP write                       │
  │     d. If clean → write to disk                             │
  │                                                             │
  │  6. For .js / .jsx / other:                                 │
  │     → write to disk directly                                │
  │                                                             │
  └────────────────────────────────────────────────────────────┘
```

---

## Installation & Setup

### Prerequisites

- **VS Code** 1.80+
- **Node.js** 18+
- **Google Gemini API key** with access to:
  - `gemini-2.5-flash`
  - `text-embedding-004`

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/aiagentvscode.git
   cd aiagentvscode
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set environment variable**
   ```bash
   export GEMINI_API_KEY=your_api_key_here
   ```

4. **Build the extension**
   ```bash
   npm run build
   # or for watch mode
   npm run watch
   ```

5. **Launch in Extension Development Host**
   - Open the project in VS Code
   - Press `F5` to launch the Extension Development Host
   - The Om AI Agent panel will appear in the sidebar

---

## Usage Guide

### Chat Panel

Open the Om AI Agent sidebar panel. Type a natural language instruction:

```
Add a loading spinner to the dashboard component
```

```
Refactor the AuthService to use JWT instead of sessions
```

```
Fix the type errors in the pricing module
```

The agent will:
1. Analyze your codebase
2. Find the most relevant files
3. Generate precise line-range patches
4. Show you a diff preview
5. Apply changes only after your confirmation

---

## Slash Commands

| Command | Usage | Description |
|---|---|---|
| `/explain` | Select code → `/explain` | AI explains the selected code |
| `/fix` | Select code → `/fix` | AI generates a fix for selected code |
| `/fix <desc>` | `/fix make it async` | Fix with additional instructions |
| `/doc` | Select code → `/doc` | Generates JSDoc/TSDoc comments |
| `/test` | Select code → `/test` | Generates Jest unit tests |
| `/commit` | `/commit` | Generates a conventional commit message |

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Google Generative AI API key |

### Search Options

The hybrid search accepts optional configuration:

```typescript
{
  maxFiles: 15,           // Max files to include in context
  maxTokens: 80000,       // Max token budget for file contents
  includeRelatedDepth: 2, // Graph traversal depth for related files
  weights: {
    semantic: 0.20,
    graph: 0.15,
    symbol: 0.15,
    recency: 0.05,
    type: 0.05,
    keyword: 0.25,
    intent: 0.15
  }
}
```

---

## Project Rules System

Create `.om-ai-rules.md` in your workspace root to inject project-specific rules into every AI prompt:

```markdown
# My Project Rules

## Code Style
- Use TypeScript strict mode
- Prefer async/await over callbacks
- Use descriptive variable names

## Architecture
- All API calls go through the `api/` directory
- Components must have a corresponding `.test.tsx` file

## Conventions
- Use Tailwind for styling, no inline styles
- Follow the existing naming conventions
```

Initialize the default rules file:
- Open Command Palette (`Ctrl+Shift+P`)
- Run: `Om AI: Initialize Rules File`

---

## Scoring & Ranking Algorithm

The hybrid ranker normalizes all 7 weights to sum to 1.0, then computes a weighted sum per file. The final ranking formula:

```
totalScore = (semantic × 0.20) +
             (graph    × 0.15) +
             (symbol   × 0.15) +
             (recency  × 0.05) +
             (type     × 0.05) +
             (keyword  × 0.25) +
             (intent   × 0.15)
```

Files scoring below `0.05` (with embeddings) or `0.03` (keyword-only mode) are excluded. Top-N files are then selected within the token budget.

**Embedding optimization**: Files only get embedded if their keyword score exceeds 0.02 or their content is under 20,000 characters. This significantly reduces API calls on large codebases.

---

## Patch Format Specification

The AI Brain is instructed to return patches in this exact JSON format:

```json
{
  "success": true,
  "summary": "One-line description of changes",
  "changes": [
    {
      "path": "src/components/Button.tsx",
      "edits": [
        {
          "startLine": 10,
          "endLine": 15,
          "newText": "const Button = ({ label, onClick }: ButtonProps) => {\n  return <button onClick={onClick}>{label}</button>;\n};\n"
        }
      ]
    }
  ]
}
```

**Rules enforced in the prompt:**
- Line numbers are 0-indexed
- Multiple edits in one file MUST be sorted by `startLine` descending
- `endLine` is exclusive (like Python slicing)
- `newText` must be syntactically complete
- For changes >30 lines, replace the entire file (`startLine=0, endLine=<total>`)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ / VS Code Extension API |
| Language | TypeScript |
| AI Model | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| Embeddings | Google `text-embedding-004` (768 dimensions) |
| AST Parsing | TypeScript Compiler API (`typescript` npm package) |
| UI | VS Code Webview API + vanilla HTML/CSS/JS |
| Search | Custom hybrid ranker (no external dependencies) |
| Vector Math | Custom cosine similarity implementation |

---

## Development

### Project Structure

```
aiagentvscode/
├── src/                        # TypeScript source (compiled to out/)
│   ├── chat/
│   │   ├── panel.ts            # Webview provider
│   │   └── view.html           # Chat UI template
│   ├── commands/
│   │   ├── slashCommands.ts    # /explain /fix /doc /test /commit
│   │   └── rulesLoader.ts      # .om-ai-rules.md support
│   ├── core/
│   │   ├── client.ts           # Gemini API wrapper
│   │   ├── retryLoop.ts        # 3-attempt retry
│   │   └── types.ts            # Shared types
│   ├── features/
│   │   ├── indexer.ts          # File discovery
│   │   ├── diffPreview.ts      # Side-by-side diff
│   │   ├── graph/
│   │   │   └── codeGraph.ts    # AST dependency graph
│   │   ├── patcher/
│   │   │   ├── astPatcher.ts   # Line-range patch applicator
│   │   │   └── multiPassPatcher.ts
│   │   └── search/
│   │       ├── hybridRanker.ts # Main 7-signal ranker
│   │       ├── vectorStore.ts  # Embedding cache
│   │       ├── embeddings.ts   # (deprecated)
│   │       ├── contextCompressor.ts
│   │       └── relevance.ts
│   └── main/
│       └── extension.ts        # Entry point
├── out/                        # Compiled JS output
├── media/
│   └── icon.svg
├── .om-ai-rules.md             # (user-created) project rules
├── buildindex.js               # Index builder utility
└── package.json
```

### Build Commands

```bash
npm run build      # Compile TypeScript
npm run watch      # Watch mode
npm run lint       # ESLint
npm run test       # Run tests
```

### Debugging

Enable detailed logging in the VS Code Output panel under `Om AI Agent`:

- `[Embedding]` — API calls and embedding dimensions
- `[HybridSearch]` — Per-file scores and intent detection
- `[CodeGraph]` — Graph build stats
- `[AstPatcher]` — Patch application and syntax errors
- `[MultiPassPatcher]` — Validation passes

---

## Troubleshooting

### `GEMINI_API_KEY is not set`
Set the environment variable before launching VS Code:
```bash
export GEMINI_API_KEY=your_key
code .
```

### Embeddings not working / semantic scores are 0
- Check Output panel for `[Embedding]` errors
- Verify your API key has access to `text-embedding-004`
- The ranker will fall back to keyword-only scoring automatically

### Patches not applying
- Check for `[AstPatcher] Syntax errors` in Output panel
- The AI may have generated syntactically invalid code — retry the instruction
- Check that `startLine`/`endLine` are within file bounds

### Wrong files being selected
- Improve your instruction specificity
- Add `.om-ai-rules.md` with explicit conventions
- Use slash commands with selection context for targeted edits

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built with ❤️ using Google Gemini 2.5 Flash and the TypeScript Compiler API*
