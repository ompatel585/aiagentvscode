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
        const apiKey = await context.secrets.get('OM_AI_KEY');
        if (!apiKey)
            return;
        const summary = await (0, _7_summary_1.ensureProjectSummary)();
        const semanticContext = await (0, _8_embeddings_1.semanticSearch)(instruction);
        const result = await (0, _10_retryLoop_1.runWithRetry)({
            instruction,
            summary,
            semanticContext
        });
        if (!result.success) {
            vscode.window.showErrorMessage("Agent failed");
            return;
        }
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const approved = await (0, _12_diffPreview_1.showDiffPreview)(result.changes, root);
        if (!approved)
            return;
        await (0, _11_astPatcher_1.applyAstSafePatches)(result.changes, root);
        await (0, _14_testRunner_1.runTests)(root);
    });
}
function deactivate() { }
//# sourceMappingURL=1_extension.js.map