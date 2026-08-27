import { describe, expect, it } from 'vitest';

import {
    cross,
    dot,
    lookAt,
    magnitude,
    normalize,
    quaternionFrom,
    rotate,
    scale,
    subtract,
    type Basis,
    type Vec3,
} from '../../src/core/geometry/vector3';

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** Rebuild the rotation from the quaternion, independently of how it was made. */
function rowsFromQuaternion(q: { w: number; x: number; y: number; z: number }): Basis {
    const { w, x, y, z } = q;
    return {
        right: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y - z * w), z: 2 * (x * z + y * w) },
        down: { x: 2 * (x * y + z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z - x * w) },
        forward: { x: 2 * (x * z - y * w), y: 2 * (y * z + x * w), z: 1 - 2 * (x * x + y * y) },
    };
}

describe('vector arithmetic', () => {
    it('does the obvious things', () => {
        expect(subtract({ x: 3, y: 5, z: 7 }, { x: 1, y: 2, z: 3 })).toEqual({ x: 2, y: 3, z: 4 });
        expect(scale({ x: 1, y: 2, z: 3 }, 2)).toEqual({ x: 2, y: 4, z: 6 });
        expect(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32);
        expect(magnitude({ x: 3, y: 4, z: 0 })).toBe(5);
        expect(normalize({ x: 0, y: 0, z: 5 })).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('crosses right-handed', () => {
        expect(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('refuses to normalise nothing, rather than returning NaN', () => {
        // A zero axis means the look-at target sits on the camera. Returning
        // NaN would write a pose file that loads and reconstructs into rubbish.
        expect(() => normalize(ORIGIN)).toThrow(RangeError);
    });
});

describe('lookAt', () => {
    const from: Vec3 = { x: 0, y: 50, z: 0 };
    const at: Vec3 = { x: 0, y: 0, z: 100 };

    it('produces an orthonormal, right-handed frame', () => {
        const basis = lookAt(from, at);

        for (const axis of [basis.right, basis.down, basis.forward]) {
            expect(magnitude(axis)).toBeCloseTo(1, 12);
        }
        expect(dot(basis.right, basis.down)).toBeCloseTo(0, 12);
        expect(dot(basis.down, basis.forward)).toBeCloseTo(0, 12);
        expect(dot(basis.forward, basis.right)).toBeCloseTo(0, 12);

        const handed = cross(basis.down, basis.forward);
        expect(handed.x).toBeCloseTo(basis.right.x, 12);
        expect(handed.y).toBeCloseTo(basis.right.y, 12);
        expect(handed.z).toBeCloseTo(basis.right.z, 12);
    });

    it('points forward at the target and keeps the horizon level', () => {
        const basis = lookAt(from, at);

        // Forward is the unit vector towards the target.
        expect(basis.forward.z).toBeGreaterThan(0);
        expect(basis.forward.y).toBeLessThan(0);
        // No roll: the right axis stays horizontal.
        expect(basis.right.y).toBeCloseTo(0, 12);
    });

    it('picks a convention for a nadir frame instead of dividing by zero', () => {
        // Straight down leaves nothing of world-down after the projection.
        const basis = lookAt({ x: 0, y: 50, z: 10 }, { x: 0, y: 0, z: 10 });

        expect(magnitude(basis.down)).toBeCloseTo(1, 12);
        // The image's downward axis runs along the track, so a nadir frame sits
        // the same way up as the oblique frames either side of it.
        expect(basis.down.z).toBeCloseTo(1, 12);
    });

    it('maps the camera onto its own origin and the target onto +Z', () => {
        const basis = lookAt(from, at);

        const relative = rotate(basis, subtract(at, from));
        expect(relative.x).toBeCloseTo(0, 9);
        expect(relative.y).toBeCloseTo(0, 9);
        expect(relative.z).toBeCloseTo(magnitude(subtract(at, from)), 9);
    });
});

describe('quaternionFrom', () => {
    const bases: [string, Basis][] = [
        [
            'identity — the positive-trace branch',
            { right: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: 1 } },
        ],
        [
            'half turn about x — the largest-diagonal branch',
            { right: { x: 1, y: 0, z: 0 }, down: { x: 0, y: -1, z: 0 }, forward: { x: 0, y: 0, z: -1 } },
        ],
        [
            'half turn about y',
            { right: { x: -1, y: 0, z: 0 }, down: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: -1 } },
        ],
        [
            'half turn about z',
            { right: { x: -1, y: 0, z: 0 }, down: { x: 0, y: -1, z: 0 }, forward: { x: 0, y: 0, z: 1 } },
        ],
        ['a look-at frame', lookAt({ x: 0, y: 50, z: 0 }, { x: 0, y: 0, z: 100 })],
    ];

    it.each(bases)('round-trips %s back to the same rotation', (_name, basis) => {
        // Each branch of Shepperd's method exists to keep the divisor away from
        // zero. Rebuilding the matrix is the only check that catches a swapped
        // sign in one of them, because all four produce unit quaternions.
        const rebuilt = rowsFromQuaternion(quaternionFrom(basis));

        for (const axis of ['right', 'down', 'forward'] as const) {
            for (const component of ['x', 'y', 'z'] as const) {
                expect(rebuilt[axis][component]).toBeCloseTo(basis[axis][component], 9);
            }
        }
    });

    it('returns a unit quaternion', () => {
        const q = quaternionFrom(lookAt({ x: 0, y: 50, z: 0 }, { x: 0, y: 0, z: 100 }));
        expect(Math.hypot(q.w, q.x, q.y, q.z)).toBeCloseTo(1, 12);
    });
});
