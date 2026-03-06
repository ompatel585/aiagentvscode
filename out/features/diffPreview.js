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
exports.showDiffPreview = showDiffPreview;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function showDiffPreview(patches, root) {
    for (const patch of patches) {
        const full = path.join(root, patch.path);
        if (!fs.existsSync(full))
            continue;
        const original = fs.readFileSync(full, 'utf-8');
        let updated = original;
        for (const edit of patch.edits) {
            const lines = updated.split('\n');
            lines.splice(edit.startLine, edit.endLine - edit.startLine, edit.newText);
            updated = lines.join('\n');
        }
        const left = vscode.Uri.parse(`untitled:${patch.path}-old`);
        const right = vscode.Uri.parse(`untitled:${patch.path}-new`);
        await vscode.workspace.openTextDocument(left).then(d => vscode.window.showTextDocument(d).then(e => e.edit(b => b.insert(new vscode.Position(0, 0), original))));
        await vscode.workspace.openTextDocument(right).then(d => vscode.window.showTextDocument(d).then(e => e.edit(b => b.insert(new vscode.Position(0, 0), updated))));
        await vscode.commands.executeCommand('vscode.diff', left, right, `Preview: ${patch.path}`);
    }
    const choice = await vscode.window.showQuickPick(['Apply Changes', 'Cancel'], { placeHolder: 'Approve AI changes?' });
    return choice === 'Apply Changes';
}
//# sourceMappingURL=diffPreview.js.map