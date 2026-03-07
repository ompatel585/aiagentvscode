import * as vscode from 'vscode';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env file from extension root
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { ensureProjectSummary } from '../features/summary';
import { hybridSearch, rerankByInstruction } from '../features/search/hybridRanker';
import { compressFileContext, formatCompressedForLLM, compressMultipleFiles } from '../features/search/contextCompressor';
import { buildCodeGraph, clearGraphCache } from '../features/graph/codeGraph';
import { runWithRetry } from '../core/retryLoop';
import { showDiffPreview } from '../features/diffPreview';
import { applyAstSafePatches } from '../features/patcher/astPatcher';
import { generateMultiPassPatches } from '../features/patcher/multiPassPatcher';
import { runTests } from '../features/testRunner';
import { ChatViewProvider } from '../chat/panel';
import { handleSlashCommand } from '../commands/slashCommands';
import { loadProjectRules, initRulesFile } from '../commands/rulesLoader';
import { createStatusBar, setState } from '../ui/statusBar';

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

    // ── Command: rebuild code graph ──────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('om-ai.rebuildGraph', async () => {
            clearGraphCache();
            provider.postLog('🔄 Code graph cache cleared. Rebuilding...');
            await buildCodeGraph(true);
            provider.postLog('✅ Code graph rebuilt.');
        })
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

// ── Core patch pipeline with enhanced features ─────────────────
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

    // ── Step 1: Build code graph ─────────────────────────────────
    provider.postLog('🔍 Building code graph (analyzing imports & symbols)...');
    const graphStart = Date.now();
    const graph = await buildCodeGraph();
    provider.postLog(`✅ Code graph built in ${Date.now() - graphStart}ms (${graph.nodes.size} files, ${graph.symbols.size} symbols)`);

    // ── Step 2: Generate project summary ─────────────────────────
    provider.postLog('📝 Generating project summary...');
    const summary = await ensureProjectSummary();

    // ── Step 3: Hybrid search (semantic + graph + symbol + keyword + intent) ─
    provider.postLog('🔎 Running hybrid search...');
    const searchStart = Date.now();
    
    // Let hybridSearch auto-detect weights from intent — pass permissive options
    const scoredFiles = await hybridSearch(instruction, instruction, {
        maxFiles: 15,
        maxTokens: 80000,
        includeRelatedDepth: 2,
        // Weights are now dynamically computed inside hybridSearch based on intent
        // These serve as guidance hints only
        weights: {
            semantic: 0.20,
            graph: 0.15,
            symbol: 0.15,
            recency: 0.05,
            type: 0.05,
        }
    });
    
    provider.postLog(`✅ Hybrid search completed in ${Date.now() - searchStart}ms`);
    provider.postLog(`📄 Found ${scoredFiles.length} relevant files`);

    // Log top files with FULL score breakdown including new signals
    for (let i = 0; i < Math.min(5, scoredFiles.length); i++) {
        const file = scoredFiles[i];
        const bd = file.scoreBreakdown;
        provider.postLog(`   ${i + 1}. ${file.path} (score: ${file.score.toFixed(3)})`);
        if (bd) {
            const kw = (bd as any).keyword?.toFixed(2) ?? 'n/a';
            const it = (bd as any).intent?.toFixed(2) ?? 'n/a';
            provider.postLog(`      └─ semantic: ${bd.semantic.toFixed(2)}, graph: ${bd.graph.toFixed(2)}, symbol: ${bd.symbol.toFixed(2)}, keyword: ${kw}, intent: ${it}`);
        }
    }

    // ── Step 4: Context compression ──────────────────────────────
    provider.postLog('🗜️ Compressing context...');
    const compressStart = Date.now();
    
    const filesToCompress = scoredFiles.map(f => ({
        path: f.path,
        content: f.content
    }));

    const compressedFiles = await compressMultipleFiles(filesToCompress, {
        maxTokens: 40000,
        query: instruction,
        includeImports: true,
        includeRelated: true
    });
    
    const compressedContext = formatCompressedForLLM(compressedFiles);
    const totalTokens = compressedFiles.reduce((s, f) => s + f.totalTokens, 0);
    const originalTokens = compressedFiles.reduce((s, f) => s + f.originalTokens, 0);
    const compressionRatio = ((1 - totalTokens / originalTokens) * 100).toFixed(1);
    
    provider.postLog(`✅ Context compressed in ${Date.now() - compressStart}ms`);
    provider.postLog(`   Tokens: ${totalTokens} (reduced by ${compressionRatio}%)`);
    provider.postLog(`   Estimated input cost: $${((totalTokens / 1_000_000) * INPUT_COST_PER_MILLION).toFixed(6)}`);

    // ── Step 5: Call AI model ────────────────────────────────────
    provider.postLog('🤖 Calling AI model...');
    setState('thinking');

    const result = await runWithRetry({
        instruction: instruction + projectRules,
        summary,
        semanticContext: compressedContext // Using compressed context now
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
        provider.postLog(`📊 Tokens — prompt: ${pt}, completion: ${ct} | Cost: $${(ic + oc).toFixed(6)}`);
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

    // ── Step 6: Multi-pass patch validation ───────────────────────
    provider.postLog('🔧 Validating patches (multi-pass)...');
    const patchResult = await generateMultiPassPatches(
        instruction,
        compressedContext,
        root,
        result.changes,
        {
            maxPasses: 3,
            validateImports: true,
            validateDependencies: true,
            includeRelatedFiles: true
        }
    );

    if (patchResult.diagnostics.length > 0) {
        const errors = patchResult.diagnostics.filter(d => d.severity === 'error');
        const warnings = patchResult.diagnostics.filter(d => d.severity === 'warning');
        
        if (errors.length > 0) {
            provider.postLog(`⚠️ Patch validation found ${errors.length} error(s):`);
            errors.slice(0, 3).forEach(e => provider.postLog(`   ❌ ${e.file}: ${e.message}`));
        }
        if (warnings.length > 0) {
            provider.postLog(`   ${warnings.length} warning(s) (non-critical)`);
        }
    }

    if (!patchResult.success) {
        provider.postLog('❌ Patch validation failed. Proceeding with caution...');
    } else {
        provider.postLog('✅ Patch validation passed');
    }

    // ── Step 7: Show diff preview ────────────────────────────────
    provider.postLog(`📝 Generated ${patchResult.changes.length} patch(es). Opening diff preview…`);

    const approved = await showDiffPreview(patchResult.changes, root);
    if (!approved) {
        provider.postLog('⚠️ User cancelled patch.');
        setState('idle');
        return;
    }

    // ── Step 8: Apply patches ────────────────────────────────────
    setState('patching');
    provider.postLog('✏️ Applying patches...');
    await applyAstSafePatches(patchResult.changes, root);

    // ── Step 9: Run tests ────────────────────────────────────────
    provider.postLog('🧪 Running tests...');
    await runTests(root);

    provider.postLog('✅ Completed successfully.');
    setState('done');
}

export function deactivate() {}