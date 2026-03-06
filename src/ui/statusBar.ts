import * as vscode from 'vscode';

type AIState = 'idle' | 'thinking' | 'patching' | 'done' | 'error';

let _bar: vscode.StatusBarItem | undefined;

export function createStatusBar(context: vscode.ExtensionContext): void {
    _bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    _bar.command = 'om-ai.openChat';
    context.subscriptions.push(_bar);
    setState('idle');
    _bar.show();
}

export function setState(state: AIState, detail?: string): void {
    if (!_bar) return;

    const labels: Record<AIState, string> = {
        idle:     '$(sparkle) Om AI',
        thinking: '$(loading~spin) Om AI: Thinking…',
        patching: '$(edit) Om AI: Patching…',
        done:     '$(check) Om AI: Done',
        error:    '$(error) Om AI: Error',
    };

    _bar.text = labels[state];
    _bar.tooltip = detail ?? 'Om AI Pro';

    // Auto-reset non-idle states after 4 s
    if (state === 'done' || state === 'error') {
        setTimeout(() => setState('idle'), 4000);
    }
}

