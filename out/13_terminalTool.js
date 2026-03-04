"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = runCommand;
const child_process_1 = require("child_process");
function runCommand(cmd, cwd) {
    return new Promise(resolve => {
        (0, child_process_1.exec)(cmd, { cwd }, (err, stdout, stderr) => {
            resolve({ err, stdout, stderr });
        });
    });
}
//# sourceMappingURL=13_terminalTool.js.map