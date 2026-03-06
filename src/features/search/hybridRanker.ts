import * as vscode from 'vscode';
import * as path from 'path';
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
    };
}

const DEFAULT_WEIGHTS = {
    semantic: 0.35,
    graph: 0.25,
    symbol: 0.20,
    recency: 0.10,
    type: 0.10
};

const FILE_TYPE_PRIORITY: Record<string, number> = {
    '.ts': 1.0,
    '.tsx': 0.95,
    '.js': 0.8,
    '.jsx': 0.75,
    '.json': 0.5,
    '.md': 0.3
};

export async function hybridSearch(
    query: string,
    instruction: string,
    options: HybridSearchOptions = {}
): Promise<ScoredFile[]> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return [];

    const root = workspace.uri.fsPath;
    const maxFiles = options.maxFiles ?? 10;
    const maxTokens = options.maxTokens ?? 60000;
    const includeRelatedDepth = options.includeRelatedDepth ?? 2;
    const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

    // Build code graph
    const graph = await buildCodeGraph();

    // Extract symbols from query
    const querySymbols = extractSymbolsFromQuery(query + ' ' + instruction);

    // Get all files
    const files = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx}',
        '**/{node_modules,dist,.git,out}/**'
    );

    // Get query embedding
    const queryEmbedding = await getEmbedding(query + ' ' + instruction);

    // Calculate scores for all files
    const scoredFiles: ScoredFile[] = [];

    for (const file of files) {
        try {
            const doc = await vscode.workspace.openTextDocument(file);
            const content = doc.getText();
            const relativePath = path.relative(root, file.fsPath);

            // 1. Semantic score
            const contentEmbedding = await getEmbedding(content.slice(0, 8000));
            const semanticScore = cosineSimilarity(queryEmbedding, contentEmbedding);

            // 2. Graph proximity score
            let graphScore = 0;
            const node = graph.nodes.get(relativePath);
            
            if (node) {
                // Direct symbol matches boost score
                const symbolMatches = querySymbols.flatMap(s => findSymbol(graph, s));
                const directMatches = symbolMatches.filter(s => s.file === relativePath);
                
                if (directMatches.length > 0) {
                    graphScore = Math.min(1, directMatches.length * 0.2);
                }

                // Related files get a boost
                const related = findRelatedFiles(graph, relativePath, includeRelatedDepth);
                graphScore += Math.min(0.3, related.length * 0.05);
            }

            // 3. Symbol matching score
            let symbolScore = 0;
            if (querySymbols.length > 0 && node) {
                const fileSymbols = node.symbols.map(s => s.name.toLowerCase());
                const matchedSymbols = querySymbols.filter(s => 
                    fileSymbols.some(fs => fs.includes(s.toLowerCase()) || s.toLowerCase().includes(fs))
                );
                symbolScore = Math.min(1, matchedSymbols.length / querySymbols.length);
            }

            // 4. Recency score (recently modified files get a boost)
            const stats = await vscode.workspace.fs.stat(file);
            const daysSinceModified = (Date.now() - stats.mtime) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.max(0, 1 - (daysSinceModified / 365)); // Decay over a year

            // 5. File type score
            const ext = path.extname(file.fsPath).toLowerCase();
            const typeScore = FILE_TYPE_PRIORITY[ext] ?? 0.5;

            // Calculate weighted total
            const totalScore = 
                (semanticScore * weights.semantic) +
                (graphScore * weights.graph) +
                (symbolScore * weights.symbol) +
                (recencyScore * weights.recency) +
                (typeScore * weights.type);

            // Only include files with some relevance
            if (totalScore > 0.05) {
                scoredFiles.push({
                    path: relativePath,
                    content,
                    score: totalScore,
                    scoreBreakdown: {
                        semantic: semanticScore,
                        graph: graphScore,
                        symbol: symbolScore,
                        recency: recencyScore,
                        type: typeScore
                    }
                });
            }
        } catch (err) {
            console.warn(`[HybridRanker] Failed to score ${file.fsPath}:`, err);
        }
    }

    // Sort by score descending
    scoredFiles.sort((a, b) => b.score - a.score);

    // Filter by token budget
    const result: ScoredFile[] = [];
    let tokenCount = 0;

    for (const file of scoredFiles) {
        const fileTokens = Math.ceil(file.content.length / 4);
        if (tokenCount + fileTokens > maxTokens && result.length >= maxFiles) {
            continue;
        }
        
        // Prioritize higher scored files for token budget
        if (result.length < maxFiles) {
            result.push(file);
            tokenCount += fileTokens;
        }
    }

    return result;
}

