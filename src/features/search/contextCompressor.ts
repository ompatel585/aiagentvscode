import * as ts from 'typescript';
import * as path from 'path';
import { SymbolDefinition, CodeGraph, buildCodeGraph, findSymbol } from '../graph/codeGraph';

export interface CompressedChunk {
    content: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'method' | 'import' | 'interface' | 'type' | 'header' | 'related';
    symbolName?: string;
    importance: number;
}

export interface CompressedFile {
    path: string;
    chunks: CompressedChunk[];
    totalTokens: number;
    originalTokens: number;
    compressionRatio: number;
}

export interface CompressionOptions {
    maxTokens?: number;
    query?: string;
    includeImports?: boolean;
    includeRelated?: boolean;
    chunkThreshold?: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
    maxTokens: 15000,
    query: '',
    includeImports: true,
    includeRelated: true,
    chunkThreshold: 50 // Minimum lines for a chunk to be considered
};

export async function compressFileContext(
    filePath: string,
    content: string,
    options: CompressionOptions = {}
): Promise<CompressedFile> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines = content.split('\n');
    const originalTokens = Math.ceil(content.length / 4);

    const chunks: CompressedChunk[] = [];

    // Parse the file to extract semantic chunks
    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    // Extract import statements
    if (opts.includeImports) {
        const imports = extractImports(sourceFile, content);
        chunks.push(...imports);
    }

    // Extract top-level definitions
    const definitions = extractDefinitions(sourceFile, content);
    chunks.push(...definitions);

    // Extract method-level details for relevant classes
    const methods = extractMethods(sourceFile, content);
    chunks.push(...methods);

    // If we have a query, prioritize chunks that match
    if (opts.query) {
        prioritizeByQuery(chunks, opts.query);
    }

    // Sort by importance
    chunks.sort((a, b) => b.importance - a.importance);

    // Fit chunks within token budget
    const selectedChunks: CompressedChunk[] = [];
    let tokenCount = 0;

    for (const chunk of chunks) {
        const chunkTokens = Math.ceil(chunk.content.length / 4);
        
        if (tokenCount + chunkTokens <= opts.maxTokens) {
            selectedChunks.push(chunk);
            tokenCount += chunkTokens;
        } else if (chunk.type === 'import' && opts.includeImports) {
            // Always try to include imports if space allows
            const remainingSpace = opts.maxTokens - tokenCount;
            if (remainingSpace > 100) {
                const truncatedContent = truncateToTokens(chunk.content, remainingSpace);
                selectedChunks.push({
                    ...chunk,
                    content: truncatedContent,
                    importance: chunk.importance * 0.5
                });
                tokenCount += Math.ceil(truncatedContent.length / 4);
            }
        } else if (selectedChunks.length > 0) {
            // Try to add more content to the last chunk
            break;
        }
    }

    // If we still have space, add header/context
    if (tokenCount < opts.maxTokens && lines.length > 0) {
        const headerLines = Math.min(20, Math.floor((opts.maxTokens - tokenCount) * 4 / 2));
        const header = lines.slice(0, headerLines).join('\n');
        
        // Check if we already have similar content
        const hasHeader = selectedChunks.some(c => c.type === 'header');
        if (header.length > 50 && !hasHeader) {
            selectedChunks.unshift({
                content: header,
                startLine: 0,
                endLine: headerLines,
                type: 'header',
                importance: 0.3
            });
            tokenCount += Math.ceil(header.length / 4);
        }
    }

    const totalTokens = selectedChunks.reduce((s, c) => s + Math.ceil(c.content.length / 4), 0);

    return {
        path: filePath,
        chunks: selectedChunks,
        totalTokens,
        originalTokens,
        compressionRatio: totalTokens / originalTokens
    };
}

function extractImports(sourceFile: ts.SourceFile, content: string): CompressedChunk[] {
    const imports: CompressedChunk[] = [];

    function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            
            imports.push({
                content: node.getText(sourceFile),
                startLine: line,
                endLine: endLine,
                type: 'import',
                importance: 0.8
            });
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return imports;
}

