"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressFileContext = compressFileContext;
exports.formatCompressedForLLM = formatCompressedForLLM;
exports.compressMultipleFiles = compressMultipleFiles;
const ts = __importStar(require("typescript"));
const DEFAULT_OPTIONS = {
    maxTokens: 15000,
    query: '',
    includeImports: true,
    includeRelated: true,
    chunkThreshold: 50
};
async function compressFileContext(filePath, content, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines = content.split('\n');
    const originalTokens = Math.ceil(content.length / 4);
    const totalLines = lines.length;
    const chunks = [];
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (opts.includeImports) {
        const imports = extractImports(sourceFile, content);
        chunks.push(...imports);
    }
    const definitions = extractDefinitions(sourceFile, content);
    chunks.push(...definitions);
    const methods = extractMethods(sourceFile, content);
    chunks.push(...methods);
    if (opts.query) {
        prioritizeByQuery(chunks, opts.query);
    }
    chunks.sort((a, b) => b.importance - a.importance);
    const selectedChunks = [];
    let tokenCount = 0;
    for (const chunk of chunks) {
        const chunkTokens = Math.ceil(chunk.content.length / 4);
        if (tokenCount + chunkTokens <= opts.maxTokens) {
            selectedChunks.push(chunk);
            tokenCount += chunkTokens;
        }
        else if (chunk.type === 'import' && opts.includeImports) {
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
        }
        else if (selectedChunks.length > 0) {
            break;
        }
    }
    if (tokenCount < opts.maxTokens && lines.length > 0) {
        const headerLines = Math.min(20, Math.floor((opts.maxTokens - tokenCount) * 4 / 2));
        const header = lines.slice(0, headerLines).join('\n');
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
        compressionRatio: totalTokens / originalTokens,
        totalLines,
    };
}
function extractImports(sourceFile, content) {
    const imports = [];
    function visit(node) {
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
function extractDefinitions(sourceFile, content) {
    const definitions = [];
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            const name = node.name.getText(sourceFile);
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
        if (ts.isClassDeclaration(node) && node.name) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
            const name = node.name.getText(sourceFile);
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
        // NEW: also capture variable declarations (const x = [...]) at top level
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name)) {
                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
                    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
                    const name = decl.name.getText(sourceFile);
                    const keyword = node.declarationList.flags & ts.NodeFlags.Const ? 'const'
                        : node.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'var';
                    definitions.push({
                        content: `${keyword} ${name} = ... (lines ${line}-${endLine})`,
                        startLine: line,
                        endLine: endLine,
                        type: 'type', // reuse 'type' slot — no new enum value needed
                        symbolName: name,
                        importance: 0.85
                    });
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return definitions;
}
function extractMethods(sourceFile, content) {
    const methods = [];
    function visit(node) {
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
function prioritizeByQuery(chunks, query) {
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
function truncateToTokens(content, maxTokens) {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars)
        return content;
    return content.slice(0, maxChars) + '...';
}
/**
 * Format compressed files for the LLM prompt.
 * KEY FIX: we now annotate EVERY line with its 0-indexed line number so the AI
 * can produce accurate startLine/endLine values without guessing.
 * We also output the total line count so the AI can do whole-file replacement.
 */
function formatCompressedForLLM(files) {
    const sections = [];
    for (const file of files) {
        sections.push(`\n// ===== FILE: ${file.path} (TOTAL LINES: ${file.totalLines}) =====`);
        sections.push(`// Compressed: ${file.totalTokens} tokens (was ${file.originalTokens})`);
        sections.push(`// To replace entire file: startLine=0, endLine=${file.totalLines}`);
        sections.push('');
        // Sort chunks by startLine so the output reads top-to-bottom
        const sorted = [...file.chunks].sort((a, b) => a.startLine - b.startLine);
        for (const chunk of sorted) {
            const typeTag = chunk.symbolName
                ? `[${chunk.type}:${chunk.symbolName}]`
                : `[${chunk.type}]`;
            sections.push(`// --- ${typeTag} lines ${chunk.startLine}-${chunk.endLine} ---`);
            // Annotate each line with its actual 0-indexed line number
            const chunkLines = chunk.content.split('\n');
            for (let i = 0; i < chunkLines.length; i++) {
                const lineNo = chunk.startLine + i;
                sections.push(`/*L${lineNo}*/ ${chunkLines[i]}`);
            }
            sections.push('');
        }
    }
    return sections.join('\n');
}
async function compressMultipleFiles(files, options = {}) {
    const compressed = [];
    let totalTokens = 0;
    const maxTokens = options.maxTokens ?? DEFAULT_OPTIONS.maxTokens;
    for (const file of files) {
        if (totalTokens >= maxTokens)
            break;
        const remainingBudget = maxTokens - totalTokens;
        const fileCompressed = await compressFileContext(file.path, file.content, { ...options, maxTokens: remainingBudget });
        compressed.push(fileCompressed);
        totalTokens += fileCompressed.totalTokens;
    }
    return compressed;
}
//# sourceMappingURL=contextCompressor.js.map