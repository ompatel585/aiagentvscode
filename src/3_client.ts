import axios from 'axios';

export async function callBrain(payload: any) {

    const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-5-nano',
            messages: [
                { role: 'system', content: 'Return structured JSON patches only.' },
                { role: 'user', content: JSON.stringify(payload) }
            ],
            temperature: 0
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.OM_AI_KEY}`
            }
        }
    );

    try {
        return JSON.parse(res.data.choices[0].message.content);
    } catch {
        return { success: false, changes: [] };
    }
}

export async function callEmbeddingAPI(text: string) {

    const res = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
            model: 'text-embedding-3-small',
            input: text
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.OM_AI_KEY}`
            }
        }
    );

    return res.data.data[0].embedding;
}