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

        webviewView.webview.onDidReceiveMessage(message => {
            if (this._onMessage) {
                this._onMessage(message.text);
            }
        });
    }

    public onMessage(cb: (msg: string) => void) {
        this._onMessage = cb;
    }

    private getHtml() {
        return `
        <!DOCTYPE html>
        <html>
        <body>
            <h3>Om AI Chat</h3>
            <textarea id="input" rows="6" style="width:100%"></textarea>
            <br/>
            <button onclick="send()">Send</button>

            <script>
                const vscode = acquireVsCodeApi();
                function send() {
                    const text = document.getElementById('input').value;
                    vscode.postMessage({ text });
                }
            </script>
        </body>
        </html>`;
    }
}