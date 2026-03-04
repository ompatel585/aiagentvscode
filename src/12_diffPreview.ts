import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FilePatch } from './5_types';

export async function showDiffPreview(
    patches: FilePatch[],
    root: string
) {

    for (const patch of patches) {

        const full = path.join(root, patch.path);
        if (!fs.existsSync(full)) continue;

        const original = fs.readFileSync(full, 'utf-8');
        let updated = original;

        for (const edit of patch.edits) {
            const lines = updated.split('\n');
            lines.splice(edit.startLine, edit.endLine - edit.startLine, edit.newText);
            updated = lines.join('\n');
        }

        const left = vscode.Uri.parse(`untitled:${patch.path}-old`);
        const right = vscode.Uri.parse(`untitled:${patch.path}-new`);

        await vscode.workspace.openTextDocument(left).then(d =>
            vscode.window.showTextDocument(d).then(e => e.edit(b => b.insert(new vscode.Position(0, 0), original)))
        );

        await vscode.workspace.openTextDocument(right).then(d =>
            vscode.window.showTextDocument(d).then(e => e.edit(b => b.insert(new vscode.Position(0, 0), updated)))
        );

        await vscode.commands.executeCommand('vscode.diff', left, right, `Preview: ${patch.path}`);
    }

    const choice = await vscode.window.showQuickPick(
        ['Apply Changes', 'Cancel'],
        { placeHolder: 'Approve AI changes?' }
    );

    return choice === 'Apply Changes';
}