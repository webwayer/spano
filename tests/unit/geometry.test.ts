import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
    angleFromLines,
    calculateTriangleCustom,
    calculateTriangleCustom2,
    calculateTriangleFromCoordinates,
    getTopAngle,
    lengthFromCoordinates,
    lineEquationFrom2PointsByX,
} from '../../src/core/geometry/triangle';
import { cos, sin, toDegrees, toRadians } from '../../src/core/geometry/angles';

describe('angles', () => {
    it('round-trips degrees through radians', () => {
        fc.assert(
            fc.property(fc.double({ min: -720, max: 720, noNaN: true }), d => {
                expect(toDegrees(toRadians(d))).toBeCloseTo(d, 9);
            })
        );
    });

    it('wraps Math faithfully', () => {
        fc.assert(
            fc.property(fc.double({ min: -10, max: 10, noNaN: true }), x => {
                // Association matters: the implementation is x * (PI / 180),
                // which is NOT bit-identical to (x * PI) / 180. Writing the
                // expectation the other way round failed on a denormal.
                const asRadians = x * (Math.PI / 180);
                expect(sin(toRadians(x))).toBe(Math.sin(asRadians));
                expect(cos(toRadians(x))).toBe(Math.cos(asRadians));
            })
        );
    });

    it('knows the landmark values', () => {
        expect(toRadians(180)).toBeCloseTo(Math.PI, 12);
        expect(sin(toRadians(90))).toBeCloseTo(1, 12);
        expect(cos(toRadians(0))).toBe(1);
    });
});

describe('triangle', () => {
    /** Three points general enough to form a non-degenerate triangle. */
    const triple = fc
        .tuple(
            fc.record({ x: fc.integer({ min: -500, max: 500 }), y: fc.integer({ min: -500, max: 500 }) }),
            fc.record({ x: fc.integer({ min: -500, max: 500 }), y: fc.integer({ min: -500, max: 500 }) }),
            fc.record({ x: fc.integer({ min: -500, max: 500 }), y: fc.integer({ min: -500, max: 500 }) })
        )
        .filter(([A, B, C]) => {
            // Reject collinear or coincident points: the angles are undefined.
            const area = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y));
            return area > 100;
        });

    it('interior angles sum to 180', () => {
        // math.ts had four near-identical solvers with slightly different
        // conventions, which is exactly where a copy-paste error lives.
        fc.assert(
            fc.property(triple, ([A, B, C]) => {
                const t = calculateTriangleFromCoordinates(A, B, C);
                expect(t.alpha + t.beta + t.gamma).toBeCloseTo(180, 6);
            })
        );
    });

    it('satisfies the triangle inequality', () => {
        fc.assert(
            fc.property(triple, ([A, B, C]) => {
                const t = calculateTriangleFromCoordinates(A, B, C);
                expect(t.a + t.b).toBeGreaterThan(t.c - 1e-9);
                expect(t.b + t.c).toBeGreaterThan(t.a - 1e-9);
                expect(t.a + t.c).toBeGreaterThan(t.b - 1e-9);
            })
        );
    });

    it('measures distance symmetrically', () => {
        fc.assert(
            fc.property(triple, ([A, B]) => {
                expect(lengthFromCoordinates(A, B)).toBeCloseTo(lengthFromCoordinates(B, A), 12);
            })
        );
    });

    it('agrees with the law of cosines on a 3-4-5 triangle', () => {
        expect(angleFromLines(5, 3, 4)).toBeCloseTo(90, 9);
        expect(angleFromLines(3, 4, 5)).toBeCloseTo(36.869897, 5);
    });

    it('getTopAngle is the angle at the first argument', () => {
        expect(getTopAngle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 9);
        expect(getTopAngle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45, 9);
    });

    it('calculateTriangleCustom puts B directly above C with a right angle at C', () => {
        // A must be on the ground — see the precondition on the function. A
        // property test with elevated A is what uncovered that it was unstated.
        fc.assert(
            fc.property(
                fc.record({ x: fc.integer({ min: -100, max: 100 }), y: fc.constant(0) }),
                fc.double({ min: 5, max: 85, noNaN: true }),
                fc.double({ min: 1, max: 500, noNaN: true }),
                (A, alpha, c) => {
                    const t = calculateTriangleCustom(A, alpha, c);
                    expect(t.gamma).toBe(90);
                    expect(t.B.x).toBeCloseTo(t.C.x, 9);
                    expect(t.C.y).toBe(0);
                    // The hypotenuse from A to B really is length c.
                    expect(lengthFromCoordinates(A, t.B)).toBeCloseTo(c, 6);
                }
            )
        );
    });

    it('calculateTriangleCustom2 lands B on the X axis', () => {
        const t = calculateTriangleCustom2({ x: 0, y: 100 }, 30, { x: 0, y: 0 }, 90);
        expect(t.B.y).toBe(0);
        expect(t.alpha + t.beta + t.gamma).toBeCloseTo(180, 9);
    });

    it('calculateTriangleCustom rejects an elevated vertex instead of lying', () => {
        expect(() => calculateTriangleCustom({ x: 0, y: 50 }, 30, 10)).toThrow(/on the ground/);
    });

    it('lineEquationFrom2PointsByX passes through both points', () => {
        fc.assert(
            fc.property(triple, ([A, B]) => {
                fc.pre(A.x !== B.x);
                const line = lineEquationFrom2PointsByX(A, B);
                expect(line(A.x)).toBeCloseTo(A.y, 6);
                expect(line(B.x)).toBeCloseTo(B.y, 6);
            })
        );
    });
});
