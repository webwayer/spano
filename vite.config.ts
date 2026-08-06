import { defineConfig, type Plugin } from 'vite';

/**
 * The policy the published site runs under.
 *
 * data: and blob: in img-src are load-bearing: every generated preview is a
 * canvas.toDataURL() result and the mission export uses URL.createObjectURL.
 * A policy this tight is only achievable because the Bootstrap CDN and the
 * Google Maps SDK are both gone.
 */
const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
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

export default defineConfig({
    // GitHub Pages serves this project at /spano/, not at the domain root.
    base: '/spano/',
    plugins: [contentSecurityPolicy()],
    build: {
        target: 'es2022',
        sourcemap: true,
        reportCompressedSize: true,
    },
});
