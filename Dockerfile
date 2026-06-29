# syntax=docker/dockerfile:1

# Root-level Railway Dockerfile for Ghost (single self-hosting service).
#
# Runs Ghost directly from the built monorepo source (the same way `bun run dev`
# runs it), rather than the Ghost-CLI archive that Dockerfile.production produces.
# The archive path (ghost/core/scripts/pack.js) has several latent bugs on a
# clean from-scratch build (bun `pm pack --filename` is a no-op in 1.3.14, and it
# mis-resolves `workspace:*` deps to npm 404s), so we skip it. The trade-off is a
# larger image (full monorepo node_modules) for a robust, deterministic build.
#
# All runtime configuration is supplied as ENV at container start (see
# RAILWAY-DEPLOY.md): url/admin__url, server__*, database__*, mail__*, storage__*,
# headless__*, staffAuth__oauth__*, logging__transports__0=stdout. Ghost binds
# server.port (2368) and ignores Railway's $PORT, so target port 2368 with
# server__host=0.0.0.0.

ARG NODE_VERSION=22.18.0
ARG BUN_VERSION=1.3.14

FROM node:${NODE_VERSION}-bookworm-slim
ARG BUN_VERSION
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Toolchain: build-essential/python3 for native modules (sqlite3, etc.), git for
# the theme clone below + git-based deps, unzip for the bun installer, and the
# Ghost runtime libs (jemalloc, fontconfig). bun is pinned to the repo version.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential python3 git curl ca-certificates unzip libjemalloc2 fontconfig && \
    curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Whole monorepo (the root .dockerignore strips node_modules, build/dist, .git).
COPY . .

# The casper/source themes are git submodules. Railway's Dockerfile build does
# not init submodules, so vendor the pinned theme versions when the checkout is
# empty (no-op when present) — Ghost needs a default theme to boot.
RUN if [ ! -f ghost/core/content/themes/casper/package.json ]; then \
        rm -rf ghost/core/content/themes/casper && \
        git clone --depth 1 --branch v5.12.1 https://github.com/TryGhost/Casper.git ghost/core/content/themes/casper && \
        rm -rf ghost/core/content/themes/casper/.git; \
    fi && \
    if [ ! -f ghost/core/content/themes/source/package.json ]; then \
        rm -rf ghost/core/content/themes/source && \
        git clone --depth 1 --branch v1.7.1 https://github.com/TryGhost/Source.git ghost/core/content/themes/source && \
        rm -rf ghost/core/content/themes/source/.git; \
    fi

# Install ALL deps (dev included — the admin build needs them) with the hoisted
# layout so the admin's postcss/vite configs can resolve transitive build deps
# like postcss-import. NODE_ENV=development guarantees devDependencies install.
# Then build the server (tsc), public assets, and the admin SPA — the admin
# target emits ghost/core/core/built/admin, which Ghost serves in production.
RUN NODE_ENV=development bun install --frozen-lockfile --linker=hoisted && \
    bun run build:production

# Runtime: Ghost boots from ghost/core (its index.js), resolving workspace and
# hoisted deps from the monorepo node_modules.
ENV NODE_ENV=production
ENV LD_PRELOAD=libjemalloc.so.2
WORKDIR /src/ghost/core
EXPOSE 2368
CMD ["bun", "index.js"]
