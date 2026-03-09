import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getEmbedding, cosineSimilarity } from './vectorStore';
import { CodeGraph, buildCodeGraph, findSymbol, findRelatedFiles } from '../graph/codeGraph';

export interface ScoredFile {
    path: string;
    content: string;
    score: number;
    scoreBreakdown?: {
        semantic: number;
        graph: number;
        symbol: number;
        recency: number;
        type: number;
        keyword: number;
        intent: number;
    };
    chunks?: FileChunk[];
}

export interface FileChunk {
    content: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'import' | 'interface' | 'type' | 'header' | 'other';
    symbolName?: string;
}

export interface HybridSearchOptions {
    maxFiles?: number;
    maxTokens?: number;
    includeRelatedDepth?: number;
    weights?: {
        semantic: number;
        graph: number;
        symbol: number;
        recency: number;
        type: number;
        keyword?: number;
        intent?: number;
    };
}

// ── Intent detection ─────────────────────────────────────────────────────────
interface QueryIntent {
    type: 'ui' | 'backend' | 'config' | 'data' | 'test' | 'general';
    entities: string[];          // e.g. ['pricing', 'tier', 'plan']
    action: 'add' | 'modify' | 'delete' | 'explain' | 'general';
    targetFiles: string[];       // hint: filenames that likely contain answer
    pathBoosts: RegExp[];        // regex patterns for path boosting
    contentPatterns: RegExp[];   // patterns to search inside file content
}

