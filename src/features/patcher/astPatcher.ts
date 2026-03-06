import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { FilePatch } from '../../core/types';

export async function applyAstSafePatches(
    patches: FilePatch[],
    root: string
) {

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

        for (const edit of patch.edits) {

            const lines = updated.split('\n');

            lines.splice(
                edit.startLine,
                edit.endLine - edit.startLine,
                edit.newText
            );

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

        } else {

            console.log("Patch rejected (TS errors):", patch.path);

        }
    }
}

