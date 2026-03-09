import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { FilePatch, FileEdit } from '../../core/types'; // adjust path as needed

export async function applyAstSafePatches(patches: FilePatch[], root: string) {

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
        const sortedEdits: FileEdit[] = [...patch.edits].sort(
            (a, b) => b.startLine - a.startLine
        );

        for (const edit of sortedEdits) {
            const lines = updated.split('\n');

            // Clamp to valid range
            const start = Math.max(0, edit.startLine);
            const end   = Math.min(lines.length, edit.endLine);
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
            const check = ts.createSourceFile(
                patch.path,
                updated,
                ts.ScriptTarget.Latest,
                true
            );

            // ts.createSourceFile doesn't throw on syntax errors — it just produces
            // a tree with error nodes. Use diagnostics to gate the write.
            const diagnostics = ts.getPreEmitDiagnostics(
                ts.createProgram({
                    rootNames: [patch.path],
                    options: {}
                })
            );

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