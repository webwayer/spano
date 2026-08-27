import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    /*
     * Raised from the 30 s / 5 s defaults in 2026, when the suite grew several
     * tests that drive real GPU renders — reprojecting strips, compositing a
     * panorama, saving it. Those defaults were set when the suite was almost
     * entirely DOM assertions.
     *
     * This is not slack for flakiness. Every one of these tests passes in about
     * two seconds on its own; what they cannot do is finish in five while four
     * other workers are queued on the same GPU. Capping `workers` instead would
     * make the whole suite slower to buy the same reliability, and lowering the
     * assertions would be worse than either.
     */
    timeout: 90_000,
    expect: { timeout: 20_000 },
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['html'], ['github']] : 'list',
    use: {
        baseURL: `http://localhost:${PORT}/spano/`,
        trace: 'on-first-retry',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        // Test the production build, not the dev server: it is what ships.
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/spano/`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
});
