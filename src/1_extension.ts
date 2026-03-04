import * as vscode from 'vscode';
import { ensureProjectSummary } from './7_summary';
import { semanticSearch } from './8_embeddings';
import { runWithRetry } from './10_retryLoop';
import { showDiffPreview } from './12_diffPreview';
import { applyAstSafePatches } from './11_astPatcher';
import { runTests } from './14_testRunner';
import { ChatViewProvider } from './chat/panel';
import { handleSlashCommand } from './15_slashCommands';
import { loadProjectRules, initRulesFile } from './16_rulesLoader';
import { createStatusBar, setState } from './17_statusBar';

const INPUT_COST_PER_MILLION  = 0.05;
const OUTPUT_COST_PER_MILLION = 0.4;

export function activate(context: vscode.ExtensionContext) {

    // ── Status bar ───────────────────────────────────────────────
    createStatusBar(context);

    // ── Chat panel ───────────────────────────────────────────────
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            provider
        )
    );

    // ── Command: open rules file ─────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('om-ai.openRules', () => initRulesFile())
    );

    // ── Command: focus chat (used by status bar) ─────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('om-ai.openChat', () =>
            vscode.commands.executeCommand('workbench.view.extension.om-ai-sidebar')
        )
    );

    // ── Message handler ──────────────────────────────────────────
    provider.onMessage(async (raw: string) => {

        try {
            setState('thinking');
            provider.postLog('Prompt received');

            if (!raw || raw.trim().length === 0) {
                provider.postLog('⚠️ Empty prompt.');
                setState('idle');
                return;
            }

            // ── Slash command dispatch ───────────────────────────
            const slashResult = await handleSlashCommand(raw);

            if (slashResult.kind !== 'passthrough') {
                // Slash commands that only need a text reply
                const simpleKinds = ['explain', 'doc', 'test', 'commit'] as const;
                if (simpleKinds.includes(slashResult.kind as any)) {
                    provider.postMessage((slashResult as any).text);
                    setState('done');
                    return;
                }

                // /fix — rewrite instruction and fall through to patcher
                if (slashResult.kind === 'fix') {
                    const fixResult = slashResult as any;
                    provider.postLog('/fix — delegating to patcher…');
                    // replace raw with the synthesised instruction
                    return await runPatchFlow(
                        fixResult.instruction,
                        provider
                    );
                }
            }

            // ── Normal (non-slash) prompt ────────────────────────
            await runPatchFlow(raw, provider);

        } catch (err: any) {
            console.error('Extension runtime error:', err);
            provider.postLog(`❌ Runtime error: ${err?.message ?? JSON.stringify(err)}`);
            setState('error', err?.message);
        }
    });
}

// ── Core patch pipeline ──────────────────────────────────────────
async function runPatchFlow(instruction: string, provider: ChatViewProvider) {

    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        provider.postLog('❌ No workspace folder open.');
        setState('idle');
        return;
    }

    const root = workspace.uri.fsPath;

    // Load project rules (like .cursorrules)
    const projectRules = loadProjectRules();
    if (projectRules) {
        provider.postLog('📋 Project rules loaded.');
    }

    provider.postLog('Building project summary…');
    const summary = await ensureProjectSummary();

    provider.postLog('Running semantic search…');
    const semanticContext = await semanticSearch(instruction);
    provider.postLog(`Relevant files: ${semanticContext.length}`);

    // Token estimation
    const contextChars = semanticContext.reduce((s, f) => s + (f.content?.length ?? 0), 0);
    const estimatedTokens = Math.round(contextChars / 4);
    provider.postLog(`Estimated prompt tokens: ~${estimatedTokens}`);
    provider.postLog(`Estimated input cost: $${((estimatedTokens / 1_000_000) * INPUT_COST_PER_MILLION).toFixed(6)}`);

    provider.postLog('Calling AI model…');
    setState('thinking');

    const result = await runWithRetry({
        instruction: instruction + projectRules,   // ← rules injected here
        summary,
        semanticContext
    });

    if (!result) {
        provider.postLog('❌ AI returned empty response.');
        setState('error');
        return;
    }

    // Actual token cost from response
    if ((result as any).usage) {
        const u = (result as any).usage;
        const pt  = u.promptTokenCount     ?? 0;
        const ct  = u.candidatesTokenCount ?? 0;
        const ic  = (pt / 1_000_000) * INPUT_COST_PER_MILLION;
        const oc  = (ct / 1_000_000) * OUTPUT_COST_PER_MILLION;
        provider.postLog(`Tokens — prompt: ${pt}, completion: ${ct} | Cost: $${(ic + oc).toFixed(6)}`);
    }

    if (!result.success) {
        provider.postLog('❌ AI failed to generate valid patches.');
        if ((result as any).raw) {
            provider.postLog('Model said: ' + (result as any).raw.slice(0, 800));
        }
        setState('error');
        return;
    }

    if (!Array.isArray(result.changes) || result.changes.length === 0) {
        provider.postLog('⚠️ AI returned no code changes.');
        setState('idle');
        return;
    }

    provider.postLog(`Generated ${result.changes.length} patch(es). Opening diff preview…`);

    const approved = await showDiffPreview(result.changes, root);
    if (!approved) {
        provider.postLog('⚠️ User cancelled patch.');
        setState('idle');
        return;
    }

    setState('patching');
    provider.postLog('Applying patches…');
    await applyAstSafePatches(result.changes, root);

    provider.postLog('Running tests…');
    await runTests(root);

    provider.postLog('✅ Completed successfully.');
    setState('done');
}

export function deactivate() {}