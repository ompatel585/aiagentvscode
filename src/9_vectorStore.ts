import * as fs from 'fs';
import * as path from 'path';
import { callEmbeddingAPI } from './3_client';

const DB_PATH = path.join(process.cwd(), '.om-ai-vectors.json');

interface Store {
    [key: string]: number[];
}

let cache: Store = {};

if (fs.existsSync(DB_PATH)) {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

export async function getEmbedding(text: string) {

    if (cache[text]) return cache[text];

    const vector = await callEmbeddingAPI(text);
    cache[text] = vector;

    fs.writeFileSync(DB_PATH, JSON.stringify(cache));

    return vector;
}