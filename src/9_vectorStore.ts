import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { callEmbeddingAPI } from './3_client';

const DB_PATH = path.join(process.cwd(), '.om-ai-vectors.json');

interface Store {
    [key: string]: number[];
}

let cache: Store = {};

if (fs.existsSync(DB_PATH)) {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function hash(text: string) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

export async function getEmbedding(text: string) {

    const key = hash(text);

    if (cache[key]) return cache[key];

    const vector = await callEmbeddingAPI(text);

    cache[key] = vector;

    fs.writeFileSync(DB_PATH, JSON.stringify(cache));

    return vector;
}