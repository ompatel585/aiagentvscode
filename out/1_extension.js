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
function activate(context) {
    const provider = new panel_1.ChatViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(panel_1.ChatViewProvider.viewType, provider));
    provider.onMessage(async (instruction) => {
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
            const summary = await (0, _7_summary_1.ensureProjectSummary)();
            provider.postLog("Running semantic search...");
            const semanticContext = await (0, _8_embeddings_1.semanticSearch)(instruction);
            const fileCount = semanticContext.length;
            provider.postLog(`Relevant files: ${fileCount}`);
            // ===== TOKEN ESTIMATION =====
            const contextChars = semanticContext.reduce((sum, f) => sum + (f.content?.length || 0), 0);
            const estimatedPromptTokens = Math.round(contextChars / 4);
            provider.postLog(`Context characters: ${contextChars}`);
            provider.postLog(`Estimated prompt tokens: ${estimatedPromptTokens}`);
            // ===== COST ESTIMATION =====
            const INPUT_COST_PER_MILLION = 0.05;
            const OUTPUT_COST_PER_MILLION = 0.4;
            const estimatedInputCost = (estimatedPromptTokens / 1000000) * INPUT_COST_PER_MILLION;
            provider.postLog(`Estimated input cost: $${estimatedInputCost.toFixed(6)} (0.05$/million)`);
            provider.postLog("Calling AI model...");
            const result = await (0, _10_retryLoop_1.runWithRetry)({
                instruction,
                summary,
                semanticContext
            });
            if (!result) {
                provider.postLog("❌ AI returned empty response.");
                return;
            }
            // ===== TOKEN + COST FROM RESPONSE =====
            if (result.usage) {
                const usage = result.usage;
                const promptTokens = usage.promptTokenCount || 0;
                const completionTokens = usage.candidatesTokenCount || 0;
                const totalTokens = usage.totalTokenCount || 0;
                const inputCost = (promptTokens / 1000000) * INPUT_COST_PER_MILLION;
                const outputCost = (completionTokens / 1000000) * OUTPUT_COST_PER_MILLION;
                const totalCost = inputCost + outputCost;
                provider.postLog(`Prompt tokens: ${promptTokens} (cost $${inputCost.toFixed(6)})`);
                provider.postLog(`Completion tokens: ${completionTokens} (cost $${outputCost.toFixed(6)})`);
                provider.postLog(`Total tokens: ${totalTokens}`);
                provider.postLog(`Total cost: $${totalCost.toFixed(6)}`);
            }
            if (!result.success) {
                provider.postLog("❌ AI failed to generate valid patches.");
                if (result.raw) {
                    provider.postLog("Model response:");
                    provider.postLog(result.raw.slice(0, 1000));
                }
                return;
            }
            if (!Array.isArray(result.changes) || result.changes.length === 0) {
                provider.postLog("⚠️ AI returned no code changes.");
                return;
            }
            provider.postLog(`Generated patches: ${result.changes.length}`);
            provider.postLog("Opening diff preview...");
            const approved = await (0, _12_diffPreview_1.showDiffPreview)(result.changes, root);
            if (!approved) {
                provider.postLog("⚠️ User cancelled patch.");
                return;
            }
            provider.postLog("Applying patches safely...");
            await (0, _11_astPatcher_1.applyAstSafePatches)(result.changes, root);
            provider.postLog("Running project tests...");
            await (0, _14_testRunner_1.runTests)(root);
            provider.postLog("✅ Completed successfully.");
        }
        catch (err) {
            console.error("Extension runtime error:", err);
            provider.postLog(`❌ Runtime error: ${err?.message || JSON.stringify(err)}`);
        }
    });
}
function deactivate() { }
//# sourceMappingURL=1_extension.js.map