import * as vscode from 'vscode';

export async function indexProject() {
    return vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx}',
        '**/{node_modules,dist,.git}/**'
    );
}

