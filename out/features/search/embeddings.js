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
exports.semanticSearch = semanticSearch;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const vectorStore_1 = require("./vectorStore");
/**
 * @deprecated Use hybridSearch from './hybridRanker' instead for better results.
 * This function only uses semantic similarity without graph-based ranking.
 */
async function semanticSearch(query) {
    const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!root)
        return [];
    const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx}', '**/{node_modules,dist,.git}/**');
    const queryEmbedding = await (0, vectorStore_1.getEmbedding)(query);
    const scored = [];
    for (const file of files) {
        const doc = await vscode.workspace.openTextDocument(file);
        const content = doc.getText().slice(0, 8000);
        const emb = await (0, vectorStore_1.getEmbedding)(content);
        const score = (0, vectorStore_1.cosineSimilarity)(queryEmbedding, emb);
        scored.push({
            path: path.relative(root, file.fsPath),
            content,
            score
        });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3);
}
//# sourceMappingURL=embeddings.js.map