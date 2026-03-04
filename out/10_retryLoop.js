"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWithRetry = runWithRetry;
const _3_client_1 = require("./3_client");
async function runWithRetry(payload) {
    for (let i = 0; i < 3; i++) {
        const res = await (0, _3_client_1.callBrain)(payload);
        console.log("RAW AI RESPONSE:");
        console.log(res);
        if (res.success && Array.isArray(res.changes) && res.changes.length) {
            return res;
        }
        payload.instruction += "\nReturn valid JSON with changes array.";
    }
    return { success: false, changes: [] };
}
//# sourceMappingURL=10_retryLoop.js.map