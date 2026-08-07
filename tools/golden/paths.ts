import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Both scripts are run from the repository root:
 *   npx --yes tsx@4 tools/golden/capture.ts
 * Resolving against cwd avoids the ESM/CJS __dirname vs import.meta.url split,
 * which tsx papers over inconsistently depending on how the file is loaded.
 */
export function repoRoot(): string {
    const root = resolve(process.cwd());
    if (!existsSync(join(root, 'src', 'core', 'planner', 'plan.ts'))) {
        console.error(
            `Run this from the repository root (no src/core/planner/plan.ts under ${root}).\n` +
                '  npx --yes tsx@4 tools/golden/capture.ts'
        );
        process.exit(2);
    }
    return root;
}

export const GOLDEN_DIR = () => join(repoRoot(), 'tests', 'golden');
export const FULL_DIR = () => join(GOLDEN_DIR(), 'full');

/** 'simple/tiny-radius' -> 'simple__tiny-radius.json' */
export function fullDumpFilename(caseId: string): string {
    return `${caseId.replace(/\//g, '__')}.json`;
}
