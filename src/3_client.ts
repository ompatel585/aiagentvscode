import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY!
);

/* ==============================
   BRAIN (code generation)
============================== */

export async function callBrain(payload: any) {

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
    } catch (err) {

        console.log("JSON PARSE FAILED");
        console.log(err);

        return {
            success: false,
            changes: [],
            raw: text
        };
    }
}

/* ==============================
   EMBEDDINGS
============================== */

export async function callEmbeddingAPI(text: string): Promise<number[]> {

    try {

        const model = genAI.getGenerativeModel({
            model: "text-embedding-004"
        });

        const result = await model.embedContent(text);

        return result.embedding.values;

    } catch (err) {

        console.error("Embedding error:", err);
        return [];

    }
}