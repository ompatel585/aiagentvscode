import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | undefined;

function getGenAI(): GoogleGenerativeAI {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not set in environment variables");
        }
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
}

/* ==============================
   BRAIN (code generation)
============================== */

export async function callBrain(payload: any) {

    const model = getGenAI().getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.1,        // Lower temp → more deterministic/precise output
            topP: 0.9,
            responseMimeType: "application/json",   // Force JSON response
        }
    });

    const prompt = `You are an expert AI coding agent with deep knowledge of TypeScript, React, Node.js, and modern web frameworks.

Your task is to analyze the provided codebase context and generate precise file edits.

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no code fences
2. Use EXACT line numbers from the provided file content
3. newText must be complete, valid code (not truncated)
4. Preserve existing code style (indentation, quotes, semicolons)
5. When modifying arrays/objects, include ALL items (existing + new)
6. Line numbers are 0-indexed

JSON FORMAT:
{
  "success": true,
  "summary": "one-line description of changes",
  "changes": [
    {
      "path": "relative/file/path.ext",
      "edits": [
        {
          "startLine": 0,
          "endLine": 5,
          "newText": "complete replacement code"
        }
      ]
    }
  ]
}

INSTRUCTION:
${JSON.stringify(payload.instruction)}

PROJECT SUMMARY:
${JSON.stringify(payload.summary)}

RELEVANT CODE CONTEXT:
${typeof payload.semanticContext === 'string' ? payload.semanticContext : JSON.stringify(payload.semanticContext)}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log("========== RAW MODEL RESPONSE ==========");
    console.log(text.slice(0, 500));
    console.log("========================================");

    return parseModelResponse(text);
}

function parseModelResponse(text: string): any {
    // Strategy 1: direct parse
    try {
        return JSON.parse(text);
    } catch { /* try next */ }

    // Strategy 2: strip markdown code fences
    const stripped = text
        .replace(/^```(?:json)?\s*/im, '')
        .replace(/\s*```\s*$/im, '')
        .trim();
    try {
        return JSON.parse(stripped);
    } catch { /* try next */ }

    // Strategy 3: extract first complete JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch { /* try next */ }
    }

    // Strategy 4: find "success" key and rebuild
    const successIdx = text.indexOf('"success"');
    if (successIdx !== -1) {
        const from = text.lastIndexOf('{', successIdx);
        const to = text.lastIndexOf('}');
        if (from !== -1 && to !== -1 && to > from) {
            try {
                return JSON.parse(text.slice(from, to + 1));
            } catch { /* fall through */ }
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

export async function callEmbeddingAPI(text: string): Promise<number[]> {

    try {

        const model = getGenAI().getGenerativeModel({
            model: "text-embedding-004"
        });

        const result = await model.embedContent(text);
        
        // Validate we got a valid embedding
        if (!result.embedding || !result.embedding.values || result.embedding.values.length === 0) {
            console.error("Embedding API returned empty result");
            return [];
        }

        return result.embedding.values;

    } catch (err) {

        console.error("Embedding error:", err);
        return [];

    }
}