function extractSymbolsFromQuery(query: string): string[] {
    // Common patterns that indicate symbol names
    const patterns = [
        // calls Function: functionName(
        /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
        // Type references: TypeName
        /\b([A-Z][a-zA-Z0-9_]*)\b/g,
        // Variable assignments: = variableName
        /=\s*([a-zA-Z_][a-zA-Z0-9_]*)/g,
        // Import statements: import ... from 'module'
        /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
        // export statements
        /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|interface|type)\s+(\w+)/g
    ];

    const symbols = new Set<string>();
    const lowerQuery = query.toLowerCase();

    // Filter out common English words that look like symbols
    const commonWords = new Set([
        'function', 'class', 'interface', 'type', 'const', 'let', 'var',
        'return', 'import', 'export', 'from', 'async', 'await', 'if', 'else',
        'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch',
        'throw', 'new', 'this', 'super', 'extends', 'implements', 'public',
        'private', 'protected', 'static', 'readonly', 'void', 'null', 'undefined',
        'true', 'false', 'number', 'string', 'boolean', 'any', 'unknown', 'never',
        'the', 'a', 'an', 'and', 'or', 'but', 'not', 'is', 'are', 'was', 'were',
        'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'should', 'could', 'may', 'might', 'must', 'can', 'need', 'that',
        'which', 'what', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
        'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'only',
        'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
        'there', 'then', 'once', 'add', 'update', 'delete', 'create', 'get', 'set',
        'build', 'make', 'use', 'using', 'used', 'call', 'called', 'see', 'show',
        'take', 'put', 'give', 'send', 'find', 'want', 'think', 'know', 'like', 'look'
    ]);

    for (const pattern of patterns) {
        const matches = query.matchAll(pattern);
        for (const match of matches) {
            const symbol = match[1];
            if (symbol && 
                symbol.length > 2 && 
                !commonWords.has(symbol.toLowerCase()) &&
                !lowerQuery.includes(symbol.toLowerCase() + ' is') &&
                !lowerQuery.includes(symbol.toLowerCase() + ' are')) {
                symbols.add(symbol);
            }
        }
    }

    // Also check for specific terms that might be code-related
    const codeTerms = query.match(/\b(handle|process|parse|validate|normalize|extract|build|generate|compute|calculate|resolve|load|save|cache|fetch|submit|confirm|reject|accept|deny|allow|block|enable|disable|show|hide|open|close|read|write)\b/gi);
    if (codeTerms) {
        codeTerms.forEach(term => symbols.add(term));
    }

    return Array.from(symbols).slice(0, 20); // Limit to 20 symbols
}

export function rerankByInstruction(
    files: ScoredFile[],
    instruction: string,
    topK = 5
): ScoredFile[] {
    // Simple reranking based on instruction keywords
    const instructionLower = instruction.toLowerCase();
    const keywords = instructionLower.split(/\s+/).filter(k => k.length > 3);

    const reranked = files.map(file => {
        let boost = 0;
        const filePathLower = file.path.toLowerCase();
        const contentLower = file.content.toLowerCase();

        for (const keyword of keywords) {
            // Boost for path matches
            if (filePathLower.includes(keyword)) {
                boost += 0.3;
            }
            // Boost for content matches (limit to avoid over-boosting)
            const contentMatches = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
            boost += Math.min(0.2, contentMatches * 0.02);
        }

        return {
            ...file,
            score: file.score + boost
        };
    });

    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, topK);
}

