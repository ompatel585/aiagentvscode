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
        const { rows, additions, deletions } = buildSideBySideRows(original.split('\n'), updated.split('\n'));
        totalAdditions += additions;
        totalDeletions += deletions;
        // Render rows into two separate column HTML strings
        let leftHtml = '';
        let rightHtml = '';
        for (const row of rows) {
            // LEFT column
            if (row.left) {
                const cls = row.left.type === 'del' ? 'removed' : '';
                leftHtml += `<div class="line ${cls}">` +
                    `<span class="line-num">${row.left.no}</span>` +
                    `<span class="line-code">${escapeHtml(row.left.text)}</span>` +
                    `</div>`;
            }
            else {
                leftHtml += `<div class="line empty"><span class="line-num"></span><span class="line-code"></span></div>`;
            }
            // RIGHT column
            if (row.right) {
                const cls = row.right.type === 'add' ? 'added' : '';
                rightHtml += `<div class="line ${cls}">` +
                    `<span class="line-num">${row.right.no}</span>` +
                    `<span class="line-code">${escapeHtml(row.right.text)}</span>` +
                    `</div>`;
            }
            else {
                rightHtml += `<div class="line empty"><span class="line-num"></span><span class="line-code"></span></div>`;
            }
        }
        diffContent += `
        <div class="diff-file">
            <div class="file-header">
                <span class="file-path" onclick="openFile('${escapeHtml(fullPath)}')" title="Click to open file">${patch.path}</span>
                <span class="file-stats">
                    <span class="stat-add">+${additions}</span>
                    <span class="stat-del">-${deletions}</span>
                </span>
            </div>
            <div class="diff-columns">
                <div class="diff-col">
                    <div class="col-header">Original <span class="col-path">a/${patch.path}</span></div>
                    <div class="col-body">${leftHtml}</div>
                </div>
                <div class="col-divider"></div>
                <div class="diff-col">
                    <div class="col-header">Modified <span class="col-path">b/${patch.path}</span></div>
                    <div class="col-body">${rightHtml}</div>
                </div>
            </div>
        </div>`;
    }
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
:root {
    --bg:         #0d1117;
    --header-bg:  #161b22;
    --border:     #30363d;
    --text:       #c9d1d9;
    --muted:      #6e7681;
    --add-bg:     rgba(46,160,67,.18);
    --add-text:   #3fb950;
    --del-bg:     rgba(248,81,73,.18);
    --del-text:   #f85149;
    --empty-bg:   rgba(255,255,255,.02);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    margin: 0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* ── toolbar ── */
.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 12px;
}
.toolbar-left { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.toolbar-right { display: flex; gap: 8px; }

.badge { font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
.badge-add { background: rgba(46,160,67,.2); color: var(--add-text); }
.badge-del { background: rgba(248,81,73,.2); color: var(--del-text); }

button {
    padding: 6px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
}
.btn-apply  { background: #238636; color: #fff; }
.btn-apply:hover { background: #2ea043; }
.btn-cancel { background: #30363d; color: var(--text); }
.btn-cancel:hover { background: #3d444d; }

/* ── scroll area ── */
.scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}

/* ── per-file diff ── */
.diff-file { border-bottom: 2px solid var(--border); }

.file-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
}
.file-path {
    font-family: monospace;
    color: #58a6ff;
    cursor: pointer;
}
.file-path:hover { text-decoration: underline; }
.file-stats { display: flex; gap: 8px; }
.stat-add { color: var(--add-text); font-weight: 600; }
.stat-del { color: var(--del-text); font-weight: 600; }

/* ── two columns ── */
.diff-columns {
    display: flex;
    width: 100%;
    overflow-x: auto;          /* horizontal scroll if lines are long */
}

.diff-col {
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.col-divider {
    width: 1px;
    background: var(--border);
    flex-shrink: 0;
}

.col-header {
    padding: 5px 10px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
}
.col-path { font-family: monospace; margin-left: 6px; color: var(--muted); }

/* ── diff lines ── */
.col-body { overflow-x: auto; }    /* each column scrolls independently */

.line {
    display: flex;
    align-items: stretch;
    min-height: 20px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 12px;
    line-height: 20px;
}
.line.added   { background: var(--add-bg); }
.line.removed { background: var(--del-bg); }
.line.empty   { background: var(--empty-bg); }

.line-num {
    width: 52px;
    min-width: 52px;
    text-align: right;
    padding: 0 8px 0 4px;
    color: var(--muted);
    background: rgba(0,0,0,.2);
    user-select: none;
    border-right: 1px solid var(--border);
    font-size: 11px;
}
.line-code {
    flex: 1;
    padding: 0 10px;
    white-space: pre;          /* no wrapping — horizontal scroll handles long lines */
    overflow: visible;
}
</style>
</head>
<body>

<div class="toolbar">
    <div class="toolbar-left">
        <strong>${patches.length} file(s) changed</strong>
        <span class="badge badge-add">+${totalAdditions}</span>
        <span class="badge badge-del">-${totalDeletions}</span>
    </div>
    <div class="toolbar-right">
        <button class="btn-cancel" onclick="cancel()">Reject</button>
        <button class="btn-apply"  onclick="apply()">Apply Patch</button>
    </div>
</div>

<div class="scroll-area">
${diffContent}
</div>

<script>
const vscode = acquireVsCodeApi();
function apply()    { vscode.postMessage({ type: 'apply' }); }
function cancel()   { vscode.postMessage({ type: 'cancel' }); }
function openFile(p){ vscode.postMessage({ type: 'openFile', path: p }); }
</script>
</body>
</html>`;
}
function computeLcsDiff(a, b) {
    const m = a.length, n = b.length;
    // Build LCS table
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    // Backtrack
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            result.unshift({ type: 'same', value: a[i - 1] });
            i--;
            j--;
        }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'add', value: b[j - 1] });
            j--;
        }
        else {
            result.unshift({ type: 'del', value: a[i - 1] });
            i--;
        }
    }
    return result;
}
function buildSideBySideRows(oldLines, newLines) {
    const diff = computeLcsDiff(oldLines, newLines);
    const rows = [];
    let additions = 0, deletions = 0;
    let oldNo = 1, newNo = 1;
    let di = 0;
    while (di < diff.length) {
        const item = diff[di];
        if (item.type === 'same') {
            rows.push({
                left: { no: oldNo++, text: item.value, type: 'same' },
                right: { no: newNo++, text: item.value, type: 'same' }
            });
            di++;
        }
        else if (item.type === 'del' && diff[di + 1]?.type === 'add') {
            // Paired replace — show side-by-side on same row
            rows.push({
                left: { no: oldNo++, text: item.value, type: 'del' },
                right: { no: newNo++, text: diff[di + 1].value, type: 'add' }
            });
            deletions++;
            additions++;
            di += 2;
        }
        else if (item.type === 'del') {
            rows.push({ left: { no: oldNo++, text: item.value, type: 'del' }, right: null });
            deletions++;
            di++;
        }
        else { // add
            rows.push({ left: null, right: { no: newNo++, text: item.value, type: 'add' } });
            additions++;
            di++;
        }
    }
    return { rows, additions, deletions };
}
function escapeHtml(t) {
    return t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
// ── Virtual patch application (bottom-up) ───────────────────────────────────
function applyVirtualPatch(original, patch) {
    let lines = original.split('\n');
    // Apply edits bottom-up to avoid offset drift
    const edits = [...patch.edits].sort((a, b) => b.startLine - a.startLine);
    for (const e of edits) {
        const start = Math.max(0, e.startLine);
        const end = Math.min(lines.length, e.endLine);
        const newLines = e.newText === '' ? [] : e.newText.split('\n');
        lines.splice(start, end - start, ...newLines);
    }
    return lines.join('\n');
}
// ── Direct patch apply (write to disk) ──────────────────────────────────────
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