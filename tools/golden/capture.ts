/**
 * Captures the golden baselines.
 *
 *   npx --yes tsx@4 tools/golden/capture.ts
 *
 * Overwrites everything under tests/golden/. Re-run this ONLY when a change to
 * the planner is deliberate — then review the diff before committing. Running
 * it to make a failing verify pass defeats the entire point.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CASES, FULL_DUMP_IDS } from './cases';
import { buildDigest, buildFullDump, buildGeo, buildLitchi, toJson } from './record';
import { FULL_DIR, GOLDEN_DIR, fullDumpFilename } from './paths';

const goldenDir = GOLDEN_DIR();
const fullDir = FULL_DIR();
mkdirSync(fullDir, { recursive: true });

// ─── digest ───────────────────────────────────────────────────────────────────
const digest = buildDigest() as { cases: Array<{ id: string; outcome: string; error?: { name: string; message: string } }> };
writeFileSync(join(goldenDir, 'digest.json'), toJson(digest));

const ok = digest.cases.filter(c => c.outcome === 'ok');
const failed = digest.cases.filter(c => c.outcome === 'error');

console.log(`digest.json    ${digest.cases.length} cases — ${ok.length} ok, ${failed.length} throwing`);
for (const c of failed) {
    console.log(`               ✗ ${c.id}: ${c.error?.name}: ${c.error?.message}`);
}

// ─── full dumps ───────────────────────────────────────────────────────────────
let dumped = 0;
for (const testCase of CASES) {
    if (!FULL_DUMP_IDS.has(testCase.id)) continue;
    writeFileSync(join(fullDir, fullDumpFilename(testCase.id)), toJson(buildFullDump(testCase)));
    dumped++;
}
console.log(`full/          ${dumped} complete intermediate dumps`);

// ─── geodesy ──────────────────────────────────────────────────────────────────
writeFileSync(join(goldenDir, 'geo.json'), toJson(buildGeo()));
console.log('geo.json       lib/math_geo.ts');

// ─── litchi ───────────────────────────────────────────────────────────────────
writeFileSync(join(goldenDir, 'litchi.json'), toJson(buildLitchi()));
console.log('litchi.json    makeLitchiMission()');

console.log(`\nBaselines written to ${goldenDir}`);
