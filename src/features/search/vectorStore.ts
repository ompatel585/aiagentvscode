import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { callEmbeddingAPI } from '../../core/client';

const DB_PATH = path.join(process.cwd(), '.om-ai-vectors.json');

interface Store {
    [key: string]: number[];
}

let cache: Store = {};

if (fs.existsSync(DB_PATH)) {
    try {
        cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
        console.warn('[VectorStore] Failed to load vector cache, starting fresh');
        cache = {};
    }
}

function hash(text: string) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

export async function getEmbedding(text: string): Promise<number[]> {
    // Handle empty or invalid input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        console.warn('[VectorStore] Empty text provided for embedding');
        return [];
    }

    const key = hash(text);

    // Return cached embedding if available and valid
    if (cache[key] && Array.isArray(cache[key]) && cache[key].length > 0) {
        return cache[key];
    }

    console.log('[VectorStore] Calling embedding API for:', text.slice(0, 50) + '...');
    const vector = await callEmbeddingAPI(text);

    // Only cache if we got a valid embedding
    if (Array.isArray(vector) && vector.length > 0) {
        cache[key] = vector;
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(cache));
        } catch (e) {
            console.warn('[VectorStore] Failed to save vector cache:', e);
        }
    } else {
        console.error('[VectorStore] Failed to get valid embedding, not caching');
    }

    return vector;
}

export function cosineSimilarity(a: number[], b: number[]) {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (magA * magB);
}

