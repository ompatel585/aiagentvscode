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

        try {

            provider.postLog(`Prompt received`);

            if (!instruction || instruction.trim().length === 0) {
                provider.postLog("⚠️ Empty prompt.");
                return;
            }

            const workspace = vscode.workspace.workspaceFolders?.[0];
            if (!workspace) {
                provider.postLog("❌ No workspace folder open.");
                return;
            }

            const root = workspace.uri.fsPath;

            provider.postLog("Building project summary...");
            const summary = await ensureProjectSummary();

            provider.postLog("Running semantic search...");
            const semanticContext = await semanticSearch(instruction);

            const fileCount = semanticContext.length;

            provider.postLog(`Relevant files: ${fileCount}`);

            // ===== TOKEN ESTIMATION =====

            const contextChars = semanticContext.reduce(
                (sum, f) => sum + (f.content?.length || 0),
                0
            );

            const estimatedPromptTokens = Math.round(contextChars / 4);

            provider.postLog(`Context characters: ${contextChars}`);
            provider.postLog(`Estimated prompt tokens: ${estimatedPromptTokens}`);

            // ===== COST ESTIMATION =====

            const INPUT_COST_PER_MILLION = 0.05;
            const OUTPUT_COST_PER_MILLION = 0.4;

            const estimatedInputCost =
                (estimatedPromptTokens / 1_000_000) * INPUT_COST_PER_MILLION;

            provider.postLog(
                `Estimated input cost: $${estimatedInputCost.toFixed(6)} (0.05$/million)`
            );

            provider.postLog("Calling AI model...");

            const result = await runWithRetry({
                instruction,
                summary,
                semanticContext
            });

            if (!result) {
                provider.postLog("❌ AI returned empty response.");
                return;
            }

            // ===== TOKEN + COST FROM RESPONSE =====

            if ((result as any).usage) {

                const usage = (result as any).usage;

                const promptTokens = usage.promptTokenCount || 0;
                const completionTokens = usage.candidatesTokenCount || 0;
                const totalTokens = usage.totalTokenCount || 0;

                const inputCost =
                    (promptTokens / 1_000_000) * INPUT_COST_PER_MILLION;

                const outputCost =
                    (completionTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

                const totalCost = inputCost + outputCost;

                provider.postLog(
                    `Prompt tokens: ${promptTokens} (cost $${inputCost.toFixed(6)})`
                );

                provider.postLog(
                    `Completion tokens: ${completionTokens} (cost $${outputCost.toFixed(6)})`
                );

                provider.postLog(
                    `Total tokens: ${totalTokens}`
                );

                provider.postLog(
                    `Total cost: $${totalCost.toFixed(6)}`
                );
            }

            if (!result.success) {

    provider.postLog("❌ AI failed to generate valid patches.");

    if ((result as any).raw) {
        provider.postLog("Model response:");
        provider.postLog((result as any).raw.slice(0, 1000));
    }

    return;
}

            if (!Array.isArray(result.changes) || result.changes.length === 0) {
                provider.postLog("⚠️ AI returned no code changes.");
                return;
            }

            provider.postLog(`Generated patches: ${result.changes.length}`);

            provider.postLog("Opening diff preview...");

            const approved = await showDiffPreview(result.changes, root);

            if (!approved) {
                provider.postLog("⚠️ User cancelled patch.");
                return;
            }

            provider.postLog("Applying patches safely...");

            await applyAstSafePatches(result.changes, root);

            provider.postLog("Running project tests...");

            await runTests(root);

            provider.postLog("✅ Completed successfully.");

        } catch (err: any) {

            console.error("Extension runtime error:", err);

            provider.postLog(
                `❌ Runtime error: ${err?.message || JSON.stringify(err)}`
            );
        }

    });
}

export function deactivate() {}