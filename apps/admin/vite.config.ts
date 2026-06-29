import { resolve } from "path";
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import type { PluginOption } from "vite";
const require = createRequire(import.meta.url);
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

import { emberAssetsPlugin } from "./vite-ember-assets";
import { ghostBackendProxyPlugin } from "./vite-backend-proxy";

export const GHOST_URL = process.env.GHOST_URL ?? "http://localhost:2368/";
const GHOST_CARDS_PATH = resolve(__dirname, "../../ghost/core/core/frontend/src/cards");

// Dev-only prefix Vite serves under. Keeps Vite's internals (HMR client,
// module graph, refresh runtime) off `/ghost/*` so Ghost's Express middleware
// owns user-facing admin URLs in both dev and prod.
export const DEV_BASE = '/__admin-dev__';

/**
 * Extracts the subdirectory path from GHOST_URL.
 * e.g., "http://localhost:2368/blog/" -> "/blog"
 *       "http://localhost:2368/" -> ""
 */
export function getSubdir(): string {
    const url = new URL(GHOST_URL);
    return url.pathname.replace(/\/$/, '');
}

function getBase(command: 'build' | 'serve'): string {
    if (process.env.GHOST_CDN_URL) {
        return process.env.GHOST_CDN_URL;
    }
    if (command === 'build') {
        return './';
    }
    return `${getSubdir()}${DEV_BASE}`;
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    base: getBase(command),
    plugins: [tailwindcss() as PluginOption, react(), emberAssetsPlugin(), ghostBackendProxyPlugin(), tsconfigPaths()],
    define: {
        "process.env.DEBUG": false, // Shim env var utilized by the @tryghost/nql package
    },
    server: {
        host: '0.0.0.0',
        port: 5174,
        allowedHosts: true
    },
    resolve: {
        // Force a single React/React-DOM copy across the whole admin bundle. The
        // admin (React 18) bundles workspace deps (posts/stats/admin-x-settings/
        // shade/...) that each `import "react"` and rely on the consumer to supply
        // it. Under bun's isolated install every package resolves "react" to its own
        // node_modules path, so without dedupe Vite bundles multiple React copies —
        // and a hook that resolves a different copy's (null) dispatcher throws
        // "Invalid hook call" (minified React error #321), crashing the admin.
        dedupe: ["react", "react-dom"],
        alias: {
            "@ghost-cards": GHOST_CARDS_PATH,
            // TODO: Remove this when @tryghost/nql is updated
            mingo: require.resolve("mingo/dist/mingo.js"),
        },
        // Shim node modules utilized by the @tryghost/nql package
        external: ["fs", "path", "util"],
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./test-utils/setup.ts"],
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
}));
