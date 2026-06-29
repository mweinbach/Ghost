# syntax=docker/dockerfile:1-labs@sha256:7d49dad25a050e14338ba7028b0460243f9d911dedc160a8fe20c34738fef3af

# Root-level Railway Dockerfile for Ghost (single self-hosting service).
#
# Unlike Dockerfile.production — whose build context is the *packed* output of
# `bun run --filter ghost archive` (ghost/core/package/) — this Dockerfile is
# built from the repository root, so it has to produce that packed output
# itself. Railway always builds a Dockerfile with the git repo root as the
# context, so the archive step must run inside the image.
#
# Stages:
#   builder — install the monorepo, build server (tsc) + public assets + admin,
#             then run the archive (scripts/pack.js) to produce the packed app
#             at /src/ghost/core/package/ (with node_modules stripped).
#   core    — server + production deps, no admin. Mirrors Dockerfile.production
#             `core`. Build with `--target core` if you ever want this variant.
#   full    — core + built admin. Mirrors Dockerfile.production `full`. This is
#             the default (last) stage and the one Railway deploys.
#
# Build locally:
#   docker build -t ghost .                  # -> full image (server + admin)
#   docker build --target core -t ghost .    # -> core image (server only)
#
# All runtime configuration is supplied as ENV at container start (see
# RAILWAY-DEPLOY.md). There are intentionally no secret/URL build args.

ARG NODE_VERSION=22.18.0
ARG BUN_VERSION=1.3.14

# ---- Builder: install monorepo, build assets + admin, run archive ----
FROM node:${NODE_VERSION}-bookworm-slim AS builder

ARG BUN_VERSION
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# node toolchain for native modules (sqlite3, re2, sharp…), git for any
# git-based deps, unzip for the bun installer, and bun pinned to the repo's
# packageManager version.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential python3 git curl ca-certificates unzip && \
    curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Copy the whole monorepo. The root .dockerignore strips node_modules, build/
# dist outputs, .git, and ghost/core/core/built/admin — all regenerated below —
# so admin + assets are always built fresh rather than trusting host artifacts.
COPY . .

# The casper/source themes are git submodules. Railway's Dockerfile build does
# not init submodules, so the checked-out dirs can be empty. Ghost needs a
# default theme to boot and the archive packs content/themes, so vendor the
# pinned theme versions when missing (no-op when the submodules are present).
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

# Install with the committed lockfile, mirroring CI. Force the hoisted (npm-like
# flat) node_modules layout so build-time deps that the admin's postcss/vite
# configs require transitively (e.g. postcss-import) resolve from any workspace
# package — the default linker leaves them unresolvable on a clean build.
RUN bun install --frozen-lockfile --linker=hoisted

# Mirror CI exactly: build server (tsc) + public assets + admin, then archive.
# `bun run --filter ghost archive` runs scripts/pack.js directly (not via nx),
# so the builds must happen first. The packed app lands in ghost/core/package/.
RUN bun run build:production && \
    bun run --filter ghost archive

# ---- Core: server + production deps (no admin) ----
FROM node:${NODE_VERSION}-bookworm-slim AS core

ARG BUN_VERSION
ENV NODE_ENV=production
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc2 fontconfig curl ca-certificates unzip && \
    curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
    rm -rf /var/lib/apt/lists/* && \
    groupmod -g 1001 node && \
    usermod -u 1001 node && \
    adduser --disabled-password --gecos "" -u 1000 ghost

WORKDIR /home/ghost

# Install production deps from the packed manifest first, for better layer
# caching. `components/` holds the private workspace deps as file: tarballs
# referenced by the packed package.json.
COPY --from=builder /src/ghost/core/package/package.json /src/ghost/core/package/bun.lock /src/ghost/core/package/bunfig.toml ./
COPY --from=builder /src/ghost/core/package/components ./components

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 && \
    bun install --ignore-scripts --production --prefer-offline --linker=hoisted && \
    (cd node_modules/sqlite3 && npm run install) && \
    apt-get purge -y build-essential python3 curl && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy the rest of the packed app (server, content, themes, index.js…) minus the
# built admin, which is added only in the `full` stage.
COPY --from=builder --exclude=core/built/admin /src/ghost/core/package/ ./

RUN mkdir -p default log && \
    cp -R content base_content && \
    cp -R content/themes/casper default/casper && \
    ([ -d content/themes/source ] && cp -R content/themes/source default/source || true) && \
    chown ghost:ghost /home/ghost && \
    chown -R nobody:nogroup /home/ghost/* && \
    chown -R ghost:ghost /home/ghost/content /home/ghost/log

ARG GHOST_BUILD_VERSION=""
ENV GHOST_BUILD_VERSION=${GHOST_BUILD_VERSION}

USER ghost
ENV LD_PRELOAD=libjemalloc.so.2

EXPOSE 2368

CMD ["bun", "index.js"]

# ---- Full: core + built admin (Railway deploys this) ----
FROM core AS full

USER root
COPY --from=builder /src/ghost/core/package/core/built/admin core/built/admin
RUN chown -R nobody:nogroup core/built/admin
USER ghost
