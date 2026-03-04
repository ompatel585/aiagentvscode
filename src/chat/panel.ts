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

        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.type === "prompt" && this._onMessage) {
                this._onMessage(msg.text);
            }
        });
    }

    public onMessage(cb: (msg: string) => void) {
        this._onMessage = cb;
    }

    public postLog(text: string) {
        if (!this._view) return;
        this._view.webview.postMessage({
            type: "assistant",
            text
        });
    }

    private getHtml() {
return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>

:root{
    --bg: var(--vscode-sideBar-background);
    --border: var(--vscode-editorWidget-border);
    --text: var(--vscode-editor-foreground);
    --input-bg: var(--vscode-input-background);
    --input-border: var(--vscode-input-border);
    --button-bg: var(--vscode-button-background);
    --button-hover: var(--vscode-button-hoverBackground);
    --button-text: var(--vscode-button-foreground);
}

html, body{
    margin:0;
    padding:0;
    height:100%;
    background:var(--bg);
    color:var(--text);
    font-family: var(--vscode-font-family);
    display:flex;
    flex-direction:column;
}

#chat{
    flex:1;
    overflow-y:auto;
    padding:10px;
    display:flex;
    flex-direction:column;
    gap:8px;
}

.message{
    max-width:90%;
    padding:8px 12px;
    border-radius:8px;
    line-height:1.4;
    font-size:13px;
    word-wrap:break-word;
}

.user{
    align-self:flex-end;
    background:var(--vscode-button-background);
    color:var(--button-text);
}

.assistant{
    align-self:flex-start;
    background:var(--vscode-editor-inactiveSelectionBackground);
}

#composer{
    border-top:1px solid var(--border);
    padding:8px;
    display:flex;
    gap:6px;
}

textarea{
    flex:1;
    resize:none;
    background:var(--input-bg);
    color:var(--text);
    border:1px solid var(--input-border);
    border-radius:6px;
    padding:6px 8px;
    font-family:inherit;
    font-size:13px;
}

textarea:focus{
    outline:none;
    border-color:var(--vscode-focusBorder);
}

button{
    background:var(--button-bg);
    color:var(--button-text);
    border:none;
    border-radius:6px;
    padding:6px 12px;
    cursor:pointer;
}

button:hover{
    background:var(--button-hover);
}

</style>
</head>

<body>

<div id="chat"></div>

<div id="composer">
<textarea id="input" rows="2" placeholder="Ask something..."></textarea>
<button onclick="send()">Send</button>
</div>

<script>
const vscode = acquireVsCodeApi();
const chat = document.getElementById("chat");

function addMessage(text, role){
    const div = document.createElement("div");
    div.className = "message " + role;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function send(){
    const input = document.getElementById("input");
    const text = input.value.trim();
    if(!text) return;

    addMessage(text,"user");

    vscode.postMessage({
        type:"prompt",
        text
    });

    input.value="";
}

window.addEventListener("message",event=>{
    const msg = event.data;
    if(msg.type==="assistant"){
        addMessage(msg.text,"assistant");
    }
});
</script>

</body>
</html>
`;
}
}