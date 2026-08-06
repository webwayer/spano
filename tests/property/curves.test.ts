import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import type { Curve } from '../../src/core/curves/curve';
import { lengthFromCoordinates } from '../../src/core/geometry/triangle';

/**
 * Curve parameters within the ranges the UI actually permits.
 */
const params = fc.record({
    offset: fc.integer({ min: 10, max: 200 }),
    firstLeg: fc.integer({ min: 10, max: 200 }),
    radius: fc.integer({ min: 10, max: 200 }),
    secondLeg: fc.integer({ min: 10, max: 200 }),
});

const curves: [string, new (o: number, f: number, r: number, s: number) => Curve][] = [
    ['Arc90Curve', Arc90Curve],
    ['Arc135Curve', Arc135Curve],
];

describe.each(curves)('%s', (_name, Ctor) => {
    it('is defined everywhere on [0, totalLength]', () => {
        // This is the property that catches the 2018 defect where the piecewise
        // branches left a gap and returned undefined. A hand-written example
        // test would very likely have missed it: it only bites at particular
        // parameter combinations.
        fc.assert(
            fc.property(params, fc.double({ min: 0, max: 1, noNaN: true }), (p, t) => {
                const curve = new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
                const length = t * curve.getTotalLength();

                const point = curve.getPointOnTheCurve(length);
                expect(Number.isFinite(point.x)).toBe(true);
                expect(Number.isFinite(point.y)).toBe(true);
            })
        );
    });

    it('throws rather than returning undefined past the end', () => {
        fc.assert(
            fc.property(params, fc.double({ min: 0.001, max: 100, noNaN: true }), (p, over) => {
                const curve = new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
                expect(() => curve.getPointOnTheCurve(curve.getTotalLength() + over)).toThrow(RangeError);
            })
        );
    });

    it('is continuous: no jumps across the segment joins', () => {
        // The curves are piecewise (leg, arc, leg). Boundary handling is exactly
        // where a <= versus < mistake hides, and it shows up as a discontinuity.
        const EPSILON = 1e-6;
        fc.assert(
            fc.property(params, fc.double({ min: 0, max: 1, noNaN: true }), (p, t) => {
                const curve = new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
                const total = curve.getTotalLength();
                const length = Math.min(t * total, total - EPSILON);

                const here = curve.getPointOnTheCurve(length);
                const there = curve.getPointOnTheCurve(length + EPSILON);

                // Moving EPSILON along the curve must move at most EPSILON in
                // space, with a little slack for floating point.
                expect(lengthFromCoordinates(here, there)).toBeLessThan(EPSILON * 10);
            })
        );
    });

    it('is parameterised by arc length: straight-line distance never exceeds it', () => {
        // The whole planner assumes the parameter is arc length. If it is not,
        // every derived angle is subtly wrong.
        fc.assert(
            fc.property(
                params,
                fc.double({ min: 0, max: 1, noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (p, t1, t2) => {
                    const curve = new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
                    const total = curve.getTotalLength();
                    const l1 = t1 * total;
                    const l2 = t2 * total;

                    const chord = lengthFromCoordinates(curve.getPointOnTheCurve(l1), curve.getPointOnTheCurve(l2));
                    expect(chord).toBeLessThanOrEqual(Math.abs(l1 - l2) + 1e-6);
                }
            )
        );
    });

    it('starts on the ground at the offset and only ever rises', () => {
        fc.assert(
            fc.property(params, p => {
                const curve = new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
                expect(curve.getPointOnTheCurve(0)).toEqual({ x: p.offset, y: 0 });
                expect(curve.getPointOnTheCurve(curve.getTotalLength()).y).toBeGreaterThan(0);
            })
        );
    });
});

describe('arc lengths match the sweep each class claims', () => {
    it('Arc90Curve sweeps a quarter circle', () => {
        fc.assert(
            fc.property(params, p => {
                const curve = new Arc90Curve(p.offset, p.firstLeg, p.radius, p.secondLeg);
                // arc length = r * theta, theta in radians
                expect(curve.curvedSegmentLength).toBeCloseTo(p.radius * (Math.PI / 2), 9);
            })
        );
    });

    it('Arc135Curve sweeps three eighths of a circle, not a third', () => {
        // Guards the documentation bug fixed in Phase 0: the README claimed 120
        // degrees for years while the code did 135.
        fc.assert(
            fc.property(params, p => {
                const curve = new Arc135Curve(p.offset, p.firstLeg, p.radius, p.secondLeg);
                expect(curve.curvedSegmentLength).toBeCloseTo(p.radius * ((135 * Math.PI) / 180), 9);
            })
        );
    });
});
