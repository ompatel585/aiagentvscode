"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
class ChatViewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView, _context, _token) {
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
    onMessage(cb) {
        this._onMessage = cb;
    }
    getHtml() {
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
exports.ChatViewProvider = ChatViewProvider;
ChatViewProvider.viewType = 'om-ai-chat-view';
//# sourceMappingURL=panel.js.map