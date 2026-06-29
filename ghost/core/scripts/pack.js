#!/usr/bin/env node

/**
 * pack.js - Build a distributable Ghost tarball for Ghost-CLI.
 *
 * Produces ghost/core/ghost-<version>.tgz, the archive consumed by
 * `ghost install --archive` and `ghost update --archive` (Ghost-CLI). It is
 * not published to npm; it is the release artifact uploaded to GitHub.
 *
 * Uses Bun to pack Ghost core, resolves workspace/catalog dependency specs for
 * standalone installs, packs private workspace packages as component tarballs,
 * then creates a Ghost-CLI compatible tarball (package/ prefix, no node_modules).
 */

/* eslint-disable ghost/ghost-custom/no-native-error */

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const fsExtra = require('fs-extra');

const CORE_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(CORE_DIR, '../..');
const DEPLOY_DIR = path.join(CORE_DIR, 'package');
const DEPLOY_TARBALL = path.join(CORE_DIR, '.ghost-package.tgz');

const rootPkg = fsExtra.readJsonSync(path.join(ROOT_DIR, 'package.json'));
const rootWorkspaces = rootPkg.workspaces || {};
const rootCatalog = rootWorkspaces.catalog || {};
const rootCatalogs = rootWorkspaces.catalogs || {};

function workspacePatterns() {
    if (Array.isArray(rootWorkspaces)) {
        return rootWorkspaces;
    }
    return rootWorkspaces.packages || [];
}

function expandPattern(pattern) {
    const segments = pattern.split('/');
    let candidates = [''];

    for (const segment of segments) {
        const next = [];

        for (const base of candidates) {
            const dir = base ? path.join(ROOT_DIR, base) : ROOT_DIR;

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
                if (fs.existsSync(path.join(ROOT_DIR, candidate))) {
                    next.push(candidate);
                }
            }
        }

        candidates = next;
    }

    return candidates;
}

function loadWorkspacesByName() {
    const workspaces = new Map();

    for (const rel of workspacePatterns().flatMap(expandPattern)) {
        const packagePath = path.join(ROOT_DIR, rel, 'package.json');
        if (!fs.existsSync(packagePath)) {
            continue;
        }

        const pkg = fsExtra.readJsonSync(packagePath);
        if (pkg.name) {
            workspaces.set(pkg.name, path.join(ROOT_DIR, rel));
        }
    }

    return workspaces;
}

function resolveCatalogSpec(packageName, spec) {
    if (spec === 'catalog:') {
        const version = rootCatalog[packageName];
        if (!version) {
            throw new Error(`Missing default catalog version for ${packageName}`);
        }
        return version;
    }

    if (typeof spec === 'string' && spec.startsWith('catalog:')) {
        const catalogName = spec.slice('catalog:'.length);
        const version = rootCatalogs[catalogName]?.[packageName];
        if (!version) {
            throw new Error(`Missing ${catalogName} catalog version for ${packageName}`);
        }
        return version;
    }

    return spec;
}

function resolveDependencySpecs(pkg, packWorkspaceDependency) {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        if (!pkg[section]) {
            continue;
        }

        for (const [name, spec] of Object.entries(pkg[section])) {
            if (typeof spec === 'string' && spec.startsWith('workspace:')) {
                pkg[section][name] = packWorkspaceDependency(name);
            } else {
                pkg[section][name] = resolveCatalogSpec(name, spec);
            }
        }
    }
}

function resolveOverrides(overrides = {}) {
    return Object.fromEntries(
        Object.entries(overrides).map(([name, spec]) => [name, resolveCatalogSpec(name, spec)])
    );
}

function assertNoWorkspaceSpecs(pkg) {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, spec] of Object.entries(pkg[section] || {})) {
            if (typeof spec === 'string' && (spec.startsWith('workspace:') || spec.startsWith('catalog:'))) {
                throw new Error(`${section}.${name} still uses ${spec}`);
            }
        }
    }
}

