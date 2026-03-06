import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const RULES_FILE = '.om-ai-rules.md';

/**
 * Load project-level AI rules from `.om-ai-rules.md` in the workspace root.
 * Similar to Cursor's `.cursorrules` — injected into every prompt.
 */
export function loadProjectRules(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return '';

    const rulesPath = path.join(root, RULES_FILE);
    if (!fs.existsSync(rulesPath)) return '';

    try {
        const content = fs.readFileSync(rulesPath, 'utf-8').trim();
        return content ? `\n\n## Project Rules (from ${RULES_FILE})\n${content}` : '';
    } catch {
        return '';
    }
}

/**
 * Create a default .om-ai-rules.md if one doesn't exist.
 */
export async function initRulesFile(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;

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