function detectQueryIntent(query: string): QueryIntent {
    const q = query.toLowerCase();

    // ── Determine action ────────────────────────────────────────────
    let action: QueryIntent['action'] = 'general';
    if (/\b(add|create|insert|introduce|make|new)\b/.test(q)) action = 'add';
    else if (/\b(update|change|modify|edit|fix|refactor|replace|rename|move|convert|instead)\b/.test(q)) action = 'modify';
    else if (/\b(delete|remove|drop)\b/.test(q)) action = 'delete';
    else if (/\b(explain|describe|what|why|how)\b/.test(q)) action = 'explain';

    // ── Entity extraction ────────────────────────────────────────────
    // Extract meaningful noun phrases / identifiers
    const stopWords = new Set([
        'the','a','an','and','or','but','in','on','at','to','for','of','with',
        'by','from','as','into','during','before','after','above','below','between',
        'is','are','was','were','be','been','being','have','has','had',
        'do','does','did','will','would','should','could','may','might','must','can',
        'not','no','nor','so','yet','both','either','neither','while',
        'it','its','this','that','these','those','i','we','you','he','she','they',
        'me','us','him','her','them','my','our','your','his','their',
        'what','which','who','whom','whose','when','where','why','how',
        'all','each','every','both','few','more','most','other','some','such',
        'too','very','just','also','now','here','there','then','once',
        'please','make','change','update','modify','edit','add','create','remove',
        'instead','current','define','accordingly','want','need',
    ]);

    const entityPatterns = [
        // CamelCase identifiers
        /\b([A-Z][a-zA-Z0-9]{2,})\b/g,
        // snake_case / kebab-case identifiers
        /\b([a-z][a-z0-9]{2,}(?:[_-][a-z0-9]+)+)\b/g,
        // Words with numeric suffix (e.g. tier3, plan4)
        /\b([a-zA-Z]{2,}\d+)\b/g,
    ];

    const entities = new Set<string>();

    // Tokenize all meaningful words
    q.replace(/[^\w\s]/g, ' ').split(/\s+/).forEach(w => {
        if (w.length >= 3 && !stopWords.has(w)) entities.add(w);
    });

    // Add pattern-matched identifiers from original (case-preserved) query
    for (const pat of entityPatterns) {
        let m;
        while ((m = pat.exec(query)) !== null) {
            const word = m[1].toLowerCase();
            if (!stopWords.has(word) && word.length >= 3) entities.add(word);
        }
    }

    const entityList = Array.from(entities).slice(0, 25);

    // ── Intent type ─────────────────────────────────────────────────
    let type: QueryIntent['type'] = 'general';

    const uiTerms = /\b(pricing|plan|tier|ui|component|page|view|layout|style|css|tailwind|react|html|frontend|button|modal|card|form|dashboard|sidebar|navbar|header|footer|color|theme|design|render|display|show)\b/;
    const backendTerms = /\b(api|route|endpoint|controller|service|model|database|schema|migration|auth|middleware|server|express|handler|query|mutation)\b/;
    const configTerms = /\b(config|setting|env|environment|package|json|tsconfig|webpack|vite|babel|eslint|prettier)\b/;
    const dataTerms = /\b(store|state|redux|zustand|context|hook|data|fetch|axios|request|response|payload)\b/;
    const testTerms = /\b(test|spec|jest|describe|it|expect|mock|stub|fixture)\b/;

    if (uiTerms.test(q)) type = 'ui';
    else if (backendTerms.test(q)) type = 'backend';
    else if (configTerms.test(q)) type = 'config';
    else if (dataTerms.test(q)) type = 'data';
    else if (testTerms.test(q)) type = 'test';

    // ── Target file hinting ─────────────────────────────────────────
    const targetFiles: string[] = [];
    const pathBoosts: RegExp[] = [];
    const contentPatterns: RegExp[] = [];

    // PRICING specific - highest priority
    if (/\b(pricing|price|tier|plan|subscription|basic|premium|gold|business|free|pro|enterprise)\b/.test(q)) {
        targetFiles.push('pricing', 'plans', 'subscription', 'tiers');
        pathBoosts.push(
            /pricing/i,
            /plans?/i,
            /subscription/i,
            /tiers?/i,
        );
        contentPatterns.push(
            /pricing/i,
            /\btier\b/i,
            /\bplan\b/i,
            /price/i,
            /\$\d+/,
            /\/mo(nth)?/i,
        );
    }

    // UI / component hints
    if (/\b(component|page|view|layout)\b/.test(q)) {
        pathBoosts.push(/components?\//i, /pages?\//i, /views?\//i, /layouts?\//i);
    }

    // Route/API hints  
    if (/\b(route|api|endpoint)\b/.test(q)) {
        pathBoosts.push(/routes?\//i, /api\//i, /controllers?\//i);
    }

    // Config hints
    if (/\b(config|setting)\b/.test(q)) {
        pathBoosts.push(/config/i, /settings?/i);
        contentPatterns.push(/config/i, /settings?/i);
    }

    // For each entity, add content patterns
    for (const entity of entityList.slice(0, 8)) {
        if (entity.length >= 4) {
            contentPatterns.push(new RegExp(`\\b${escapeRegex(entity)}\\b`, 'i'));
        }
    }

    return { type, entities: entityList, action, targetFiles, pathBoosts, contentPatterns };
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Keyword density scoring ───────────────────────────────────────────────────
function scoreByKeywords(
    filePath: string,
    content: string,
    intent: QueryIntent
): number {
    const contentLower = content.toLowerCase();
    const pathLower = filePath.toLowerCase();
    let score = 0;
    let hits = 0;

    // Check content patterns (most important)
    for (const pat of intent.contentPatterns) {
        const matches = (content.match(pat) || []).length;
        if (matches > 0) {
            score += Math.min(0.15, matches * 0.03);
            hits++;
        }
    }

    // Check path boosts (high precision signal)
    for (const pat of intent.pathBoosts) {
        if (pat.test(pathLower)) {
            score += 0.4; // Strong path match = very likely correct file
            hits++;
        }
    }

    // Check target filename hints
    for (const target of intent.targetFiles) {
        if (pathLower.includes(target)) {
            score += 0.35;
            hits++;
        }
    }

    // Entity keyword matching in path
    for (const entity of intent.entities.slice(0, 10)) {
        if (pathLower.includes(entity)) {
            score += 0.15;
        }
    }

    return Math.min(1, score);
}

// ── Intent-based file type boosting ──────────────────────────────────────────
function getIntentTypeBoost(filePath: string, intent: QueryIntent): number {
    const p = filePath.toLowerCase();

    if (intent.type === 'ui') {
        // Prefer frontend files
        if (/\.(tsx|jsx)$/.test(p)) return 1.0;
        if (/\.ts$/.test(p) && /components?\/|pages?\/|views?\//.test(p)) return 0.9;
        if (/\.(ts|js)$/.test(p)) return 0.6;
        if (/tailwind|css|style/.test(p)) return 0.7;
    }

    if (intent.type === 'backend') {
        if (/routes?\/|controllers?\/|services?\/|api\//.test(p)) return 1.0;
        if (/\.(ts|js)$/.test(p)) return 0.8;
    }

    if (intent.type === 'config') {
        if (/\.(json|js)$/.test(p) && /config/.test(p)) return 1.0;
        if (/tailwind|vite|webpack|eslint|tsconfig/.test(p)) return 0.9;
    }

    if (intent.type === 'test') {
        if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(p)) return 1.0;
    }

    // General: prefer TypeScript
    if (/\.tsx?$/.test(p)) return 0.8;
    if (/\.jsx?$/.test(p)) return 0.6;
    return 0.4;
}

// ── File type weights ─────────────────────────────────────────────────────────
const FILE_TYPE_PRIORITY: Record<string, number> = {
    '.ts': 1.0,
    '.tsx': 0.95,
    '.js': 0.8,
    '.jsx': 0.75,
    '.json': 0.5,
    '.md': 0.3,
    '.css': 0.4,
    '.scss': 0.4,
    '.html': 0.4,
};

// ── Main hybrid search ────────────────────────────────────────────────────────
export async function hybridSearch(
    query: string,
    instruction: string,
    options: HybridSearchOptions = {}
): Promise<ScoredFile[]> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return [];

    const root = workspace.uri.fsPath;
    const maxFiles = options.maxFiles ?? 15;
    const maxTokens = options.maxTokens ?? 80000;
    const includeRelatedDepth = options.includeRelatedDepth ?? 2;

    const fullQuery = (query + ' ' + instruction).trim();

    // ── Detect intent ────────────────────────────────────────────────
    const intent = detectQueryIntent(fullQuery);
    console.log('[HybridSearch] Intent:', intent.type, '| Action:', intent.action, '| Entities:', intent.entities.slice(0, 8).join(', '));

    // Dynamic weights based on intent
    const baseWeights = {
        semantic: 0.20,   // reduced - often unreliable
        graph: 0.15,
        symbol: 0.15,
        recency: 0.05,
        type: 0.05,
        keyword: 0.25,    // NEW: keyword/content matching
        intent: 0.15,     // NEW: intent-based path/type scoring
    };

    // Override with user weights if provided (map old format to new)
    if (options.weights) {
        baseWeights.semantic = options.weights.semantic ?? baseWeights.semantic;
        baseWeights.graph    = options.weights.graph    ?? baseWeights.graph;
        baseWeights.symbol   = options.weights.symbol   ?? baseWeights.symbol;
        baseWeights.recency  = options.weights.recency  ?? baseWeights.recency;
        baseWeights.type     = options.weights.type     ?? baseWeights.type;
    }

    // Normalize weights
    const weightSum = Object.values(baseWeights).reduce((s, v) => s + v, 0);
    const weights = Object.fromEntries(
        Object.entries(baseWeights).map(([k, v]) => [k, v / weightSum])
    ) as typeof baseWeights;

    // ── Build code graph ─────────────────────────────────────────────
    const graph = await buildCodeGraph();

    // ── Get query symbols ────────────────────────────────────────────
    const querySymbols = extractSymbolsFromQuery(fullQuery, intent);

    // ── Get all files (broader set: include CSS/JSON for UI tasks) ───
    const globPattern = intent.type === 'ui'
        ? '**/*.{ts,tsx,js,jsx,css,scss,json}'
        : '**/*.{ts,tsx,js,jsx,json}';

    const files = await vscode.workspace.findFiles(
        globPattern,
        '**/{node_modules,dist,.git,out,.next,build}/**'
    );

    // ── Get query embedding (gracefully handle failure) ───────────────
    let queryEmbedding: number[] = [];
    const searchQuery = buildEmbeddingQuery(fullQuery, intent);
    console.log('[HybridSearch] Embedding query:', searchQuery);

    try {
        const emb = await getEmbedding(searchQuery);
        if (emb && emb.length > 0) {
            queryEmbedding = emb;
            console.log('[HybridSearch] Embedding ready, dim:', emb.length);
        }
    } catch (e) {
        console.warn('[HybridSearch] Embedding failed, using keyword-only scoring:', e);
    }

    const hasEmbeddings = queryEmbedding.length > 0;

    // ── Score all files ───────────────────────────────────────────────
    const scoredFiles: ScoredFile[] = [];

    for (const file of files) {
        try {
            const relativePath = path.relative(root, file.fsPath);
            // Skip out/ directory (compiled output)
            if (relativePath.startsWith('out' + path.sep) || relativePath.startsWith('out/')) continue;

            const doc = await vscode.workspace.openTextDocument(file);
            const content = doc.getText();

            // ── 1. Keyword / intent score (most reliable signal) ─────
            const keywordScore = scoreByKeywords(relativePath, content, intent);
            const intentScore  = getIntentTypeBoost(relativePath, intent);

            // ── 2. Semantic score ────────────────────────────────────
            let semanticScore = 0;
            if (hasEmbeddings) {
                // Only embed files that pass a minimum keyword threshold (saves API calls)
                if (keywordScore > 0.02 || content.length < 20000) {
                    try {
                        const contentForEmbed = buildFileEmbeddingContent(relativePath, content);
                        const contentEmb = await getEmbedding(contentForEmbed);
                        if (contentEmb && contentEmb.length > 0) {
                            const raw = cosineSimilarity(queryEmbedding, contentEmb);
                            // Normalize cosine similarity from [-1,1] to [0,1]
                            semanticScore = Math.max(0, (raw + 1) / 2);
                            console.log(`[HybridSearch] Semantic score for ${relativePath}: ${semanticScore.toFixed(3)} (raw: ${raw.toFixed(3)})`);
                        } else {
                            console.log(`[HybridSearch] No embedding for file: ${relativePath}`);
                        }
                    } catch (e) {
                        console.log(`[HybridSearch] Embedding error for ${relativePath}:`, e);
                    }
                }
            } else {
                console.log('[HybridSearch] No query embeddings available, skipping semantic scoring');
            }

            // ── 3. Graph proximity score ─────────────────────────────
            let graphScore = 0;
            const node = graph.nodes.get(relativePath);
            if (node) {
                // Direct symbol matches in this file
                const symbolMatches = querySymbols.flatMap(s => findSymbol(graph, s));
                const directMatches = symbolMatches.filter(s => s.file === relativePath);
                if (directMatches.length > 0) {
                    graphScore += Math.min(0.5, directMatches.length * 0.15);
                }

                // Files related to highly-scored files get a graph boost
                const related = findRelatedFiles(graph, relativePath, includeRelatedDepth);
                if (related.length > 0) {
                    graphScore += Math.min(0.2, related.length * 0.03);
                }

                // Boost if file is imported by many others (high centrality)
                const importedByCount = node.importedBy?.length ?? 0;
                graphScore += Math.min(0.15, importedByCount * 0.02);
            }

            // ── 4. Symbol matching score ─────────────────────────────
            let symbolScore = 0;
            if (querySymbols.length > 0 && node) {
                const fileSymbolNames = node.symbols.map(s => s.name.toLowerCase());
                let matchCount = 0;
                for (const qs of querySymbols) {
                    const qsl = qs.toLowerCase();
                    if (fileSymbolNames.some(fs => fs === qsl || fs.includes(qsl) || qsl.includes(fs))) {
                        matchCount++;
                    }
                }
                symbolScore = matchCount / Math.max(1, querySymbols.length);
            } else if (querySymbols.length > 0) {
                // File not in graph - do text-based symbol search
                const contentLower = content.toLowerCase();
                let matchCount = 0;
                for (const qs of querySymbols) {
                    if (contentLower.includes(qs.toLowerCase())) matchCount++;
                }
                symbolScore = Math.min(0.5, matchCount / Math.max(1, querySymbols.length));
            }

            // ── 5. Recency score ─────────────────────────────────────
            let recencyScore = 0.5; // default
            try {
                const stats = await vscode.workspace.fs.stat(file);
                const daysSinceModified = (Date.now() - stats.mtime) / (1000 * 60 * 60 * 24);
                recencyScore = Math.max(0, 1 - (daysSinceModified / 365));
            } catch { /* ignore */ }

            // ── 6. File type score ───────────────────────────────────
            const ext = path.extname(file.fsPath).toLowerCase();
            const typeScore = FILE_TYPE_PRIORITY[ext] ?? 0.3;

            // ── Weighted total ───────────────────────────────────────
            const totalScore =
                (semanticScore * weights.semantic) +
                (graphScore    * weights.graph)    +
                (symbolScore   * weights.symbol)   +
                (recencyScore  * weights.recency)  +
                (typeScore     * weights.type)     +
                (keywordScore  * weights.keyword)  +
                (intentScore   * weights.intent);

            // Lower threshold when semantic is off (keyword + intent carry it)
            const threshold = hasEmbeddings ? 0.05 : 0.03;
            if (totalScore > threshold) {
                scoredFiles.push({
                    path: relativePath,
                    content,
                    score: totalScore,
                    scoreBreakdown: {
                        semantic: semanticScore,
                        graph:    graphScore,
                        symbol:   symbolScore,
                        recency:  recencyScore,
                        type:     typeScore,
                        keyword:  keywordScore,
                        intent:   intentScore,
                    }
                });
            }
        } catch (err) {
            console.warn(`[HybridRanker] Failed to score ${file.fsPath}:`, err);
        }
    }

    // ── Sort by score descending ──────────────────────────────────────
    scoredFiles.sort((a, b) => b.score - a.score);

    console.log('[HybridSearch] Top 5 scores:',
        scoredFiles.slice(0, 5).map(f => `${f.path}(${f.score.toFixed(3)})`).join(', '));

    // ── Apply token budget ────────────────────────────────────────────
    const result: ScoredFile[] = [];
    let tokenCount = 0;

    for (const file of scoredFiles) {
        if (result.length >= maxFiles) break;
        const fileTokens = Math.ceil(file.content.length / 4);
        result.push(file);
        tokenCount += fileTokens;
        if (tokenCount > maxTokens) break;
    }

    return result;
}

// ── Build a focused embedding query ──────────────────────────────────────────
function buildEmbeddingQuery(query: string, intent: QueryIntent): string {
    // Start with entities (most important concepts)
    const parts: string[] = [];

    // Add intent type context
    parts.push(intent.type);

    // Add entities
    parts.push(...intent.entities.slice(0, 8));

    // Add target files
    parts.push(...intent.targetFiles.slice(0, 3));

    // Deduplicate and join
    const unique = [...new Set(parts)].filter(p => p.length > 0);
    return unique.join(' ');
}

// ── Build a representative snippet of the file for embedding ─────────────────
function buildFileEmbeddingContent(filePath: string, content: string): string {
    const MAX_CHARS = 6000;
    // Use filename + first portion of file
    const fileName = path.basename(filePath, path.extname(filePath));
    const snippet = content.slice(0, MAX_CHARS - fileName.length - 10);
    return `${fileName}\n${snippet}`;
}

// ── Extract query symbols ────────────────────────────────────────────────────
function extractSymbolsFromQuery(query: string, intent: QueryIntent): string[] {
    const symbols = new Set<string>(intent.entities);

    // Add CamelCase references
    const camelPattern = /\b([A-Z][a-zA-Z0-9]{2,})\b/g;
    let m;
    while ((m = camelPattern.exec(query)) !== null) {
        symbols.add(m[1]);
    }

    // Add explicit function call patterns: functionName(
    const callPattern = /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\s*\(/g;
    while ((m = callPattern.exec(query)) !== null) {
        symbols.add(m[1]);
    }

    return Array.from(symbols).filter(s => s.length >= 3).slice(0, 20);
}

// ── Rerank by instruction (post-search boost) ─────────────────────────────────
export function rerankByInstruction(
    files: ScoredFile[],
    instruction: string,
    topK = 15
): ScoredFile[] {
    const intent = detectQueryIntent(instruction);
    const instructionLower = instruction.toLowerCase();
    const keywords = instructionLower
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(k => k.length >= 4);

    const reranked = files.map(file => {
        let boost = 0;
        const filePathLower = file.path.toLowerCase();
        const contentLower = file.content.toLowerCase();

        // Path keyword boost
        for (const keyword of keywords) {
            if (filePathLower.includes(keyword)) boost += 0.3;
        }

        // Content frequency boost (capped)
        for (const keyword of keywords.slice(0, 5)) {
            const matches = (contentLower.match(new RegExp(escapeRegex(keyword), 'g')) || []).length;
            boost += Math.min(0.15, matches * 0.015);
        }

        // Intent path boosts
        for (const pat of intent.pathBoosts) {
            if (pat.test(filePathLower)) boost += 0.4;
        }

        return { ...file, score: file.score + boost };
    });

    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, topK);
}