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
exports.applyAstSafePatches = applyAstSafePatches;
const ts = __importStar(require("typescript"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function applyAstSafePatches(patches, root) {
    for (const patch of patches) {
        const fullPath = path.join(root, patch.path);
        if (!fs.existsSync(fullPath))
            continue;
        const original = fs.readFileSync(fullPath, 'utf-8');
        let updated = original;
        for (const edit of patch.edits) {
            const lines = updated.split('\n');
            lines.splice(edit.startLine, edit.endLine - edit.startLine, edit.newText);
            updated = lines.join('\n');
        }
        const check = ts.createSourceFile(patch.path, updated, ts.ScriptTarget.Latest, true);
        const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram({
            rootNames: [patch.path],
            options: {}
        }));
        if (diagnostics.length === 0) {
            fs.writeFileSync(fullPath, updated);
        }
    }
}
//# sourceMappingURL=11_astPatcher.js.map