import { defineConfig } from 'vite';

export default defineConfig({
    // GitHub Pages serves this project at /spano/, not at the domain root.
    base: '/spano/',
    build: {
        target: 'es2022',
        sourcemap: true,
        reportCompressedSize: true,
    },
});
