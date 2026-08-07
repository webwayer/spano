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
const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
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
