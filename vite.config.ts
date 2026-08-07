import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

/**
 * The policy the published site runs under.
 *
 * `data:` in img-src is load-bearing: every generated preview is a
 * canvas.toDataURL() result fed to an <img>, and the favicon is a data URI.
 *
 * `blob:` is deliberately absent. An earlier version allowed it, justified by
 * "the mission export uses URL.createObjectURL" — but that code is imported by
 * nothing, and an object URL for a CSV is an <a download>, which img-src does
 * not govern anyway. Add it back only alongside code that puts a blob in an
 * image.
 *
 * A policy this tight is only achievable because the Bootstrap CDN and the
 * Google Maps SDK are both gone.
 */
/**
 * Tile hosts the map fetches from. Mirrors TILE_HOSTS in
 * src/adapters/map/types.ts — both are keyless services, which is the whole
 * reason this list can be enumerated at build time at all.
 */
const TILE_HOSTS = 'https://tile.openstreetmap.org https://server.arcgisonline.com';

const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: ${TILE_HOSTS}`,
    "font-src 'self'",
    `connect-src 'self' ${TILE_HOSTS}`,
    // MapLibre decodes tiles in a Web Worker. Vite emits it as a real
    // same-origin module, NOT a blob — older Mapbox-derived versions used blob
    // URLs, and assuming that produced a CSP which blocked the worker while the
    // build stayed green. Caught only by loading the production build.
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
].join('; ');

/**
 * Inject the CSP at build time only.
 *
 * It cannot live in index.html: the dev server injects styles as inline
 * <style> elements, which `style-src 'self'` blocks, so the page renders
 * completely unstyled while developing. The production build emits a real
 * <link rel="stylesheet">, which 'self' allows.
 *
 * GitHub Pages cannot set response headers, so this has to travel in a meta
 * tag — which works for everything except frame-ancestors, report-uri and
 * sandbox. Those are header-only and silently ignored in meta, so this is not
 * stopping clickjacking, whatever it may look like.
 */
function contentSecurityPolicy(): Plugin {
    return {
        name: 'spano-csp',
        apply: 'build',
        transformIndexHtml(html) {
            return {
                html,
                tags: [
                    {
                        tag: 'meta',
                        attrs: {
                            'http-equiv': 'Content-Security-Policy',
                            content: CONTENT_SECURITY_POLICY,
                        },
                        injectTo: 'head-prepend',
                    },
                ],
            };
        },
    };
}

/** Where the untouched MapLibre worker files are published. */
export const MAPLIBRE_WORKER_DIR = 'assets/maplibre';

/**
 * Publish MapLibre's own worker files, unmodified and with their own names.
 *
 * MapLibre ships the worker as `maplibre-gl-worker.mjs` plus a sibling chunk it
 * imports by relative path. Neither Vite's `?url` (emits one file, so the
 * sibling 404s) nor `?worker&url` (re-bundles it into Vite's own worker format,
 * after which the worker starts but never answers the main thread) produces
 * something MapLibre can talk to. Both failed silently: no error, no tiles, a
 * blank map — and only in the production build, because the dev server serves
 * node_modules directly and resolves the sibling on its own.
 *
 * Copying both verbatim gives MapLibre exactly the pair it was built with.
 * They keep fixed names rather than content hashes, so they are versioned by
 * the dependency rather than by the build.
 */
function maplibreWorkerAssets(): Plugin {
    const require = createRequire(import.meta.url);
    const distDir = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');

    return {
        name: 'spano-maplibre-worker',
        apply: 'build',
        generateBundle() {
            for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
                this.emitFile({
                    type: 'asset',
                    fileName: `${MAPLIBRE_WORKER_DIR}/${file}`,
                    source: readFileSync(join(distDir, file)),
                });
            }
        },
    };
}

export default defineConfig({
    // GitHub Pages serves this project at /spano/, not at the domain root.
    base: '/spano/',
    plugins: [contentSecurityPolicy(), maplibreWorkerAssets()],
    build: {
        target: 'es2022',
        sourcemap: true,
        reportCompressedSize: true,
    },
});
