"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callBrain = callBrain;
exports.callEmbeddingAPI = callEmbeddingAPI;
const axios_1 = __importDefault(require("axios"));
async function callBrain(payload) {
    const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-5-nano',
        messages: [
            { role: 'system', content: 'Return structured JSON patches only.' },
            { role: 'user', content: JSON.stringify(payload) }
        ],
        temperature: 0
    }, {
        headers: {
            Authorization: `Bearer ${process.env.OM_AI_KEY}`
        }
    });
    try {
        return JSON.parse(res.data.choices[0].message.content);
    }
    catch {
        return { success: false, changes: [] };
    }
}
async function callEmbeddingAPI(text) {
    const res = await axios_1.default.post('https://api.openai.com/v1/embeddings', {
        model: 'text-embedding-3-small',
        input: text
    }, {
        headers: {
            Authorization: `Bearer ${process.env.OM_AI_KEY}`
        }
    });
    return res.data.data[0].embedding;
}
//# sourceMappingURL=3_client.js.map