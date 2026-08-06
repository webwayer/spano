import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // src/core is pure, so the whole unit suite runs in Node with no jsdom
        // and no browser. That is the payoff of the layering.
        environment: 'node',
        include: ['tests/unit/**/*.test.ts', 'tests/property/**/*.test.ts'],
        exclude: ['tests/e2e/**'],
        coverage: {
            provider: 'v8',
            include: ['src/core/**/*.ts'],
            // No threshold on adapters or ui. A coverage number over DOM glue
            // measures how thoroughly the mocks were exercised, and gets gamed.
            // Set at, not above, what the suite actually achieves — a threshold
            // you are already failing is just a broken build. Ratchet these up
            // as coverage improves; never down to make a red build green.
            thresholds: { statements: 94, branches: 80, functions: 95, lines: 95 },
        },
    },
});
