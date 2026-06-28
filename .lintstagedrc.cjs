const path = require('path');
const fs = require('fs');

const ROOT = process.cwd();

function normalize(p) {
    return p.split(path.sep).join('/');
}

function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function loadWorkspacePatterns() {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (Array.isArray(packageJson.workspaces)) {
        return packageJson.workspaces;
    }
    return packageJson.workspaces?.packages || [];
}

function expandPattern(pattern) {
    const segments = pattern.split('/');
    let candidates = [''];
    for (const segment of segments) {
        const next = [];
        for (const base of candidates) {
            const dir = base ? path.join(ROOT, base) : ROOT;
            if (segment === '*') {
                if (!fs.existsSync(dir)) {
                    continue;
                }
                for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
                    if (entry.isDirectory()) {
                        next.push(base ? `${base}/${entry.name}` : entry.name);
                    }
                }
            } else {
                const candidate = base ? `${base}/${segment}` : segment;
                if (fs.existsSync(path.join(ROOT, candidate))) {
                    next.push(candidate);
                }
            }
        }
        candidates = next;
    }
    return candidates;
}

const WORKSPACES = new Set(
    loadWorkspacePatterns().flatMap(expandPattern)
);

function findWorkspace(file) {
    let dir = path.dirname(path.resolve(file));
    while (dir.startsWith(ROOT) && dir !== ROOT) {
        const rel = normalize(path.relative(ROOT, dir));
        if (WORKSPACES.has(rel)) {
            return rel;
        }
        dir = path.dirname(dir);
    }
    return null;
}

function buildCommand(workspace, files) {
    const base = workspace ? path.join(ROOT, workspace) : ROOT;
    const relativeFiles = files
        .map(file => normalize(path.relative(base, file)))
        .map(shellQuote)
        .join(' ');
    const prefix = workspace ? `cd ${shellQuote(workspace)} && ` : '';
    return `${prefix}bunx --no-install eslint --cache -- ${relativeFiles}`;
}

module.exports = {
    '*.{js,ts,tsx,jsx,cjs}': (files) => {
        const groups = new Map();
        for (const file of files) {
            const workspace = findWorkspace(file);
            const key = workspace ?? '';
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(file);
        }
        return [...groups.entries()].map(([workspace, wsFiles]) =>
            buildCommand(workspace || null, wsFiles)
        );
    }
};
