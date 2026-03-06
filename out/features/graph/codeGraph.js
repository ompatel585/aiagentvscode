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
exports.buildCodeGraph = buildCodeGraph;
exports.findRelatedFiles = findRelatedFiles;
exports.findSymbol = findSymbol;
exports.getFileDependencies = getFileDependencies;
exports.clearGraphCache = clearGraphCache;
exports.getGraphStats = getGraphStats;
const vscode = __importStar(require("vscode"));
const ts = __importStar(require("typescript"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let cachedGraph = null;
async function buildCodeGraph(forceRebuild = false) {
    if (!forceRebuild && cachedGraph) {
        return cachedGraph;
    }
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        throw new Error('No workspace folder open');
    }
    const root = workspace.uri.fsPath;
    const graph = {
        nodes: new Map(),
        symbols: new Map(),
        buildTime: Date.now()
    };
    const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,mjs}', '**/{node_modules,dist,.git,out,vendor}/**');
    console.log(`[CodeGraph] Building graph for ${files.length} files...`);
    for (const file of files) {
        try {
            const filePath = file.fsPath;
            const relativePath = path.relative(root, filePath);
            const content = fs.readFileSync(filePath, 'utf-8');
            const stats = fs.statSync(filePath);
            const node = parseFile(content, relativePath);
            node.lastModified = stats.mtimeMs;
            graph.nodes.set(relativePath, node);
            for (const symbol of node.exports) {
                const existing = graph.symbols.get(symbol) || [];
                existing.push(...node.symbols.filter(s => s.name === symbol));
                graph.symbols.set(symbol, existing);
            }
        }
        catch (err) {
            console.warn(`[CodeGraph] Failed to parse ${file.fsPath}:`, err);
        }
    }
    // Build reverse import relationships
    for (const [filePath, node] of graph.nodes) {
        for (const importPath of node.imports) {
            const resolved = resolveImport(importPath, path.dirname(filePath), root);
            if (resolved && graph.nodes.has(resolved)) {
                const targetNode = graph.nodes.get(resolved);
                if (!targetNode.importedBy.includes(filePath)) {
                    targetNode.importedBy.push(filePath);
                }
            }
        }
    }
    cachedGraph = graph;
    console.log(`[CodeGraph] Built graph with ${graph.nodes.size} nodes`);
    return graph;
}
function parseFile(content, relativePath) {
    const sourceFile = ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const node = {
        path: relativePath,
        relativePath,
        imports: [],
        exports: [],
        symbols: [],
        importedBy: [],
        lastModified: Date.now()
    };
    function visit(n) {
        if (ts.isImportDeclaration(n)) {
            const moduleSpecifier = n.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
                node.imports.push(moduleSpecifier.text);
            }
        }
        if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) {
            if (n.name) {
                const fnName = n.name.getText(sourceFile);
                const startLine = sourceFile.getLineAndCharacterOfPosition(n.getStart()).line;
                const endLine = sourceFile.getLineAndCharacterOfPosition(n.getEnd()).line;
                node.symbols.push({
                    name: fnName,
                    kind: 'function',
                    file: relativePath,
                    line: startLine,
                    endLine: endLine,
                    scope: getScope(n, sourceFile)
                });
                if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                    node.exports.push(fnName);
                }
            }
        }
        if (ts.isClassDeclaration(n)) {
            if (n.name) {
                const className = n.name.getText(sourceFile);
                const startLine = sourceFile.getLineAndCharacterOfPosition(n.getStart()).line;
                const endLine = sourceFile.getLineAndCharacterOfPosition(n.getEnd()).line;
                node.symbols.push({
                    name: className,
                    kind: 'class',
                    file: relativePath,
                    line: startLine,
                    endLine: endLine,
                    scope: getScope(n, sourceFile)
                });
                if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                    node.exports.push(className);
                }
            }
        }
        if (ts.isInterfaceDeclaration(n)) {
            const interfaceName = n.name.getText(sourceFile);
            const startLine = sourceFile.getLineAndCharacterOfPosition(n.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(n.getEnd()).line;
            node.symbols.push({
                name: interfaceName,
                kind: 'interface',
                file: relativePath,
                line: startLine,
                endLine: endLine,
                scope: getScope(n, sourceFile)
            });
            if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                node.exports.push(interfaceName);
            }
        }
        if (ts.isTypeAliasDeclaration(n)) {
            const typeName = n.name.getText(sourceFile);
            const startLine = sourceFile.getLineAndCharacterOfPosition(n.getStart()).line;
            const endLine = sourceFile.getLineAndCharacterOfPosition(n.getEnd()).line;
            node.symbols.push({
                name: typeName,
                kind: 'type',
                file: relativePath,
                line: startLine,
                endLine: endLine,
                scope: getScope(n, sourceFile)
            });
            if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                node.exports.push(typeName);
            }
        }
        if (ts.isVariableStatement(n)) {
            const isExported = ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
            if (isExported) {
                for (const decl of n.declarationList.declarations) {
                    if (ts.isVariableDeclaration(decl) && decl.name) {
                        node.exports.push(decl.name.getText(sourceFile));
                    }
                }
            }
        }
        ts.forEachChild(n, visit);
    }
    visit(sourceFile);
    return node;
}
function getScope(n, sourceFile) {
    let current = n.parent;
    while (current) {
        if (ts.isClassDeclaration(current) && current.name) {
            return current.name.getText(sourceFile);
        }
        if (ts.isFunctionDeclaration(current) && current.name) {
            return current.name.getText(sourceFile);
        }
        current = current.parent;
    }
    return 'global';
}
function resolveImport(importPath, fromDir, root) {
    if (importPath.startsWith('.')) {
        let resolved = path.resolve(fromDir, importPath);
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js', '/index.tsx'];
        for (const ext of extensions) {
            if (fs.existsSync(resolved + ext)) {
                return path.relative(root, resolved + ext);
            }
        }
    }
    return null;
}
function findRelatedFiles(graph, filePath, maxDepth = 2) {
    const related = new Set();
    const queue = [{ path: filePath, depth: 0 }];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current.depth > maxDepth)
            continue;
        const node = graph.nodes.get(current.path);
        if (!node)
            continue;
        for (const imp of node.imports) {
            const resolved = resolveImport(imp, path.dirname(current.path), '');
            if (resolved && graph.nodes.has(resolved)) {
                if (!related.has(resolved)) {
                    related.add(resolved);
                    queue.push({ path: resolved, depth: current.depth + 1 });
                }
            }
        }
        for (const importedBy of node.importedBy) {
            if (!related.has(importedBy)) {
                related.add(importedBy);
                queue.push({ path: importedBy, depth: current.depth + 1 });
            }
        }
    }
    return Array.from(related);
}
function findSymbol(graph, symbolName) {
    return graph.symbols.get(symbolName) || [];
}
function getFileDependencies(graph, filePath) {
    const node = graph.nodes.get(filePath);
    if (!node)
        return [];
    const deps = [];
    for (const imp of node.imports) {
        const resolved = resolveImport(imp, path.dirname(filePath), '');
        if (resolved && graph.nodes.has(resolved)) {
            deps.push(resolved);
        }
    }
    return deps;
}
function clearGraphCache() {
    cachedGraph = null;
}
function getGraphStats(graph) {
    return {
        files: graph.nodes.size,
        symbols: graph.symbols.size
    };
}
//# sourceMappingURL=codeGraph.js.map