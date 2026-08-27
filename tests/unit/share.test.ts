import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
    decodePlan,
    encodePlan,
    NUMERIC_FIELD_IDS,
    parseStrictNumber,
    type FieldBounds,
    type SharedPlan,
} from '../../src/ui/share';

/**
 * The bounds the real form declares. Mirrored here rather than read from the
 * DOM; the e2e suite asserts these are the same numbers the markup carries, so
 * the two cannot drift apart unnoticed.
 */
const BOUNDS: FieldBounds = {
    offset: { min: 10, max: 200, integer: true },
    firstLineLength: { min: 10, max: 200, integer: true },
    curvedLineLength: { min: 10, max: 200, integer: true },
    secondLineLength: { min: 10, max: 200, integer: true },
    viewPointHeight: { min: 10, max: 200, integer: true },
    altitudeCeiling: { min: 10, max: 500, integer: true },
    objectHeight: { min: 0, max: 100, integer: true },
};

const plan: SharedPlan = {
    curveType: 'stunningCurve',
    cameraProfile: 'dji-mavic-pro',
    captureStrategy: 'fine-strips',
    captureDensity: 'x8',
    processingMode: 'homography',
    offset: 50,
    firstLineLength: 60,
    curvedLineLength: 120,
    secondLineLength: 30,
    viewPointHeight: 45,
    altitudeCeiling: 120,
    objectHeight: 10,
};

describe('plan sharing', () => {
    it('round-trips a plan through a fragment', () => {
        expect(decodePlan(encodePlan(plan), BOUNDS)).toEqual(plan);
    });

    it('accepts a fragment with or without its leading hash', () => {
        const encoded = encodePlan(plan);
        expect(decodePlan(`#${encoded}`, BOUNDS)).toEqual(decodePlan(encoded, BOUNDS));
    });

    it('ignores fields a link does not carry', () => {
        expect(decodePlan('offset=25', BOUNDS)).toEqual({ offset: 25 });
        expect(decodePlan('', BOUNDS)).toEqual({});
    });

    it('accepts nothing the form itself would reject', () => {
        // The whole point of taking bounds from the markup. An earlier version
        // hard-coded 1..10_000 against a form of 10..200 and let a link reach
        // parameters no user could type.
        expect(decodePlan('offset=9', BOUNDS)).toEqual({});
        expect(decodePlan('offset=201', BOUNDS)).toEqual({});
        expect(decodePlan('offset=10', BOUNDS)).toEqual({ offset: 10 });
        expect(decodePlan('offset=200', BOUNDS)).toEqual({ offset: 200 });
        expect(decodePlan('altitudeCeiling=500', BOUNDS)).toEqual({ altitudeCeiling: 500 });
        expect(decodePlan('altitudeCeiling=501', BOUNDS)).toEqual({});
    });

    it('rejects non-integers where the field declares step=1', () => {
        expect(decodePlan('offset=50.5', BOUNDS)).toEqual({});
        expect(decodePlan('offset=50', BOUNDS)).toEqual({ offset: 50 });
    });

    it('rejects malformed and hostile numeric values', () => {
        for (const bad of ['-5', '1e9', 'NaN', 'Infinity', '', '  ', '50abc', '0x32', '%3Bdrop', 'null']) {
            expect(decodePlan(`offset=${bad}`, BOUNDS), `offset=${bad}`).toEqual({});
        }
    });

    it('rejects text values that are not plain identifiers', () => {
        expect(decodePlan('curveType=<script>', BOUNDS)).toEqual({});
        expect(decodePlan(`curveType=${'x'.repeat(100)}`, BOUNDS)).toEqual({});
        expect(decodePlan('curveType=simpleCurve', BOUNDS)).toEqual({ curveType: 'simpleCurve' });
    });

    it('never throws, whatever the fragment contains', () => {
        fc.assert(
            fc.property(fc.string(), fragment => {
                expect(() => decodePlan(fragment, BOUNDS)).not.toThrow();
            })
        );
    });

    it('only ever produces values the form would accept', () => {
        fc.assert(
            fc.property(fc.string(), fragment => {
                const decoded = decodePlan(fragment, BOUNDS) as Record<string, unknown>;
                for (const key of NUMERIC_FIELD_IDS) {
                    const value = decoded[key];
                    if (value === undefined) continue;

                    const bound = BOUNDS[key];
                    if (!bound) continue;

                    expect(typeof value).toBe('number');
                    expect(Number.isFinite(value as number)).toBe(true);
                    expect(value as number).toBeGreaterThanOrEqual(bound.min);
                    expect(value as number).toBeLessThanOrEqual(bound.max);
                    expect(Number.isInteger(value as number)).toBe(true);
                }
            })
        );
    });
});

describe('parseStrictNumber', () => {
    it('rejects the trailing rubbish parseFloat tolerates', () => {
        expect(parseStrictNumber('50abc')).toBeUndefined();
        expect(parseStrictNumber('50.5.5')).toBeUndefined();
        expect(parseStrictNumber('')).toBeUndefined();
        expect(parseStrictNumber('   ')).toBeUndefined();
        expect(parseStrictNumber('NaN')).toBeUndefined();
        expect(parseStrictNumber('Infinity')).toBeUndefined();
    });

    it('accepts what a number field can legitimately hold', () => {
        expect(parseStrictNumber(' 50 ')).toBe(50);
        expect(parseStrictNumber('50.5')).toBe(50.5);
        expect(parseStrictNumber('-3')).toBe(-3);
        expect(parseStrictNumber('0')).toBe(0);
    });
});
