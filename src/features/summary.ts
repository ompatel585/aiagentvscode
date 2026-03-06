import * as vscode from 'vscode';

export async function ensureProjectSummary() {

    const files = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx}',
        '**/{node_modules,dist,.git}/**'
    );

    return `Project contains ${files.length} source files.`;
}

