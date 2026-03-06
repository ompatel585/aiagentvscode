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
exports.handleSlashCommand = handleSlashCommand;
const vscode = __importStar(require("vscode"));
const client_1 = require("../core/client");
const terminalTool_1 = require("../features/terminalTool");
/**
 * Parse a user message and dispatch slash commands.
 * Returns SlashResult so the caller decides how to render it.
 */
async function handleSlashCommand(raw) {
    const trimmed = raw.trim();
    // ── /explain ──────────────────────────────────────────────
    if (trimmed.startsWith('/explain')) {
        const selection = getEditorSelection();
        if (!selection) {
            return { kind: 'explain', text: '⚠️ No code selected. Select code in the editor first.' };
        }
        const res = await (0, client_1.callBrain)({
            instruction: `Explain the following code clearly and concisely:\n\n${selection}`,
            summary: '',
            semanticContext: []
        });
        const text = res.success
            ? res.explanation ?? JSON.stringify(res)
            : res.raw ?? 'Could not explain.';
        return { kind: 'explain', text };
    }
    // ── /fix ──────────────────────────────────────────────────
    if (trimmed.startsWith('/fix')) {
        const selection = getEditorSelection();
        const extra = trimmed.replace('/fix', '').trim();
        const instruction = selection
            ? `Fix the following code${extra ? ` — ${extra}` : ''}:\n\n${selection}`
            : `Fix: ${extra}`;
        return { kind: 'fix', instruction };
        // Delegate actual patching back to the extension host
    }
    // ── /doc ──────────────────────────────────────────────────
    if (trimmed.startsWith('/doc')) {
        const selection = getEditorSelection();
        if (!selection) {
            return { kind: 'doc', text: '⚠️ No code selected. Select code in the editor first.' };
        }
        const res = await (0, client_1.callBrain)({
            instruction: `Write JSDoc / TSDoc comments for the following code. Return only the commented code, no explanation:\n\n${selection}`,
            summary: '',
            semanticContext: []
        });
        const text = res.raw ?? JSON.stringify(res);
        return { kind: 'doc', text };
    }
    // ── /test ──────────────────────────────────────────────────
    if (trimmed.startsWith('/test')) {
        const selection = getEditorSelection();
        const extra = trimmed.replace('/test', '').trim();
        const code = selection ?? extra;
        const res = await (0, client_1.callBrain)({
            instruction: `Write Jest unit tests for the following code. Return only the test file content:\n\n${code}`,
            summary: '',
            semanticContext: []
        });
        const text = res.raw ?? JSON.stringify(res);
        return { kind: 'test', text };
    }
    // ── /commit ────────────────────────────────────────────────
    if (trimmed.startsWith('/commit')) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            return { kind: 'commit', text: '⚠️ No workspace open.' };
        }
        const { stdout } = await (0, terminalTool_1.runCommand)('git diff --cached --stat', root);
        const diff = stdout?.slice(0, 3000) ?? '';
        if (!diff.trim()) {
            return { kind: 'commit', text: '⚠️ No staged changes found. Run `git add` first.' };
        }
        const res = await (0, client_1.callBrain)({
            instruction: `Generate a concise conventional commit message (type(scope): description) for this git diff:\n\n${diff}`,
            summary: '',
            semanticContext: []
        });
        const text = res.raw ?? JSON.stringify(res);
        return { kind: 'commit', text: `Suggested commit message:\n\n${text.trim()}` };
    }
    // ── not a slash command ─────────────────────────────────────
    return { kind: 'passthrough', instruction: raw };
}
/**
 * Return the currently selected text in the active editor, or null.
 */
function getEditorSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return null;
    const sel = editor.selection;
    if (sel.isEmpty)
        return null;
    return editor.document.getText(sel);
}
//# sourceMappingURL=slashCommands.js.map