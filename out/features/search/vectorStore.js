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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbedding = getEmbedding;
exports.cosineSimilarity = cosineSimilarity;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../../core/client");
const DB_PATH = path.join(process.cwd(), '.om-ai-vectors.json');
let cache = {};
if (fs.existsSync(DB_PATH)) {
    try {
        cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    }
    catch (e) {
        console.warn('[VectorStore] Failed to load vector cache, starting fresh');
        cache = {};
    }
}
function hash(text) {
    return crypto_1.default.createHash('sha256').update(text).digest('hex');
}
async function getEmbedding(text) {
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
    const vector = await (0, client_1.callEmbeddingAPI)(text);
    // Only cache if we got a valid embedding
    if (Array.isArray(vector) && vector.length > 0) {
        cache[key] = vector;
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(cache));
        }
        catch (e) {
            console.warn('[VectorStore] Failed to save vector cache:', e);
        }
    }
    else {
        console.error('[VectorStore] Failed to get valid embedding, not caching');
    }
    return vector;
}
function cosineSimilarity(a, b) {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (magA * magB);
}
//# sourceMappingURL=vectorStore.js.map