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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const _7_summary_1 = require("./7_summary");
const _8_embeddings_1 = require("./8_embeddings");
const _10_retryLoop_1 = require("./10_retryLoop");
const _12_diffPreview_1 = require("./12_diffPreview");
const _11_astPatcher_1 = require("./11_astPatcher");
const _14_testRunner_1 = require("./14_testRunner");
const panel_1 = require("./chat/panel");
const _15_slashCommands_1 = require("./15_slashCommands");
const _16_rulesLoader_1 = require("./16_rulesLoader");
const _17_statusBar_1 = require("./17_statusBar");
const INPUT_COST_PER_MILLION = 0.05;
const OUTPUT_COST_PER_MILLION = 0.4;
function activate(context) {
    // ── Status bar ───────────────────────────────────────────────
    (0, _17_statusBar_1.createStatusBar)(context);
    // ── Chat panel ───────────────────────────────────────────────
    const provider = new panel_1.ChatViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(panel_1.ChatViewProvider.viewType, provider));
    // ── Command: open rules file ─────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('om-ai.openRules', () => (0, _16_rulesLoader_1.initRulesFile)()));
    // ── Command: focus chat (used by status bar) ─────────────────
    context.subscriptions.push(vscode.commands.registerCommand('om-ai.openChat', () => vscode.commands.executeCommand('workbench.view.extension.om-ai-sidebar')));
    // ── Message handler ──────────────────────────────────────────
    provider.onMessage(async (raw) => {
        try {
            (0, _17_statusBar_1.setState)('thinking');
            provider.postLog('Prompt received');
            if (!raw || raw.trim().length === 0) {
                provider.postLog('⚠️ Empty prompt.');
                (0, _17_statusBar_1.setState)('idle');
                return;
            }
            // ── Slash command dispatch ───────────────────────────
            const slashResult = await (0, _15_slashCommands_1.handleSlashCommand)(raw);
            if (slashResult.kind !== 'passthrough') {
                // Slash commands that only need a text reply
                const simpleKinds = ['explain', 'doc', 'test', 'commit'];
                if (simpleKinds.includes(slashResult.kind)) {
                    provider.postMessage(slashResult.text);
                    (0, _17_statusBar_1.setState)('done');
                    return;
                }
                // /fix — rewrite instruction and fall through to patcher
                if (slashResult.kind === 'fix') {
                    const fixResult = slashResult;
                    provider.postLog('/fix — delegating to patcher…');
                    // replace raw with the synthesised instruction
                    return await runPatchFlow(fixResult.instruction, provider);
                }
            }
            // ── Normal (non-slash) prompt ────────────────────────
            await runPatchFlow(raw, provider);
        }
        catch (err) {
            console.error('Extension runtime error:', err);
            provider.postLog(`❌ Runtime error: ${err?.message ?? JSON.stringify(err)}`);
            (0, _17_statusBar_1.setState)('error', err?.message);
        }
    });
}
// ── Core patch pipeline ──────────────────────────────────────────
async function runPatchFlow(instruction, provider) {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        provider.postLog('❌ No workspace folder open.');
        (0, _17_statusBar_1.setState)('idle');
        return;
    }
    const root = workspace.uri.fsPath;
    // Load project rules (like .cursorrules)
    const projectRules = (0, _16_rulesLoader_1.loadProjectRules)();
    if (projectRules) {
        provider.postLog('📋 Project rules loaded.');
    }
    provider.postLog('Building project summary…');
    const summary = await (0, _7_summary_1.ensureProjectSummary)();
    provider.postLog('Running semantic search…');
    const semanticContext = await (0, _8_embeddings_1.semanticSearch)(instruction);
    provider.postLog(`Relevant files: ${semanticContext.length}`);
    // Token estimation
    const contextChars = semanticContext.reduce((s, f) => s + (f.content?.length ?? 0), 0);
    const estimatedTokens = Math.round(contextChars / 4);
    provider.postLog(`Estimated prompt tokens: ~${estimatedTokens}`);
    provider.postLog(`Estimated input cost: $${((estimatedTokens / 1000000) * INPUT_COST_PER_MILLION).toFixed(6)}`);
    provider.postLog('Calling AI model…');
    (0, _17_statusBar_1.setState)('thinking');
    const result = await (0, _10_retryLoop_1.runWithRetry)({
        instruction: instruction + projectRules, // ← rules injected here
        summary,
        semanticContext
    });
    if (!result) {
        provider.postLog('❌ AI returned empty response.');
        (0, _17_statusBar_1.setState)('error');
        return;
    }
    // Actual token cost from response
    if (result.usage) {
        const u = result.usage;
        const pt = u.promptTokenCount ?? 0;
        const ct = u.candidatesTokenCount ?? 0;
        const ic = (pt / 1000000) * INPUT_COST_PER_MILLION;
        const oc = (ct / 1000000) * OUTPUT_COST_PER_MILLION;
        provider.postLog(`Tokens — prompt: ${pt}, completion: ${ct} | Cost: $${(ic + oc).toFixed(6)}`);
    }
    if (!result.success) {
        provider.postLog('❌ AI failed to generate valid patches.');
        if (result.raw) {
            provider.postLog('Model said: ' + result.raw.slice(0, 800));
        }
        (0, _17_statusBar_1.setState)('error');
        return;
    }
    if (!Array.isArray(result.changes) || result.changes.length === 0) {
        provider.postLog('⚠️ AI returned no code changes.');
        (0, _17_statusBar_1.setState)('idle');
        return;
    }
    provider.postLog(`Generated ${result.changes.length} patch(es). Opening diff preview…`);
    const approved = await (0, _12_diffPreview_1.showDiffPreview)(result.changes, root);
    if (!approved) {
        provider.postLog('⚠️ User cancelled patch.');
        (0, _17_statusBar_1.setState)('idle');
        return;
    }
    (0, _17_statusBar_1.setState)('patching');
    provider.postLog('Applying patches…');
    await (0, _11_astPatcher_1.applyAstSafePatches)(result.changes, root);
    provider.postLog('Running tests…');
    await (0, _14_testRunner_1.runTests)(root);
    provider.postLog('✅ Completed successfully.');
    (0, _17_statusBar_1.setState)('done');
}
function deactivate() { }
//# sourceMappingURL=1_extension.js.map