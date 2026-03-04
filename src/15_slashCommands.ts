import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { callBrain } from './3_client';
import { runCommand } from './13_terminalTool';

export type SlashResult =
    | { kind: 'explain'; text: string }
    | { kind: 'fix'; text: string }
    | { kind: 'doc'; text: string }
    | { kind: 'test'; text: string }
    | { kind: 'commit'; text: string }
    | { kind: 'passthrough'; instruction: string };

/**
 * Parse a user message and dispatch slash commands.
 * Returns SlashResult so the caller decides how to render it.
 */
export async function handleSlashCommand(raw: string): Promise<SlashResult> {
    const trimmed = raw.trim();

    // ── /explain ──────────────────────────────────────────────
    if (trimmed.startsWith('/explain')) {
        const selection = getEditorSelection();
        if (!selection) {
            return { kind: 'explain', text: '⚠️ No code selected. Select code in the editor first.' };
        }
        const res = await callBrain({
            instruction: `Explain the following code clearly and concisely:\n\n${selection}`,
            summary: '',
            semanticContext: []
        });
        const text = res.success
            ? (res as any).explanation ?? JSON.stringify(res)
            : (res as any).raw ?? 'Could not explain.';
        return { kind: 'explain', text };
    }

    // ── /fix ──────────────────────────────────────────────────
    if (trimmed.startsWith('/fix')) {
        const selection = getEditorSelection();
        const extra = trimmed.replace('/fix', '').trim();
        const instruction = selection
            ? `Fix the following code${extra ? ` — ${extra}` : ''}:\n\n${selection}`
            : `Fix: ${extra}`;
        return { kind: 'fix', instruction } as unknown as SlashResult;
        // Delegate actual patching back to the extension host
    }

    // ── /doc ──────────────────────────────────────────────────
    if (trimmed.startsWith('/doc')) {
        const selection = getEditorSelection();
        if (!selection) {
            return { kind: 'doc', text: '⚠️ No code selected. Select code in the editor first.' };
        }
        const res = await callBrain({
            instruction: `Write JSDoc / TSDoc comments for the following code. Return only the commented code, no explanation:\n\n${selection}`,
            summary: '',
            semanticContext: []
        });
        const text = (res as any).raw ?? JSON.stringify(res);
        return { kind: 'doc', text };
    }

    // ── /test ──────────────────────────────────────────────────
    if (trimmed.startsWith('/test')) {
        const selection = getEditorSelection();
        const extra = trimmed.replace('/test', '').trim();
        const code = selection ?? extra;
        const res = await callBrain({
            instruction: `Write Jest unit tests for the following code. Return only the test file content:\n\n${code}`,
            summary: '',
            semanticContext: []
        });
        const text = (res as any).raw ?? JSON.stringify(res);
        return { kind: 'test', text };
    }

    // ── /commit ────────────────────────────────────────────────
    if (trimmed.startsWith('/commit')) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            return { kind: 'commit', text: '⚠️ No workspace open.' };
        }
        const { stdout } = await runCommand('git diff --cached --stat', root) as any;
        const diff = stdout?.slice(0, 3000) ?? '';
        if (!diff.trim()) {
            return { kind: 'commit', text: '⚠️ No staged changes found. Run `git add` first.' };
        }
        const res = await callBrain({
            instruction: `Generate a concise conventional commit message (type(scope): description) for this git diff:\n\n${diff}`,
            summary: '',
            semanticContext: []
        });
        const text = (res as any).raw ?? JSON.stringify(res);
        return { kind: 'commit', text: `Suggested commit message:\n\n${text.trim()}` };
    }

    // ── not a slash command ─────────────────────────────────────
    return { kind: 'passthrough', instruction: raw };
}

/**
 * Return the currently selected text in the active editor, or null.
 */
function getEditorSelection(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    const sel = editor.selection;
    if (sel.isEmpty) return null;
    return editor.document.getText(sel);
}