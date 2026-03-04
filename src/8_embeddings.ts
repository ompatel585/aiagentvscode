import * as vscode from 'vscode';
import * as path from 'path';
import { getEmbedding } from './9_vectorStore';

export async function semanticSearch(query: string) {

    const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!root) return [];

    const files = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx}',
        '**/{node_modules,dist,.git}/**'
    );

    const queryEmbedding = await getEmbedding(query);
    const scored = [];

    for (const file of files) {

        const doc = await vscode.workspace.openTextDocument(file);
        const content = doc.getText().slice(0, 8000);

        const emb = await getEmbedding(content);
        const score = cosineSimilarity(queryEmbedding, emb);

        scored.push({
            path: path.relative(root, file.fsPath),
            content,
            score
        });
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, 3);
}

function cosineSimilarity(a: number[], b: number[]) {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (magA * magB);
}