import { describe, expect, it } from 'vitest';

import {
    apply,
    invert,
    multiply,
    quadToQuad,
    unitSquareTo,
    type Mat3,
    type Quad,
} from '../../src/core/geometry/homography';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UNIT_SQUARE: Quad = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
];

/** A trapezoid, which is what the ground looks like from an oblique camera. */
const TRAPEZOID: Quad = [
    { x: 20, y: 100 },
    { x: 180, y: 100 },
    { x: 260, y: 300 },
    { x: -60, y: 300 },
];

function expectSame(a: { x: number; y: number }, b: { x: number; y: number }, digits = 9): void {
    expect(a.x).toBeCloseTo(b.x, digits);
    expect(a.y).toBeCloseTo(b.y, digits);
}

describe('unitSquareTo', () => {
    it('lands every corner of the unit square on its quad corner', () => {
        const m = unitSquareTo(TRAPEZOID);
        UNIT_SQUARE.forEach((corner, index) => {
            expectSame(apply(m, corner), TRAPEZOID[index] ?? corner);
        });
    });

    it('takes the affine branch for a parallelogram, where the general formula divides by zero', () => {
        const parallelogram: Quad = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 14, y: 6 },
            { x: 4, y: 6 },
        ];
        const m = unitSquareTo(parallelogram);

        // No perspective terms at all.
        expect(m[6]).toBe(0);
        expect(m[7]).toBe(0);
        parallelogram.forEach((corner, index) => {
            expectSame(apply(m, UNIT_SQUARE[index] ?? corner), corner);
        });
    });

    it('keeps the perspective terms for a genuine trapezoid', () => {
        const m = unitSquareTo(TRAPEZOID);
        expect(m[6] === 0 && m[7] === 0).toBe(false);
    });

    it('refuses a quad whose two edges at one corner are collinear', () => {
        // The denominator vanishes when p1, p2 and p3 fall on a line, which is
        // the quad having no area at that corner — not any three corners
        // being collinear, which the closed form handles.
        const collinear: Quad = [
            { x: 0, y: 1 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
        ];
        expect(() => unitSquareTo(collinear)).toThrow(RangeError);
    });
});

describe('invert', () => {
    it('round-trips a point back to itself', () => {
        const m = unitSquareTo(TRAPEZOID);
        const point = { x: 0.37, y: 0.62 };
        expectSame(apply(invert(m), apply(m, point)), point);
    });

    it('composes with its own inverse to the identity', () => {
        const m = unitSquareTo(TRAPEZOID);
        const product = multiply(m, invert(m));
        const normalised = product.map(v => v / product[8]);

        IDENTITY.forEach((expected, index) => {
            expect(normalised[index]).toBeCloseTo(expected, 9);
        });
    });

    it('refuses a singular map', () => {
        expect(() => invert([1, 2, 3, 2, 4, 6, 1, 1, 1])).toThrow(RangeError);
    });
});

describe('apply', () => {
    it('refuses a point the map sends to infinity', () => {
        // The vanishing line: real for an oblique ground plane, and the reason
        // a strip must never be asked to include the horizon.
        expect(() => apply([1, 0, 0, 0, 1, 0, 0, 1, 0], { x: 1, y: 0 })).toThrow(RangeError);
    });
});

describe('quadToQuad', () => {
    it('carries each corner of one quad onto the corresponding corner of the other', () => {
        const source: Quad = [
            { x: 500, y: 1200 },
            { x: 3500, y: 1200 },
            { x: 3100, y: 1900 },
            { x: 900, y: 1900 },
        ];

        const m = quadToQuad(TRAPEZOID, source);
        TRAPEZOID.forEach((corner, index) => {
            expectSame(apply(m, corner), source[index] ?? corner, 6);
        });
    });

    it('is the identity when both quads are the same', () => {
        const m = quadToQuad(TRAPEZOID, TRAPEZOID);
        expectSame(apply(m, { x: 41, y: 173 }), { x: 41, y: 173 }, 6);
    });
});
