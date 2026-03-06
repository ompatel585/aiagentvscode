import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

export interface SymbolDefinition {
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'export';
    file: string;
    line: number;
    endLine: number;
    scope: string;
}

export interface FileNode {
    path: string;
    relativePath: string;
    imports: string[];
    exports: string[];
    symbols: SymbolDefinition[];
    importedBy: string[];
    lastModified: number;
}

export interface CodeGraph {
    nodes: Map<string, FileNode>;
    symbols: Map<string, SymbolDefinition[]>;
    buildTime: number;
}

let cachedGraph: CodeGraph | null = null;

export async function buildCodeGraph(forceRebuild = false): Promise<CodeGraph> {
    if (!forceRebuild && cachedGraph) {
        return cachedGraph;
    }

    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        throw new Error('No workspace folder open');
    }

    const root = workspace.uri.fsPath;
    const graph: CodeGraph = {
        nodes: new Map(),
        symbols: new Map(),
        buildTime: Date.now()
    };

    const files = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx,mjs}',
        '**/{node_modules,dist,.git,out,vendor}/**'
    );

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
        } catch (err) {
            console.warn(`[CodeGraph] Failed to parse ${file.fsPath}:`, err);
        }
    }

    // Build reverse import relationships
    for (const [filePath, node] of graph.nodes) {
        for (const importPath of node.imports) {
            const resolved = resolveImport(importPath, path.dirname(filePath), root);
            if (resolved && graph.nodes.has(resolved)) {
                const targetNode = graph.nodes.get(resolved)!;
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

function parseFile(content: string, relativePath: string): FileNode {
    const sourceFile = ts.createSourceFile(
        relativePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    const node: FileNode = {
        path: relativePath,
        relativePath,
        imports: [] as string[],
        exports: [] as string[],
        symbols: [] as SymbolDefinition[],
        importedBy: [] as string[],
        lastModified: Date.now()
    };

    function visit(n: ts.Node) {
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

function getScope(n: ts.Node, sourceFile: ts.SourceFile): string {
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

function resolveImport(importPath: string, fromDir: string, root: string): string | null {
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

export function findRelatedFiles(
    graph: CodeGraph,
    filePath: string,
    maxDepth = 2
): string[] {
    const related = new Set<string>();
    const queue: { path: string; depth: number }[] = [{ path: filePath, depth: 0 }];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.depth > maxDepth) continue;

        const node = graph.nodes.get(current.path);
        if (!node) continue;

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

export function findSymbol(
    graph: CodeGraph,
    symbolName: string
): SymbolDefinition[] {
    return graph.symbols.get(symbolName) || [];
}

export function getFileDependencies(graph: CodeGraph, filePath: string): string[] {
    const node = graph.nodes.get(filePath);
    if (!node) return [];

    const deps: string[] = [];
    
    for (const imp of node.imports) {
        const resolved = resolveImport(imp, path.dirname(filePath), '');
        if (resolved && graph.nodes.has(resolved)) {
            deps.push(resolved);
        }
    }

    return deps;
}

export function clearGraphCache() {
    cachedGraph = null;
}

export function getGraphStats(graph: CodeGraph): { files: number; symbols: number } {
    return {
        files: graph.nodes.size,
        symbols: graph.symbols.size
    };
}

