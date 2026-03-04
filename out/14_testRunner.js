"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = runTests;
const _13_terminalTool_1 = require("./13_terminalTool");
async function runTests(root) {
    await (0, _13_terminalTool_1.runCommand)('npm test --silent', root);
}
//# sourceMappingURL=14_testRunner.js.map