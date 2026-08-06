/**
 * Deep comparison with a relative tolerance on numbers.
 *
 * Why not exact equality: Math.sin, cos, acos, atan2 and pow are not required
 * by ECMA-262 to be correctly rounded, and this code leans on all of them. Two
 * V8 builds on different architectures can differ in the last ulp, so a strict
 * float comparison would make the suite flaky the moment it runs on x64 CI
 * instead of an arm64 laptop.
 *
 * 1e-9 relative is roughly seven orders of magnitude tighter than any genuine
 * behavioural change, so it still catches what it is meant to catch.
 */

export const TOLERANCE = 1e-9;

export interface Diff {
    path: string;
    actual: unknown;
    expected: unknown;
    reason: string;
}

const MAX_DIFFS = 40;

function describe(value: unknown): string {
    if (value === undefined) return '<missing>';
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'object') return `object{${Object.keys(value).join(',')}}`;
    if (typeof value === 'string') return JSON.stringify(value);
    return String(value);
}

function walk(actual: unknown, expected: unknown, path: string, diffs: Diff[]): void {
    if (diffs.length >= MAX_DIFFS) return;

    if (typeof expected === 'number' && typeof actual === 'number') {
        const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
        const delta = Math.abs(actual - expected);
        if (delta > TOLERANCE * scale) {
            diffs.push({
                path,
                actual,
                expected,
                reason: `numeric drift of ${delta.toExponential(3)} (relative ${(delta / scale).toExponential(3)})`,
            });
        }
        return;
    }

    if (Array.isArray(expected) || Array.isArray(actual)) {
        if (!Array.isArray(expected) || !Array.isArray(actual)) {
            diffs.push({ path, actual: describe(actual), expected: describe(expected), reason: 'shape changed' });
            return;
        }
        if (actual.length !== expected.length) {
            diffs.push({
                path: `${path}.length`,
                actual: actual.length,
                expected: expected.length,
                reason: 'array length changed',
            });
        }
        const n = Math.max(actual.length, expected.length);
        for (let i = 0; i < n; i++) walk(actual[i], expected[i], `${path}[${i}]`, diffs);
        return;
    }

    const bothObjects =
        expected !== null && typeof expected === 'object' &&
        actual !== null && typeof actual === 'object';

    if (bothObjects) {
        const keys = new Set([
            ...Object.keys(expected as object),
            ...Object.keys(actual as object),
        ]);
        for (const key of keys) {
            walk(
                (actual as Record<string, unknown>)[key],
                (expected as Record<string, unknown>)[key],
                path ? `${path}.${key}` : key,
                diffs
            );
        }
        return;
    }

    if (actual !== expected) {
        diffs.push({ path, actual: describe(actual), expected: describe(expected), reason: 'value changed' });
    }
}

export function compare(actual: unknown, expected: unknown, rootPath = ''): Diff[] {
    const diffs: Diff[] = [];
    walk(actual, expected, rootPath, diffs);
    return diffs;
}

export function formatDiffs(label: string, diffs: Diff[]): string {
    const shown = diffs.slice(0, MAX_DIFFS);
    const lines = shown.map(
        d => `    ${d.path || '<root>'}\n      expected ${describe(d.expected)}\n      actual   ${describe(d.actual)}\n      (${d.reason})`
    );
    if (diffs.length >= MAX_DIFFS) {
        lines.push(`    ... reporting capped at ${MAX_DIFFS} differences`);
    }
    return `  ${label}: ${diffs.length} difference(s)\n${lines.join('\n')}`;
}
