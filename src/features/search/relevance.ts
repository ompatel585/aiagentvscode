/**
 * Relevance module - provides utility functions for file relevance scoring
 * @deprecated Use hybridRanker.ts for comprehensive ranking
 */

export interface RelevanceScore {
    path: string;
    score: number;
    factors: {
        semantic: number;
        graph: number;
        symbol: number;
        recency: number;
    };
}

/**
 * Simple relevance scoring based on keyword matching
 * Used as a fallback when graph is not available
 */
export function calculateKeywordRelevance(
    query: string,
    filePath: string,
    content: string
): number {
    const queryLower = query.toLowerCase();
    const pathLower = filePath.toLowerCase();
    const contentLower = content.toLowerCase();
    
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    let score = 0;
    
    for (const term of queryTerms) {
        // Path match (highest weight)
        if (pathLower.includes(term)) {
            score += 0.5;
        }
        // Content match
        const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
        score += Math.min(0.3, matches * 0.05);
    }
    
    return Math.min(1, score);
}

/**
 * Sort files by relevance score
 */
export function sortByRelevance(files: RelevanceScore[]): RelevanceScore[] {
    return files.sort((a, b) => b.score - a.score);
}

