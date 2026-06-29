# Deploying Ghost on Railway

This repo ships a single Ghost service to Railway using the root [`Dockerfile`](./Dockerfile)
and [`railway.json`](./railway.json). It does **not** replace the existing CI build
(`Dockerfile.production`), which is still built from the packed `ghost/core/package/`
context by GitHub Actions.

## Build approach

`Dockerfile.production` cannot be built from the repo root: its Docker context is the
*packed* output of `bun run --filter ghost archive` (the `ghost/core/package/` directory).
Railway builds a Dockerfile with the git repo root as the context, so the root `Dockerfile`
runs that archive itself:

1. **builder** stage — `bun install --frozen-lockfile`, then `bun run build:production`
   (server tsc + public assets + admin) and `bun run --filter ghost archive`
   (`scripts/pack.js`), producing `/src/ghost/core/package/`.
2. **core** stage — server + production deps only (no admin), faithfully reproducing
   `Dockerfile.production`'s `core` target but copying from the builder instead of an
   external context.
3. **full** stage — `core` + the built admin (`core/built/admin`). This is the last
   (default) stage, so `docker build .` and Railway both produce the **full** image.

There are no secret or URL build args — every runtime value is supplied as ENV at
container start (see below).

### Submodules

The default themes (`ghost/core/content/themes/casper` and `.../source`) are git
submodules. Railway must check them out at build time (enable submodule fetching for the
service / connected repo), otherwise the image ships without a default theme and Ghost
fails to boot. Locally, ensure `git submodule update --init --recursive` has run before
`docker build`.

## Service networking — target port 2368

Ghost binds `server.host` / `server.port` from its config and **ignores Railway's injected
`$PORT`**. The image `EXPOSE`s `2368` and the `CMD` is `bun index.js` (do **not** set a
Railway start command). Configure the service so the public proxy targets **2368**, and
make Ghost listen on all interfaces:

```
server__host=0.0.0.0
server__port=2368
```

In Railway, set the HTTP service's target port to `2368` (Networking settings), or set
`PORT=2368` so the proxy routes to 2368. Either way Ghost itself is driven by
`server__port=2368`.

## Healthcheck

`railway.json` uses `healthcheckPath: /ghost/api/admin/site/` — the public, unauthenticated
Admin API endpoint that returns site metadata once Ghost has booted. `healthcheckTimeout`
is 300s to cover migrations on first boot; restart policy is `ON_FAILURE`.

## Runtime configuration (ENV)

All config is Ghost's standard double-underscore env mapping. Set these as Railway service
variables (the lead holds the full list / values):

- **URLs**: `url`, `admin__url`
- **Server**: `server__host=0.0.0.0`, `server__port=2368`
- **Database** (MySQL): `database__client=mysql`, `database__connection__host`,
  `database__connection__port`, `database__connection__user`,
  `database__connection__password`, `database__connection__database`
- **Mail**: `mail__transport`, `mail__options__*` (e.g. SMTP / Mailgun)
- **Storage**: `storage__active`, `storage__<adapter>__*` (e.g. S3-compatible)
- **Headless / staff auth (OIDC)**: `headless__*`, `staffAuth__oauth__*`
- **Logging**: `logging__transports__0=stdout` (so logs reach Railway)

Persist `content/` (uploads, themes, settings, SQLite if used) on a Railway volume mounted
at `/home/ghost/content` if you are not using external object storage.
