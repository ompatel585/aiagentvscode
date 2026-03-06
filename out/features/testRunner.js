"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = runTests;
const terminalTool_1 = require("./terminalTool");
async function runTests(root) {
    await (0, terminalTool_1.runCommand)('npm test --silent', root);
}
//# sourceMappingURL=testRunner.js.map