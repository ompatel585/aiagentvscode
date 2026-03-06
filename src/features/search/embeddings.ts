import * as vscode from 'vscode';
import * as path from 'path';
import { getEmbedding, cosineSimilarity } from './vectorStore';

/**
 * @deprecated Use hybridSearch from './hybridRanker' instead for better results.
 * This function only uses semantic similarity without graph-based ranking.
 */
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

