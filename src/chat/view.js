const vscode = acquireVsCodeApi();

function send() {
    const text = document.getElementById('input').value;
    vscode.postMessage({ text });
}