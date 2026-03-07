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
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
// Load .env file from extension root
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });
const summary_1 = require("../features/summary");
const hybridRanker_1 = require("../features/search/hybridRanker");
const contextCompressor_1 = require("../features/search/contextCompressor");
const codeGraph_1 = require("../features/graph/codeGraph");
const retryLoop_1 = require("../core/retryLoop");
const diffPreview_1 = require("../features/diffPreview");
const astPatcher_1 = require("../features/patcher/astPatcher");
const multiPassPatcher_1 = require("../features/patcher/multiPassPatcher");
const testRunner_1 = require("../features/testRunner");
const panel_1 = require("../chat/panel");
const slashCommands_1 = require("../commands/slashCommands");
const rulesLoader_1 = require("../commands/rulesLoader");
const statusBar_1 = require("../ui/statusBar");
const INPUT_COST_PER_MILLION = 0.05;
const OUTPUT_COST_PER_MILLION = 0.4;
function activate(context) {
    // ── Status bar ───────────────────────────────────────────────
    (0, statusBar_1.createStatusBar)(context);
    // ── Chat panel ───────────────────────────────────────────────
    const provider = new panel_1.ChatViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(panel_1.ChatViewProvider.viewType, provider));
    // ── Command: open rules file ─────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('om-ai.openRules', () => (0, rulesLoader_1.initRulesFile)()));
    // ── Command: focus chat (used by status bar) ─────────────────
    context.subscriptions.push(vscode.commands.registerCommand('om-ai.openChat', () => vscode.commands.executeCommand('workbench.view.extension.om-ai-sidebar')));
    // ── Command: rebuild code graph ──────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('om-ai.rebuildGraph', async () => {
        (0, codeGraph_1.clearGraphCache)();
        provider.postLog('🔄 Code graph cache cleared. Rebuilding...');
        await (0, codeGraph_1.buildCodeGraph)(true);
        provider.postLog('✅ Code graph rebuilt.');
    }));
    // ── Message handler ──────────────────────────────────────────
    provider.onMessage(async (raw) => {
        try {
            (0, statusBar_1.setState)('thinking');
            provider.postLog('Prompt received');
            if (!raw || raw.trim().length === 0) {
                provider.postLog('⚠️ Empty prompt.');
                (0, statusBar_1.setState)('idle');
                return;
            }
            // ── Slash command dispatch ───────────────────────────
            const slashResult = await (0, slashCommands_1.handleSlashCommand)(raw);
            if (slashResult.kind !== 'passthrough') {
                // Slash commands that only need a text reply
                const simpleKinds = ['explain', 'doc', 'test', 'commit'];
                if (simpleKinds.includes(slashResult.kind)) {
                    provider.postMessage(slashResult.text);
                    (0, statusBar_1.setState)('done');
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
            (0, statusBar_1.setState)('error', err?.message);
        }
    });
}
// ── Core patch pipeline with enhanced features ─────────────────
async function runPatchFlow(instruction, provider) {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
        provider.postLog('❌ No workspace folder open.');
        (0, statusBar_1.setState)('idle');
        return;
    }
    const root = workspace.uri.fsPath;
    // Load project rules (like .cursorrules)
    const projectRules = (0, rulesLoader_1.loadProjectRules)();
    if (projectRules) {
        provider.postLog('📋 Project rules loaded.');
    }
    // ── Step 1: Build code graph ─────────────────────────────────
    provider.postLog('🔍 Building code graph (analyzing imports & symbols)...');
    const graphStart = Date.now();
    const graph = await (0, codeGraph_1.buildCodeGraph)();
    provider.postLog(`✅ Code graph built in ${Date.now() - graphStart}ms (${graph.nodes.size} files, ${graph.symbols.size} symbols)`);
    // ── Step 2: Generate project summary ─────────────────────────
    provider.postLog('📝 Generating project summary...');
    const summary = await (0, summary_1.ensureProjectSummary)();
    // ── Step 3: Hybrid search (semantic + graph + symbol + keyword + intent) ─
    provider.postLog('🔎 Running hybrid search...');
    const searchStart = Date.now();
    // Let hybridSearch auto-detect weights from intent — pass permissive options
    const scoredFiles = await (0, hybridRanker_1.hybridSearch)(instruction, instruction, {
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
            const kw = bd.keyword?.toFixed(2) ?? 'n/a';
            const it = bd.intent?.toFixed(2) ?? 'n/a';
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
    const compressedFiles = await (0, contextCompressor_1.compressMultipleFiles)(filesToCompress, {
        maxTokens: 40000,
        query: instruction,
        includeImports: true,
        includeRelated: true
    });
    const compressedContext = (0, contextCompressor_1.formatCompressedForLLM)(compressedFiles);
    const totalTokens = compressedFiles.reduce((s, f) => s + f.totalTokens, 0);
    const originalTokens = compressedFiles.reduce((s, f) => s + f.originalTokens, 0);
    const compressionRatio = ((1 - totalTokens / originalTokens) * 100).toFixed(1);
    provider.postLog(`✅ Context compressed in ${Date.now() - compressStart}ms`);
    provider.postLog(`   Tokens: ${totalTokens} (reduced by ${compressionRatio}%)`);
    provider.postLog(`   Estimated input cost: $${((totalTokens / 1000000) * INPUT_COST_PER_MILLION).toFixed(6)}`);
    // ── Step 5: Call AI model ────────────────────────────────────
    provider.postLog('🤖 Calling AI model...');
    (0, statusBar_1.setState)('thinking');
    const result = await (0, retryLoop_1.runWithRetry)({
        instruction: instruction + projectRules,
        summary,
        semanticContext: compressedContext // Using compressed context now
    });
    if (!result) {
        provider.postLog('❌ AI returned empty response.');
        (0, statusBar_1.setState)('error');
        return;
    }
    // Actual token cost from response
    if (result.usage) {
        const u = result.usage;
        const pt = u.promptTokenCount ?? 0;
        const ct = u.candidatesTokenCount ?? 0;
        const ic = (pt / 1000000) * INPUT_COST_PER_MILLION;
        const oc = (ct / 1000000) * OUTPUT_COST_PER_MILLION;
        provider.postLog(`📊 Tokens — prompt: ${pt}, completion: ${ct} | Cost: $${(ic + oc).toFixed(6)}`);
    }
    if (!result.success) {
        provider.postLog('❌ AI failed to generate valid patches.');
        if (result.raw) {
            provider.postLog('Model said: ' + result.raw.slice(0, 800));
        }
        (0, statusBar_1.setState)('error');
        return;
    }
    if (!Array.isArray(result.changes) || result.changes.length === 0) {
        provider.postLog('⚠️ AI returned no code changes.');
        (0, statusBar_1.setState)('idle');
        return;
    }
    // ── Step 6: Multi-pass patch validation ───────────────────────
    provider.postLog('🔧 Validating patches (multi-pass)...');
    const patchResult = await (0, multiPassPatcher_1.generateMultiPassPatches)(instruction, compressedContext, root, result.changes, {
        maxPasses: 3,
        validateImports: true,
        validateDependencies: true,
        includeRelatedFiles: true
    });
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
    }
    else {
        provider.postLog('✅ Patch validation passed');
    }
    // ── Step 7: Show diff preview ────────────────────────────────
    provider.postLog(`📝 Generated ${patchResult.changes.length} patch(es). Opening diff preview…`);
    const approved = await (0, diffPreview_1.showDiffPreview)(patchResult.changes, root);
    if (!approved) {
        provider.postLog('⚠️ User cancelled patch.');
        (0, statusBar_1.setState)('idle');
        return;
    }
    // ── Step 8: Apply patches ────────────────────────────────────
    (0, statusBar_1.setState)('patching');
    provider.postLog('✏️ Applying patches...');
    await (0, astPatcher_1.applyAstSafePatches)(patchResult.changes, root);
    // ── Step 9: Run tests ────────────────────────────────────────
    provider.postLog('🧪 Running tests...');
    await (0, testRunner_1.runTests)(root);
    provider.postLog('✅ Completed successfully.');
    (0, statusBar_1.setState)('done');
}
function deactivate() { }
//# sourceMappingURL=extension.js.map