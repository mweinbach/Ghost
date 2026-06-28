#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/Ghost

git submodule update --init --recursive

bun install --prefer-offline

# Build workspace packages that ghost/core imports at runtime with build
# outputs (not source). @tryghost/parse-email-address is the only one today
# — its package.json "main" points at build/index.js, so the backend can't
# import it on a fresh clone until it's compiled.
# On host, `bun run dev` triggers this via Nx dependsOn cascades; inside the
# devcontainer we invoke `bun run --filter ghost dev` directly, which bypasses
# those cascades.
# Frontend apps (admin, posts, stats, activitypub, etc.) do NOT need
# pre-building here — their own dev targets handle it when start-dev-stack.sh
# runs `nx run-many -t dev`.
bun run --filter @tryghost/parse-email-address build
