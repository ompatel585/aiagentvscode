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
exports.generateMultiPassPatches = generateMultiPassPatches;
exports.suggestRelatedPatches = suggestRelatedPatches;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const codeGraph_1 = require("../graph/codeGraph");
const DEFAULT_OPTIONS = {
    maxPasses: 3,
    validateImports: true,
    validateDependencies: true,
    includeRelatedFiles: true
};
async function generateMultiPassPatches(instruction, context, workspaceRoot, existingPatches = [], options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const graph = await (0, codeGraph_1.buildCodeGraph)();
    let currentPatches = [...existingPatches];
    let diagnostics = [];
    for (let pass = 1; pass <= opts.maxPasses; pass++) {
        console.log(`[MultiPassPatcher] Running pass ${pass}/${opts.maxPasses}`);
        // Validate current patches
        const passDiagnostics = await validatePatches(currentPatches, graph, workspaceRoot, {
            validateImports: opts.validateImports,
            validateDependencies: opts.validateDependencies,
            includeRelatedFiles: opts.includeRelatedFiles,
            pass
        });
        diagnostics = [...diagnostics, ...passDiagnostics];
        // Check if we have any critical errors
        const criticalErrors = passDiagnostics.filter(d => d.severity === 'error');
        if (criticalErrors.length > 0) {
            console.log(`[MultiPassPatcher] Pass ${pass} found ${criticalErrors.length} critical errors`);
            // Try to fix the errors
            currentPatches = await fixPatchErrors(currentPatches, criticalErrors, workspaceRoot, graph);
        }
        // If this is not the first pass and patches haven't changed significantly, we're done
        if (pass > 1 && currentPatches.length === existingPatches.length) {
            console.log(`[MultiPassPatcher] Pass ${pass}: No changes from previous pass`);
            break;
        }
        existingPatches = currentPatches;
    }
    // Final validation
    const finalDiagnostics = await validatePatches(currentPatches, graph, workspaceRoot, {
        validateImports: true,
        validateDependencies: true,
        includeRelatedFiles: true,
        pass: opts.maxPasses
    });
    diagnostics = [...diagnostics, ...finalDiagnostics];
    const hasErrors = diagnostics.some(d => d.severity === 'error');
    return {
        success: !hasErrors,
        changes: currentPatches,
        pass: opts.maxPasses,
        diagnostics
    };
}
async function validatePatches(patches, graph, workspaceRoot, options) {
    const diagnostics = [];
    // Track imported modules in each patch
    const patchImports = new Map();
    for (const patch of patches) {
        const fullPath = path.join(workspaceRoot, patch.path);
        // Check if file exists or will be created
        const willCreate = !fs.existsSync(fullPath);
        if (!willCreate) {
            // Check for import issues in existing files
            if (options.validateImports) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const imports = extractImportsFromContent(content);
                patchImports.set(patch.path, new Set(imports));
                // Validate each import
                for (const imp of imports) {
                    const resolved = resolveImport(imp, patch.path, workspaceRoot);
                    if (!resolved) {
                        // Check if it's a node_modules import
                        if (!imp.startsWith('.') && !imp.startsWith('/')) {
                            // External module - skip validation
                            continue;
                        }
                        diagnostics.push({
                            file: patch.path,
                            line: 0,
                            message: `Cannot resolve import: ${imp}`,
                            severity: 'warning'
                        });
                    }
                }
            }
        }
        // Check edits for syntax issues
        for (const edit of patch.edits) {
            if (edit.startLine > edit.endLine) {
                diagnostics.push({
                    file: patch.path,
                    line: edit.startLine,
                    message: `Invalid edit range: startLine > endLine`,
                    severity: 'error'
                });
            }
            if (edit.newText && edit.newText.includes('import ')) {
                // Check for new imports added by the patch
                const newImports = extractImportsFromContent(edit.newText);
                for (const imp of newImports) {
                    const existingImports = patchImports.get(patch.path) || new Set();
                    existingImports.add(imp);
                    patchImports.set(patch.path, existingImports);
                }
            }
        }
    }
    // Validate dependencies between patched files
    if (options.validateDependencies) {
        for (const patch of patches) {
            const deps = (0, codeGraph_1.getFileDependencies)(graph, patch.path);
            // Check if we're patching a file that depends on another patched file
            for (const dep of deps) {
                const depPatched = patches.some(p => p.path === dep);
                if (!depPatched) {
                    // The file depends on something we're not patching
                    // This is OK - just a warning
                    diagnostics.push({
                        file: patch.path,
                        line: 0,
                        message: `File depends on unpatched file: ${dep}`,
                        severity: 'info'
                    });
                }
            }
        }
    }
    // Check circular dependencies in patches
    const circularDeps = findCircularDependencies(patches.map(p => p.path), graph);
    for (const circ of circularDeps) {
        diagnostics.push({
            file: circ.file,
            line: 0,
            message: `Circular dependency detected: ${circ.cycle.join(' -> ')}`,
            severity: 'warning'
        });
    }
    return diagnostics;
}
function extractImportsFromContent(content) {
    const imports = [];
    const importRegex = /import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
    }
    return imports;
}
function resolveImport(importPath, fromFile, workspaceRoot) {
    const fromDir = path.dirname(fromFile);
    if (importPath.startsWith('.')) {
        const resolved = path.resolve(fromDir, importPath);
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js', '/index.tsx'];
        for (const ext of extensions) {
            const fullPath = resolved + ext;
            if (fs.existsSync(fullPath)) {
                return path.relative(workspaceRoot, fullPath);
            }
        }
    }
    return null;
}
function findCircularDependencies(files, graph) {
    const result = [];
    const visited = new Set();
    const recursionStack = new Set();
    for (const file of files) {
        if (visited.has(file))
            continue;
        const cycle = detectCycle(file, graph, visited, recursionStack, []);
        if (cycle) {
            result.push({
                file,
                cycle
            });
        }
    }
    return result;
}
function detectCycle(node, graph, visited, recursionStack, path) {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    const nodeData = graph.nodes.get(node);
    if (nodeData) {
        for (const imp of nodeData.imports) {
            const resolved = resolveImport(imp, node, '');
            if (resolved && graph.nodes.has(resolved)) {
                if (!visited.has(resolved)) {
                    const cycle = detectCycle(resolved, graph, visited, recursionStack, [...path]);
                    if (cycle)
                        return cycle;
                }
                else if (recursionStack.has(resolved)) {
                    // Found a cycle
                    const cycleStart = path.indexOf(resolved);
                    return [...path.slice(cycleStart), resolved];
                }
            }
        }
    }
    recursionStack.delete(node);
    return null;
}
async function fixPatchErrors(patches, errors, workspaceRoot, graph) {
    // Group errors by file
    const errorsByFile = new Map();
    for (const error of errors) {
        const existing = errorsByFile.get(error.file) || [];
        existing.push(error);
        errorsByFile.set(error.file, existing);
    }
    const fixedPatches = [...patches];
    for (const [file, fileErrors] of errorsByFile) {
        const patchIndex = fixedPatches.findIndex(p => p.path === file);
        if (patchIndex === -1)
            continue;
        const patch = fixedPatches[patchIndex];
        for (const error of fileErrors) {
            if (error.message.startsWith('Cannot resolve import:')) {
                // Try to add the missing import
                const importPath = error.message.replace('Cannot resolve import: ', '').trim();
                // Find where to insert the import
                const insertLine = 0;
                const importStatement = `import { /* missing */ } from '${importPath}';\n`;
                patch.edits.push({
                    startLine: insertLine,
                    endLine: insertLine,
                    newText: importStatement + '\n'
                });
            }
        }
        fixedPatches[patchIndex] = patch;
    }
    return fixedPatches;
}
function suggestRelatedPatches(patches, graph, workspaceRoot) {
    const suggested = [];
    const alreadyPatched = new Set(patches.map(p => p.path));
    for (const patch of patches) {
        // Find related files through the graph
        const related = (0, codeGraph_1.findRelatedFiles)(graph, patch.path, 1);
        for (const rel of related) {
            if (!alreadyPatched.has(rel)) {
                // Check if the related file needs to be updated based on imports
                const node = graph.nodes.get(rel);
                if (node) {
                    const importsOurFile = node.imports.some(imp => {
                        const resolved = resolveImport(imp, rel, workspaceRoot);
                        return resolved === patch.path;
                    });
                    if (importsOurFile) {
                        // This file imports something from our patched file
                        // We might need to update imports if we renamed something
                        // For now, just note it
                        console.log(`[MultiPassPatcher] Related file may need updates: ${rel}`);
                    }
                }
            }
        }
    }
    return suggested;
}
//# sourceMappingURL=multiPassPatcher.js.map