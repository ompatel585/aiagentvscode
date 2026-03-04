import * as vscode from 'vscode';
import { ensureProjectSummary } from './7_summary';
import { semanticSearch } from './8_embeddings';
import { runWithRetry } from './10_retryLoop';
import { showDiffPreview } from './12_diffPreview';
import { applyAstSafePatches } from './11_astPatcher';
import { runTests } from './14_testRunner';
import { ChatViewProvider } from './chat/panel';

export function activate(context: vscode.ExtensionContext) {

    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            provider
        )
    );

    provider.onMessage(async (instruction: string) => {

        const apiKey = await context.secrets.get('OM_AI_KEY');
        if (!apiKey) return;

        const summary = await ensureProjectSummary();
        const semanticContext = await semanticSearch(instruction);

        const result = await runWithRetry({
            instruction,
            summary,
            semanticContext
        });

        if (!result.success) {
            vscode.window.showErrorMessage("Agent failed");
            return;
        }

        const root = vscode.workspace.workspaceFolders![0].uri.fsPath;

        const approved = await showDiffPreview(result.changes, root);
        if (!approved) return;

        await applyAstSafePatches(result.changes, root);
        await runTests(root);
    });
}

export function deactivate() {}