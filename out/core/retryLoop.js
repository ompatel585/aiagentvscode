"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWithRetry = runWithRetry;
const client_1 = require("./client");
async function runWithRetry(payload) {
    for (let i = 0; i < 3; i++) {
        const res = await (0, client_1.callBrain)(payload);
        console.log("RAW AI RESPONSE:");
        console.log(res);
        if (res.success && Array.isArray(res.changes) && res.changes.length) {
            return res;
        }
        payload.instruction += "\nReturn valid JSON with changes array.";
    }
    return { success: false, changes: [] };
}
//# sourceMappingURL=retryLoop.js.map