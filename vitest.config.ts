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
            // Declaration-only modules. Both compile to zero bytes — there is
            // no statement in either to execute — so counting them as 0%
            // covered measures nothing and drags the total down. Verify with
            // `npx esbuild <file>` before adding to this list: anything that
            // emits runtime code belongs in the denominator.
            exclude: ['src/core/types.ts', 'src/core/curves/curve.ts'],
            // No threshold on adapters or ui. A coverage number over DOM glue
            // measures how thoroughly the mocks were exercised, and gets gamed.
            // Set at, not above, what the suite actually achieves — a threshold
            // you are already failing is just a broken build. Ratchet these up
            // as coverage improves; never down to make a red build green.
            //
            // Raised from 94/80/95/95 once footprint.ts had tests. `functions`
            // sits at 100 deliberately: core is pure, so every function in it
            // is testable, and a new one arriving untested should fail the
            // build rather than quietly spend the margin. Measured identical
            // on Node 24 (what CI runs) and 26.
            thresholds: { statements: 96, branches: 88, functions: 100, lines: 97 },
        },
    },
});
