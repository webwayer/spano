import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { decodePlan, encodePlan, type SharedPlan } from '../../src/ui/share';

const plan: SharedPlan = {
    curveType: 'stunningCurve',
    cameraProfile: 'dji-mavic-pro',
    offset: 50,
    firstLineLength: 60,
    curvedLineLength: 120,
    secondLineLength: 30,
    viewPointHeight: 45,
    altitudeCeiling: 120,
};

describe('plan sharing', () => {
    it('round-trips a plan through a fragment', () => {
        expect(decodePlan(encodePlan(plan))).toEqual(plan);
    });

    it('accepts a fragment with or without its leading hash', () => {
        const encoded = encodePlan(plan);
        expect(decodePlan(`#${encoded}`)).toEqual(decodePlan(encoded));
    });

    it('ignores fields a link does not carry', () => {
        expect(decodePlan('offset=25')).toEqual({ offset: 25 });
        expect(decodePlan('')).toEqual({});
    });

    it('rejects values outside the accepted range', () => {
        // A shared link is untrusted input; it must not be able to push the
        // planner somewhere the UI never could.
        expect(decodePlan('offset=-5')).toEqual({});
        expect(decodePlan('offset=1e9')).toEqual({});
        expect(decodePlan('offset=NaN')).toEqual({});
        expect(decodePlan('offset=Infinity')).toEqual({});
        expect(decodePlan('offset=%3Bdrop')).toEqual({});
    });

    it('rejects text values that are not plain identifiers', () => {
        expect(decodePlan('curveType=<script>')).toEqual({});
        expect(decodePlan('curveType=' + 'x'.repeat(100))).toEqual({});
        expect(decodePlan('curveType=simpleCurve')).toEqual({ curveType: 'simpleCurve' });
    });

    it('never throws, whatever the fragment contains', () => {
        fc.assert(
            fc.property(fc.string(), fragment => {
                expect(() => decodePlan(fragment)).not.toThrow();
            })
        );
    });

    it('only ever produces values within range', () => {
        fc.assert(
            fc.property(fc.string(), fragment => {
                const decoded = decodePlan(fragment);
                for (const [key, value] of Object.entries(decoded)) {
                    if (typeof value === 'number') {
                        expect(Number.isFinite(value), `${key} must be finite`).toBe(true);
                        expect(value).toBeGreaterThanOrEqual(1);
                        expect(value).toBeLessThanOrEqual(10_000);
                    }
                }
            })
        );
    });
});
