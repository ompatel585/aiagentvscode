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
exports.loadProjectRules = loadProjectRules;
exports.initRulesFile = initRulesFile;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const RULES_FILE = '.om-ai-rules.md';
/**
 * Load project-level AI rules from `.om-ai-rules.md` in the workspace root.
 * Similar to Cursor's `.cursorrules` — injected into every prompt.
 */
function loadProjectRules() {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root)
        return '';
    const rulesPath = path.join(root, RULES_FILE);
    if (!fs.existsSync(rulesPath))
        return '';
    try {
        const content = fs.readFileSync(rulesPath, 'utf-8').trim();
        return content ? `\n\n## Project Rules (from ${RULES_FILE})\n${content}` : '';
    }
    catch {
        return '';
    }
}
/**
 * Create a default .om-ai-rules.md if one doesn't exist.
 */
async function initRulesFile() {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root)
        return;
    const rulesPath = path.join(root, RULES_FILE);
    if (fs.existsSync(rulesPath)) {
        // Open it so the user can see it
        const doc = await vscode.workspace.openTextDocument(rulesPath);
        await vscode.window.showTextDocument(doc);
        return;
    }
    const defaultRules = `# Om AI Rules

## Code Style
- Use TypeScript strict mode
- Prefer async/await over callbacks
- Use descriptive variable names

## Architecture
- Keep functions under 40 lines
- Separate concerns: one file per responsibility

## Testing
- Every exported function should have a unit test
- Use Jest for testing

## Commit Messages
- Follow conventional commits: type(scope): description
`;
    fs.writeFileSync(rulesPath, defaultRules, 'utf-8');
    const doc = await vscode.workspace.openTextDocument(rulesPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created ${RULES_FILE} — edit it to guide AI behaviour across all prompts.`);
}
//# sourceMappingURL=rulesLoader.js.map