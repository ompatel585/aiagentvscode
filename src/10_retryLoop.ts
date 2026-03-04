import { callBrain } from './3_client';
import { BrainResponse } from './5_types';

interface Payload {
    instruction: string;
    summary: string;
    semanticContext: any[];
}

export async function runWithRetry(payload: Payload): Promise<BrainResponse> {

    for (let i = 0; i < 3; i++) {

        const res = await callBrain(payload);
console.log("RAW AI RESPONSE:");
console.log(res);
        if (res.success && Array.isArray(res.changes) && res.changes.length) {
            
            return res;
        }

        payload.instruction += "\nReturn valid JSON with changes array.";
    }

    return { success: false, changes: [] };
}