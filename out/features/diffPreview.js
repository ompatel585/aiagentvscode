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
exports.showDiffPreview = showDiffPreview;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function showDiffPreview(patches, root) {
    const panel = vscode.window.createWebviewPanel('om-ai-diff-view', 'AI Code Changes', vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    panel.webview.html = generateSideBySideDiff(patches, root);
    return new Promise((resolve) => {
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'apply') {
                await applyPatches(patches, root);
                resolve(true);
                panel.dispose();
            }
            if (msg.type === 'cancel') {
                resolve(false);
                panel.dispose();
            }
            if (msg.type === 'openFile') {
                const doc = await vscode.workspace.openTextDocument(msg.path);
                vscode.window.showTextDocument(doc);
            }
        });
        panel.onDidDispose(() => resolve(false));
    });
}
function generateSideBySideDiff(patches, root) {
    let diffContent = '';
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const patch of patches) {
        const fullPath = path.join(root, patch.path);
        let original = '';
        if (fs.existsSync(fullPath)) {
            original = fs.readFileSync(fullPath, 'utf8');
        }
        const updated = applyVirtualPatch(original, patch);
        const { left, right, additions, deletions } = generateSideBySideHtml(original.split('\n'), updated.split('\n'));
        totalAdditions += additions;
        totalDeletions += deletions;
        diffContent += `
        <div class="diff-file">
            <div class="file-header">
                <div class="file-info">
                    <span class="file-path">${patch.path}</span>
                    <span class="file-stats">
                        <span class="stat-add">+${additions}</span>
                        <span class="stat-del">-${deletions}</span>
                    </span>
                </div>
            </div>

            <div class="diff-container">
                <div class="diff-side old">
                    <div class="side-header">
                        <span class="side-label">Old Version</span>
                        <span class="side-path">a/${patch.path}</span>
                    </div>
                    <div class="side-content">${left}</div>
                </div>

                <div class="diff-side new">
                    <div class="side-header">
                        <span class="side-label">New Version</span>
                        <span class="side-path">b/${patch.path}</span>
                    </div>
                    <div class="side-content">${right}</div>
                </div>
            </div>
        </div>
        `;
    }
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<style>

:root{
--bg:#0d1117;
--header-bg:#161b22;
--border:#30363d;
--text:#c9d1d9;
--add:#3fb950;
--del:#f85149;
}

body{
margin:0;
font-family:Segoe UI, sans-serif;
background:var(--bg);
color:var(--text);
}

.toolbar{
display:flex;
justify-content:space-between;
padding:12px 20px;
background:var(--header-bg);
border-bottom:1px solid var(--border);
}

button{
padding:6px 14px;
border-radius:6px;
border:none;
cursor:pointer;
}

.apply{background:#238636;color:white}
.cancel{background:#30363d;color:white}

.diff-scroll{
height:calc(100vh - 55px);
overflow:auto;
}

.diff-container{
display:flex;
}

.diff-side{
width:50%;
border-right:1px solid var(--border);
font-family:monospace;
font-size:12px;
}

.diff-side:last-child{
border-right:none;
}

.line{
display:flex;
}

.line-num{
width:50px;
text-align:right;
padding-right:8px;
color:#6e7681;
background:#161b22;
}

.line-code{
flex:1;
padding-left:10px;
white-space:pre;
}

.added{background:rgba(46,160,67,.15)}
.removed{background:rgba(248,81,73,.15)}

</style>
</head>

<body>

<div class="toolbar">
<div>
${patches.length} file(s) • 
<span style="color:var(--add)">+${totalAdditions}</span> 
<span style="color:var(--del)">-${totalDeletions}</span>
</div>

<div>
<button class="cancel" onclick="cancel()">Cancel</button>
<button class="apply" onclick="apply()">Accept</button>
</div>
</div>

<div class="diff-scroll">
${diffContent}
</div>

<script>

const vscode = acquireVsCodeApi()

function apply(){
vscode.postMessage({type:'apply'})
}

function cancel(){
vscode.postMessage({type:'cancel'})
}

</script>

</body>
</html>
`;
}
function generateSideBySideHtml(oldLines, newLines) {
    const diff = computeDiff(oldLines, newLines);
    let left = '';
    let right = '';
    let additions = 0;
    let deletions = 0;
    let oldLine = 1;
    let newLine = 1;
    for (const item of diff) {
        if (item.type === 'same') {
            left += createLine(oldLine++, item.value);
            right += createLine(newLine++, item.value);
        }
        if (item.type === 'del') {
            left += createLine(oldLine++, item.value, 'removed');
            right += createLine('', '');
            deletions++;
        }
        if (item.type === 'add') {
            left += createLine('', '');
            right += createLine(newLine++, item.value, 'added');
            additions++;
        }
    }
    return { left, right, additions, deletions };
}
function computeDiff(a, b) {
    const res = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
        if (i >= a.length) {
            res.push({ type: 'add', value: b[j++] });
        }
        else if (j >= b.length) {
            res.push({ type: 'del', value: a[i++] });
        }
        else if (a[i] === b[j]) {
            res.push({ type: 'same', value: a[i] });
            i++;
            j++;
        }
        else {
            res.push({ type: 'del', value: a[i++] });
            res.push({ type: 'add', value: b[j++] });
        }
    }
    return res;
}
function createLine(num, text, type = '') {
    return `<div class="line ${type}">
<span class="line-num">${num || ''}</span>
<span class="line-code">${escapeHtml(text)}</span>
</div>`;
}
function escapeHtml(t) {
    return t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function applyVirtualPatch(original, patch) {
    let lines = original.split('\n');
    const edits = [...patch.edits].sort((a, b) => b.startLine - a.startLine);
    for (const e of edits) {
        const repl = e.newText.split('\n');
        lines.splice(e.startLine, e.endLine - e.startLine, ...repl);
    }
    return lines.join('\n');
}
async function applyPatches(patches, root) {
    for (const patch of patches) {
        const full = path.join(root, patch.path);
        if (!fs.existsSync(full))
            continue;
        const original = fs.readFileSync(full, 'utf8');
        const updated = applyVirtualPatch(original, patch);
        fs.writeFileSync(full, updated, 'utf8');
    }
}
//# sourceMappingURL=diffPreview.js.map