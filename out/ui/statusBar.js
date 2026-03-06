"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatusBar = createStatusBar;
exports.setState = setState;
const vscode = __importStar(require("vscode"));
let _bar;
function createStatusBar(context) {
    _bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    _bar.command = 'om-ai.openChat';
    context.subscriptions.push(_bar);
    setState('idle');
    _bar.show();
}
function setState(state, detail) {
    if (!_bar)
        return;
    const labels = {
        idle: '$(sparkle) Om AI',
        thinking: '$(loading~spin) Om AI: Thinking…',
        patching: '$(edit) Om AI: Patching…',
        done: '$(check) Om AI: Done',
        error: '$(error) Om AI: Error',
    };
    _bar.text = labels[state];
    _bar.tooltip = detail ?? 'Om AI Pro';
    // Auto-reset non-idle states after 4 s
    if (state === 'done' || state === 'error') {
        setTimeout(() => setState('idle'), 4000);
    }
}
//# sourceMappingURL=statusBar.js.map