console.log('Packing Ghost core with Bun...');
fs.rmSync(DEPLOY_DIR, {recursive: true, force: true});
fs.rmSync(DEPLOY_TARBALL, {force: true});
// `bun pm pack --filename` is a no-op in bun 1.3.14 (it prints the target name
// but writes no file), so let bun name the tarball and capture the path it
// prints — the same pattern used for the component packs below.
const mainPackOutput = execFileSync(
    'bun',
    ['pm', 'pack', '--ignore-scripts', '--quiet'],
    {cwd: CORE_DIR, encoding: 'utf8'}
).trim();
const mainTarball = mainPackOutput.split('\n').map(line => line.trim()).filter(Boolean).pop();
const mainTarballPath = path.join(CORE_DIR, mainTarball);
execFileSync('tar', ['xzf', mainTarballPath], {cwd: CORE_DIR, stdio: 'inherit'});
fs.rmSync(mainTarballPath, {force: true});

console.log('\nPost-processing package.json...');
const pkgPath = path.join(DEPLOY_DIR, 'package.json');
const pkg = fsExtra.readJsonSync(pkgPath);
const workspacesByName = loadWorkspacesByName();
const componentsDir = path.join(DEPLOY_DIR, 'components');
fs.mkdirSync(componentsDir, {recursive: true});

function packWorkspaceDependency(name) {
    const depDir = workspacesByName.get(name);
    if (!depDir) {
        throw new Error(`${name} is a workspace dependency but no matching workspace was found`);
    }

    console.log(`  Packing ${name} into components/`);
    const output = execFileSync(
        'bun',
        ['pm', 'pack', '--destination', componentsDir, '--ignore-scripts', '--quiet'],
        {cwd: depDir, encoding: 'utf8'}
    ).trim();
    const tgzPath = output.split('\n').map(line => line.trim()).filter(Boolean).pop();
    if (!tgzPath) {
        throw new Error(`Bun did not report a tarball path for ${name}`);
    }

    return `file:components/${path.basename(tgzPath)}`;
}

resolveDependencySpecs(pkg, packWorkspaceDependency);

if (!rootPkg.packageManager) {
    throw new Error('Root package.json is missing required "packageManager" field');
}
pkg.packageManager = rootPkg.packageManager;
pkg.overrides = resolveOverrides(rootPkg.overrides);
pkg.trustedDependencies = rootPkg.trustedDependencies;
console.log(`  Set packageManager: ${rootPkg.packageManager}`);

assertNoWorkspaceSpecs(pkg);
fsExtra.writeJsonSync(pkgPath, pkg, {spaces: 2});

// Disable minimumReleaseAge in the published tarball. The source repo gates
// fresh deps from entering the lockfile; the deployed package is itself a
// release artifact, and its component tarballs are local files.
fs.writeFileSync(path.join(DEPLOY_DIR, 'bunfig.toml'), '[install]\nminimumReleaseAge = 0\n');

console.log('\nRegenerating Bun lockfile against post-processed package.json...');
execFileSync(
    'bun',
    ['install', '--lockfile-only', '--ignore-scripts'],
    {cwd: DEPLOY_DIR, stdio: 'inherit'}
);

console.log('\nValidating deploy output...');
const packagedPkg = fsExtra.readJsonSync(pkgPath);
const requiredFiles = ['bun.lock', 'bunfig.toml', 'package.json'];
for (const rel of requiredFiles) {
    if (!fs.existsSync(path.join(DEPLOY_DIR, rel))) {
        throw new Error(`Required file missing from deploy output: ${rel}`);
    }
}
const componentTgzs = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tgz'));
if (componentTgzs.length === 0) {
    throw new Error('No component tarballs produced in components/');
}
if (!packagedPkg.packageManager) {
    throw new Error('Packaged package.json is missing packageManager');
}
if (!packagedPkg.overrides || Object.keys(packagedPkg.overrides).length === 0) {
    throw new Error('Packaged package.json is missing root overrides');
}
assertNoWorkspaceSpecs(packagedPkg);

const version = pkg.version;
const tgzPath = path.join(CORE_DIR, `ghost-${version}.tgz`);

fs.rmSync(path.join(DEPLOY_DIR, 'node_modules'), {recursive: true, force: true});

console.log(`\nCreating tarball: ghost-${version}.tgz`);
execFileSync(
    'tar',
    ['czf', tgzPath, 'package'],
    {cwd: CORE_DIR, stdio: 'inherit'}
);

const size = (fs.statSync(tgzPath).size / 1024 / 1024).toFixed(1);
console.log(`\nDone: ${tgzPath} (${size} MiB)`);
