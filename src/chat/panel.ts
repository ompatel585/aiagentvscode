import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'om-ai-chat-view';

    private _view?: vscode.WebviewView;
    private _onMessage?: (msg: string) => void;

    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'prompt' && this._onMessage) {
                this._onMessage(msg.text);
            }
            if (msg.type === 'clearHistory') {
                // Just acknowledged — history lives in webview state
            }
        });
    }

    public onMessage(cb: (msg: string) => void) {
        this._onMessage = cb;
    }

    /** Log a status line (assistant bubble, grey style) */
    public postLog(text: string) {
        this._post({ type: 'log', text });
    }

    /** Post a full AI reply (assistant bubble, normal style) */
    public postMessage(text: string) {
        this._post({ type: 'assistant', text });
    }

    private _post(payload: object) {
        if (!this._view) return;
        this._view.webview.postMessage(payload);
    }

    private getHtml() {
        return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
:root {
    --bg:           var(--vscode-sideBar-background);
    --border:       var(--vscode-editorWidget-border);
    --text:         var(--vscode-editor-foreground);
    --text-muted:   var(--vscode-descriptionForeground);
    --input-bg:     var(--vscode-input-background);
    --input-border: var(--vscode-input-border);
    --btn-bg:       var(--vscode-button-background);
    --btn-hover:    var(--vscode-button-hoverBackground);
    --btn-text:     var(--vscode-button-foreground);
    --log-bg:       var(--vscode-editor-inactiveSelectionBackground);
    --user-bg:      var(--vscode-button-background);
    --radius:       8px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--vscode-font-family);
    font-size: 13px;
    display: flex;
    flex-direction: column;
}

/* ── toolbar ── */
#toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    gap: 4px;
}
#toolbar span { font-size: 11px; color: var(--text-muted); }
#clearBtn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 11px;
}
#clearBtn:hover { color: var(--text); border-color: var(--text-muted); }

/* ── chat area ── */
#chat {
    flex: 1;
    overflow-y: auto;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.message {
    max-width: 92%;
    padding: 7px 11px;
    border-radius: var(--radius);
    line-height: 1.45;
    word-wrap: break-word;
    white-space: pre-wrap;
}
.user {
    align-self: flex-end;
    background: var(--user-bg);
    color: var(--btn-text);
    border-bottom-right-radius: 2px;
}
.assistant {
    align-self: flex-start;
    background: var(--log-bg);
    border-bottom-left-radius: 2px;
}
.log {
    align-self: flex-start;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    padding: 2px 4px;
}

/* ── slash hints ── */
#hints {
    display: none;
    flex-direction: column;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 0 8px 4px;
    overflow: hidden;
}
.hint-item {
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    gap: 8px;
}
.hint-item:hover { background: var(--log-bg); }
.hint-cmd  { color: var(--btn-bg); font-weight: 600; min-width: 70px; }
.hint-desc { color: var(--text-muted); }

/* ── composer ── */
#composer {
    border-top: 1px solid var(--border);
    padding: 8px;
    display: flex;
    gap: 6px;
    align-items: flex-end;
}
textarea {
    flex: 1;
    resize: none;
    background: var(--input-bg);
    color: var(--text);
    border: 1px solid var(--input-border);
    border-radius: 6px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 13px;
    min-height: 38px;
    max-height: 120px;
}
textarea:focus { outline: none; border-color: var(--vscode-focusBorder); }
button {
    background: var(--btn-bg);
    color: var(--btn-text);
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
    white-space: nowrap;
}
button:hover { background: var(--btn-hover); }
</style>
</head>

<body>

<div id="toolbar">
    <span>Om AI Chat</span>
    <button id="clearBtn" onclick="clearHistory()">Clear</button>
</div>

<div id="chat"></div>

<div id="hints">
    <div class="hint-item" onclick="fillSlash('/explain')">
        <span class="hint-cmd">/explain</span>
        <span class="hint-desc">Explain selected code</span>
    </div>
    <div class="hint-item" onclick="fillSlash('/fix')">
        <span class="hint-cmd">/fix</span>
        <span class="hint-desc">Fix selected code or describe the issue</span>
    </div>
    <div class="hint-item" onclick="fillSlash('/doc')">
        <span class="hint-cmd">/doc</span>
        <span class="hint-desc">Generate JSDoc for selected code</span>
    </div>
    <div class="hint-item" onclick="fillSlash('/test')">
        <span class="hint-cmd">/test</span>
        <span class="hint-desc">Generate unit tests for selected code</span>
    </div>
    <div class="hint-item" onclick="fillSlash('/commit')">
        <span class="hint-cmd">/commit</span>
        <span class="hint-desc">Generate commit message for staged changes</span>
    </div>
</div>

<div id="composer">
    <textarea id="input" rows="2" placeholder="Ask anything… or type / for commands"></textarea>
    <button onclick="send()">Send</button>
</div>

<script>
const vscode = acquireVsCodeApi();
const chat   = document.getElementById('chat');
const hints  = document.getElementById('hints');
const input  = document.getElementById('input');

// ── restore persisted history ────────────────────────────────────
const state = vscode.getState() ?? { messages: [] };

state.messages.forEach(m => renderMessage(m.text, m.role));

// ── slash hints ──────────────────────────────────────────────────
input.addEventListener('input', () => {
    const val = input.value;
    hints.style.display = val === '/' || val.startsWith('/') && !val.includes(' ') ? 'flex' : 'none';
    // auto-grow
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

function fillSlash(cmd) {
    input.value = cmd + ' ';
    hints.style.display = 'none';
    input.focus();
}

// ── send ─────────────────────────────────────────────────────────
function send() {
    hints.style.display = 'none';
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    vscode.postMessage({ type: 'prompt', text });
    input.value = '';
    input.style.height = 'auto';
}

// ── clear history ─────────────────────────────────────────────────
function clearHistory() {
    chat.innerHTML = '';
    vscode.setState({ messages: [] });
}

// ── render ────────────────────────────────────────────────────────
function addMessage(text, role) {
    renderMessage(text, role);
    const s = vscode.getState() ?? { messages: [] };
    s.messages.push({ text, role });
    // cap history at 100 messages
    if (s.messages.length > 100) s.messages.shift();
    vscode.setState(s);
}

function renderMessage(text, role) {
    const div = document.createElement('div');
    div.className = 'message ' + role;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

// ── receive from extension ───────────────────────────────────────
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'assistant') {
        addMessage(msg.text, 'assistant');
    } else if (msg.type === 'log') {
        addMessage(msg.text, 'log');
    }
});
</script>

</body>
</html>
`;
    }
}

