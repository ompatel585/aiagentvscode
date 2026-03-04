const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, "index.txt");

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build"]);
const IGNORE_FILES = new Set([".env", "index.txt"]);

function walk(dir, fileList = []) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.has(item)) {
                walk(fullPath, fileList);
            }
        } else {
            if (!IGNORE_FILES.has(item)) {
                fileList.push(fullPath);
            }
        }
    }

    return fileList;
}

function buildIndex() {
    const files = walk(ROOT_DIR);

    let output = "";

    for (const file of files) {
        const relative = path.relative(ROOT_DIR, file);
        const content = fs.readFileSync(file, "utf8");

        output += `\n\n===== FILE: ${relative} =====\n\n`;
        output += content;
    }

    fs.writeFileSync(OUTPUT_FILE, output);
    console.log(`Indexed ${files.length} files into index.txt`);
}

buildIndex();