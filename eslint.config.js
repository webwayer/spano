import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig([
    globalIgnores(['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'tests/golden/**/*.json']),

    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,

    // This file is JS and belongs to no tsconfig, so type-aware rules cannot
    // run on it.
    { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },

    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Interpolating a number into a string is ordinary and safe. The
            // rule's real value is catching objects and unions that stringify
            // to "[object Object]", which stays on.
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        },
    },

    {
        // The purity boundary again, this time as a lint rule.
        //
        // src/core/tsconfig.json already makes DOM *globals* a compile error by
        // omitting "DOM" from lib. That does not stop core importing three.js,
        // which type-checks fine because three ships its own types. This closes
        // that gap: the boundary is defended from both directions.
        files: ['src/core/**/*.ts'],
        rules: {
            // no-restricted-imports only visits static ImportDeclaration, so
            // `await import('three')` slipped past both this rule and the
            // DOM-free tsconfig. Not hypothetical: src/ui/previews.ts already
            // lazy-loads three.js with exactly that idiom, so it is the natural
            // thing to copy. Found by probing the boundary rather than assuming it.
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'ImportExpression > Literal.source[value=/^(three($|\\/)|.*\\/(adapters|ui)\\/)/]',
                    message:
                        'src/core must stay free of rendering, DOM and UI dependencies — ' +
                        'dynamic import() included.',
                },
            ],
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['three', 'three/*', '**/adapters/*', '**/ui/*'],
                            message:
                                'src/core must stay free of rendering, DOM and UI dependencies. ' +
                                'If core needs this, the dependency is pointing the wrong way',
                        },
                    ],
                },
            ],
        },
    },

    {
        // The golden harness deliberately walks unknown-shaped JSON.
        files: ['tools/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
        },
    },

    // Must be last: turns off the stylistic rules Prettier owns.
    prettier,
]);
