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
exports.applyAstSafePatches = applyAstSafePatches;
const ts = __importStar(require("typescript"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function applyAstSafePatches(patches, root) {
    for (const patch of patches) {
        const fullPath = path.join(root, patch.path);
        // CREATE FILE SUPPORT
        if (!fs.existsSync(fullPath)) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, "");
        }
        const original = fs.readFileSync(fullPath, 'utf-8');
        let updated = original;
        // KEY FIX: sort edits DESCENDING by startLine so applying bottom-up
        // edits don't shift line numbers for edits above them.
        const sortedEdits = [...patch.edits].sort((a, b) => b.startLine - a.startLine);
        for (const edit of sortedEdits) {
            const lines = updated.split('\n');
            // Clamp to valid range
            const start = Math.max(0, edit.startLine);
            const end = Math.min(lines.length, edit.endLine);
            const deleteCount = end - start;
            if (deleteCount < 0) {
                console.warn(`[AstPatcher] Skipping invalid edit: startLine=${edit.startLine} > endLine=${edit.endLine} in ${patch.path}`);
                continue;
            }
            // Split newText into lines, preserving trailing newline behaviour
            const newLines = edit.newText === '' ? [] : edit.newText.split('\n');
            // Remove trailing empty string caused by trailing newline in newText
            // (splice doesn't want an extra blank line at end)
            if (newLines.length > 0 && newLines[newLines.length - 1] === '' && edit.newText.endsWith('\n')) {
                newLines.pop();
            }
            lines.splice(start, deleteCount, ...newLines);
            updated = lines.join('\n');
        }
        // Validate the result is parseable TypeScript/JavaScript before writing
        const ext = path.extname(patch.path).toLowerCase();
        const isTS = ext === '.ts' || ext === '.tsx';
        if (isTS) {
            const check = ts.createSourceFile(patch.path, updated, ts.ScriptTarget.Latest, true);
            // ts.createSourceFile doesn't throw on syntax errors — it just produces
            // a tree with error nodes. Use diagnostics to gate the write.
            const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram({
                rootNames: [patch.path],
                options: {}
            }));
            // Only block on *syntax* errors, not type errors (type errors need full project)
            const program = ts.createProgram({
                rootNames: [patch.path],
                options: {},
                host: {
                    ...ts.createCompilerHost({}),
                    readFile: (fileName) => fileName === patch.path ? updated : fs.readFileSync(fileName, 'utf-8'),
                    fileExists: (fileName) => fileName === patch.path ? true : fs.existsSync(fileName)
                }
            });
            const syntaxDiags = program.getSyntacticDiagnostics();
            if (syntaxDiags.length > 0) {
                console.error(`[AstPatcher] Syntax errors in patched ${patch.path}, NOT writing:`);
                syntaxDiags.forEach((d) => {
                    console.error(" -", ts.flattenDiagnosticMessageText(d.messageText, "\n"));
                });
                continue;
            }
        }
        fs.writeFileSync(fullPath, updated);
        console.log(`[AstPatcher] Patched ${patch.path} (${patch.edits.length} edit(s))`);
    }
}
//# sourceMappingURL=astPatcher.js.map