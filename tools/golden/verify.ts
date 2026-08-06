/**
 * Re-runs the planner and compares against the committed baselines.
 *
 *   npx --yes tsx@4 tools/golden/verify.ts
 *
 * Exits 0 when current behaviour matches, 1 on any drift. This is the gate that
 * Phases 2-4 re-run after every structural change: it is the only evidence that
 * moving files or turning on a strict flag did not quietly change the flight
 * maths.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CASES, FULL_DUMP_IDS } from './cases';
import { buildDigest, buildFullDump, buildGeo, buildLitchi, normalize } from './record';
import { compare, formatDiffs } from './compare';
import { FULL_DIR, GOLDEN_DIR, fullDumpFilename } from './paths';

const goldenDir = GOLDEN_DIR();
const fullDir = FULL_DIR();

interface Check {
    label: string;
    file: string;
    build: () => unknown;
}

const checks: Check[] = [
    { label: 'digest', file: join(goldenDir, 'digest.json'), build: buildDigest },
    { label: 'geo', file: join(goldenDir, 'geo.json'), build: buildGeo },
    { label: 'litchi', file: join(goldenDir, 'litchi.json'), build: buildLitchi },
    ...CASES.filter(c => FULL_DUMP_IDS.has(c.id)).map(c => ({
        label: `full/${c.id}`,
        file: join(fullDir, fullDumpFilename(c.id)),
        build: () => buildFullDump(c),
    })),
];

let failures = 0;
let missing = 0;

for (const check of checks) {
    if (!existsSync(check.file)) {
        console.error(`✗ ${check.label}: no baseline at ${check.file} — run capture.ts first`);
        missing++;
        continue;
    }

    const expected = JSON.parse(readFileSync(check.file, 'utf8')) as unknown;
    const actual = normalize(check.build());
    const diffs = compare(actual, expected);

    if (diffs.length === 0) {
        console.log(`✓ ${check.label}`);
    } else {
        console.error(`✗ ${check.label}`);
        console.error(formatDiffs(check.label, diffs));
        failures++;
    }
}

console.log('');
if (missing > 0) {
    console.error(`${missing} baseline file(s) missing.`);
}
if (failures > 0) {
    console.error(
        `${failures} of ${checks.length} checks drifted from the baseline.\n` +
        'If the change was deliberate, re-run capture.ts and review the diff before committing.'
    );
}
if (failures === 0 && missing === 0) {
    console.log(`All ${checks.length} checks match the baseline.`);
}

process.exit(failures + missing > 0 ? 1 : 0);
