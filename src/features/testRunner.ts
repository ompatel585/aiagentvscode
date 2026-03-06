import { runCommand } from './terminalTool';

export async function runTests(root: string) {
    await runCommand('npm test --silent', root);
}