function extractDefinitions(sourceFile: ts.SourceFile, content: string): CompressedChunk[] {
    const definitions: CompressedChunk[] = [];

    function visit(node: ts.Node) {
        // Functions (top-level only)
        if (ts.isFunctionDeclaration(node) && node.name) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            const name = node.name.getText(sourceFile);

            // Get function signature only for importance
            const signature = node.parameters.map(p => p.getText(sourceFile)).join(', ');
            
            definitions.push({
                content: `function ${name}(${signature}) { ... }`,
                startLine: line,
                endLine: endLine,
                type: 'function',
                symbolName: name,
                importance: 0.9
            });
        }

        // Classes
        if (ts.isClassDeclaration(node) && node.name) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            const name = node.name.getText(sourceFile);

            // Extract class signature
            let classContent = `class ${name}`;
            if (node.heritageClauses && node.heritageClauses.length > 0) {
                classContent += ' ' + node.heritageClauses.map(h => h.getText(sourceFile)).join(' ');
            }
            classContent += ' { ... }';

            definitions.push({
                content: classContent,
                startLine: line,
                endLine: endLine,
                type: 'class',
                symbolName: name,
                importance: 0.95
            });
        }

        // Interfaces
        if (ts.isInterfaceDeclaration(node) && node.name) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            const name = node.name.getText(sourceFile);

            definitions.push({
                content: `interface ${name} { ... }`,
                startLine: line,
                endLine: endLine,
                type: 'interface',
                symbolName: name,
                importance: 0.85
            });
        }

        // Type aliases
        if (ts.isTypeAliasDeclaration(node) && node.name) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            const name = node.name.getText(sourceFile);

            definitions.push({
                content: `type ${name} = ...`,
                startLine: line,
                endLine: endLine,
                type: 'type',
                symbolName: name,
                importance: 0.75
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return definitions;
}

function extractMethods(sourceFile: ts.SourceFile, content: string): CompressedChunk[] {
    const methods: CompressedChunk[] = [];

    function visit(node: ts.Node) {
        if (ts.isMethodDeclaration(node) && node.name) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            const name = node.name.getText(sourceFile);
            const signature = node.parameters.map(p => p.getText(sourceFile)).join(', ');

            methods.push({
                content: `${name}(${signature}) { ... }`,
                startLine: line,
                endLine: endLine,
                type: 'method',
                symbolName: name,
                importance: 0.7
            });
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return methods;
}

function prioritizeByQuery(chunks: CompressedChunk[], query: string) {
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);

    for (const chunk of chunks) {
        let boost = 0;
        const contentLower = chunk.content.toLowerCase();

        for (const keyword of keywords) {
            if (chunk.symbolName && chunk.symbolName.toLowerCase().includes(keyword)) {
                boost += 0.5;
            }
            if (contentLower.includes(keyword)) {
                boost += 0.2;
            }
        }

        chunk.importance = Math.min(1, chunk.importance + boost);
    }
}

function truncateToTokens(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars) + '...';
}

export function formatCompressedForLLM(files: CompressedFile[]): string {
    const sections: string[] = [];

    for (const file of files) {
        sections.push(`\n// ===== ${file.path} =====`);
        sections.push(`// Compressed: ${file.totalTokens} tokens (was ${file.originalTokens})`);
        sections.push('');

        for (const chunk of file.chunks) {
            const typeTag = chunk.symbolName 
                ? `[${chunk.type}:${chunk.symbolName}]` 
                : `[${chunk.type}]`;
            sections.push(`// --- ${typeTag} (lines ${chunk.startLine}-${chunk.endLine}) ---`);
            sections.push(chunk.content);
            sections.push('');
        }
    }

    return sections.join('\n');
}

export async function compressMultipleFiles(
    files: { path: string; content: string }[],
    options: CompressionOptions = {}
): Promise<CompressedFile[]> {
    const compressed: CompressedFile[] = [];
    let totalTokens = 0;
    const maxTokens = options.maxTokens ?? DEFAULT_OPTIONS.maxTokens;

    for (const file of files) {
        if (totalTokens >= maxTokens) break;

        const remainingBudget = maxTokens - totalTokens;
        const fileCompressed = await compressFileContext(
            file.path,
            file.content,
            { ...options, maxTokens: remainingBudget }
        );

        compressed.push(fileCompressed);
        totalTokens += fileCompressed.totalTokens;
    }

    return compressed;
}

