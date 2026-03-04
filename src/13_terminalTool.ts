import { exec } from 'child_process';

export function runCommand(cmd: string, cwd: string) {

    return new Promise(resolve => {
        exec(cmd, { cwd }, (err, stdout, stderr) => {
            resolve({ err, stdout, stderr });
        });
    });
}