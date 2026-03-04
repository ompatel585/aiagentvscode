"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callBrain = callBrain;
exports.callEmbeddingAPI = callEmbeddingAPI;
const generative_ai_1 = require("@google/generative-ai");
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyCsUW2S4cUL7I9NFDfKS-qPjWOTdGgQiWU");
async function callBrain(payload) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
    });
    const prompt = `
You are an AI coding agent.

Return ONLY valid JSON in this format:

{
 "success": true,
 "changes": [
  {
   "path": "relative/file/path.js",
   "edits": [
    {
     "startLine": number,
     "endLine": number,
     "newText": "replacement code"
    }
   ]
  }
 ]
}

Rules:
- Return JSON only
- No explanation
- No markdown
- Only modify existing files

Instruction:
${JSON.stringify(payload)}
`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log("========== RAW MODEL RESPONSE ==========");
    console.log(text);
    console.log("========================================");
    try {
        return JSON.parse(text);
    }
    catch (err) {
        console.log("JSON PARSE FAILED");
        console.log(err);
        return {
            success: false,
            changes: [],
            raw: text
        };
    }
}
async function callEmbeddingAPI(text) {
    return [];
}
//# sourceMappingURL=3_client.js.map