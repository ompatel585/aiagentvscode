import { runCommand } from './13_terminalTool';

export async function runTests(root: string) {
    await runCommand('npm test --silent', root);
}