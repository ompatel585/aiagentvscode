import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { FilePatch } from './5_types';

export async function applyAstSafePatches(
    patches: FilePatch[],
    root: string
) {

    for (const patch of patches) {

        const fullPath = path.join(root, patch.path);
        if (!fs.existsSync(fullPath)) continue;

        const original = fs.readFileSync(fullPath, 'utf-8');
        let updated = original;

        for (const edit of patch.edits) {
            const lines = updated.split('\n');
            lines.splice(edit.startLine, edit.endLine - edit.startLine, edit.newText);
            updated = lines.join('\n');
        }

        const check = ts.createSourceFile(
            patch.path,
            updated,
            ts.ScriptTarget.Latest,
            true
        );

        const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram({
        rootNames: [patch.path],
        options: {}
    })
);

if (diagnostics.length === 0) {
            fs.writeFileSync(fullPath, updated);
        }
    }
}