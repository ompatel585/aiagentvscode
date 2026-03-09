"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callBrain = callBrain;
exports.callEmbeddingAPI = callEmbeddingAPI;
const generative_ai_1 = require("@google/generative-ai");
let genAI;
function getGenAI() {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not set in environment variables");
        }
        genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    return genAI;
}
/* ==============================
   BRAIN (code generation)
============================== */
async function callBrain(payload) {
    const model = getGenAI().getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.1,
            topP: 0.9,
            responseMimeType: "application/json",
        }
    });
    const prompt = `You are an expert AI coding agent. Your task is to analyze a codebase and produce file edits.

== PATCH FORMAT ==
Each edit replaces lines [startLine, endLine) with newText (0-indexed, endLine is EXCLUSIVE).
- To replace lines 0-10: startLine=0, endLine=10 — this deletes lines 0..9 and inserts newText
- To insert before line 5: startLine=5, endLine=5, newText="new line\\n"
- To delete lines 3-5: startLine=3, endLine=5, newText=""
- Multiple edits in one file MUST be sorted by startLine DESCENDING (apply bottom-up) to avoid offset drift

== CRITICAL RULES ==
1. Return ONLY valid JSON — no markdown, no explanation, no code fences
2. Line numbers are 0-indexed. Count them carefully from the provided file content.
3. When replacing a variable/array/object declaration, ALWAYS include the FULL declaration:
   - startLine must point to the line with "const"/"let"/"var" keyword
   - endLine must point to the line AFTER the closing ";" or "};" of that declaration
   - newText must contain the complete new declaration including keyword and semicolon
4. When modifying a data structure that is consumed by JSX/template code, you MUST also update
   all references to changed field names in the same patch (e.g. if you rename "cta" to "buttonText",
   update every occurrence of plan.cta to plan.buttonText in the same file's edits)
5. newText must be syntactically complete and valid — never truncate mid-expression
6. Preserve existing code style (indentation, quotes, semicolons)
7. Do NOT use line-number-based patches for large structural changes spanning >30 lines.
   Instead, replace the entire file: startLine=0, endLine=<total line count of file>
8. After generating patches, mentally re-read the resulting file to verify it has no
   duplicate declarations, orphaned JSX tags, or missing return statements

== OUTPUT FORMAT ==
{
  "success": true,
  "summary": "one-line description",
  "changes": [
    {
      "path": "relative/file/path.ext",
      "edits": [
        {
          "startLine": 0,
          "endLine": 10,
          "newText": "complete replacement code here"
        }
      ]
    }
  ]
}

INSTRUCTION:
${JSON.stringify(payload.instruction)}

PROJECT SUMMARY:
${JSON.stringify(payload.summary)}

RELEVANT CODE CONTEXT (includes line numbers as comments):
${typeof payload.semanticContext === 'string' ? payload.semanticContext : JSON.stringify(payload.semanticContext)}
`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log("========== RAW MODEL RESPONSE ==========");
    console.log(text.slice(0, 500));
    console.log("========================================");
    return parseModelResponse(text);
}
function parseModelResponse(text) {
    // Strategy 1: direct parse
    try {
        return JSON.parse(text);
    }
    catch { /* try next */ }
    // Strategy 2: strip markdown code fences
    const stripped = text
        .replace(/^```(?:json)?\s*/im, '')
        .replace(/\s*```\s*$/im, '')
        .trim();
    try {
        return JSON.parse(stripped);
    }
    catch { /* try next */ }
    // Strategy 3: extract first complete JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        }
        catch { /* try next */ }
    }
    // Strategy 4: find "success" key and rebuild
    const successIdx = text.indexOf('"success"');
    if (successIdx !== -1) {
        const from = text.lastIndexOf('{', successIdx);
        const to = text.lastIndexOf('}');
        if (from !== -1 && to !== -1 && to > from) {
            try {
                return JSON.parse(text.slice(from, to + 1));
            }
            catch { /* fall through */ }
        }
    }
    console.warn('[Client] All JSON parse strategies failed');
    return {
        success: false,
        changes: [],
        raw: text
    };
}
/* ==============================
   EMBEDDINGS
============================== */
async function callEmbeddingAPI(text) {
    try {
        console.log('[Embedding] Calling API with text:', text.slice(0, 100));
        const model = getGenAI().getGenerativeModel({
            model: "text-embedding-004"
        });
        const result = await model.embedContent(text);
        if (!result.embedding || !result.embedding.values || result.embedding.values.length === 0) {
            console.error("[Embedding] API returned empty embedding result");
            return [];
        }
        console.log('[Embedding] Got embedding with', result.embedding.values.length, 'dimensions');
        return result.embedding.values;
    }
    catch (err) {
        console.error("[Embedding] API error:", err?.message || err);
        console.error("[Embedding] Full error:", err);
        return [];
    }
}
//# sourceMappingURL=client.js.map