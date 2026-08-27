/**
 * Three-dimensional vectors, and the orientation you build out of them.
 *
 * The planner lives in a vertical slice and needs none of this: it solves
 * triangles from side lengths, which is why `triangle.ts` has served for eight
 * years without a vector type. Exporting camera poses is the first thing that
 * genuinely needs three dimensions, because a pose is a position *and* a
 * rotation, and a rotation is not expressible as an angle in a plane.
 *
 * Deliberately minimal. Every function here exists because one call site needed
 * it; there is no `lerp`, no `reflect`, and no operator sugar.
 */

export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Rotation as three orthonormal rows: the world axes expressed in camera space. */
export interface Basis {
    readonly right: Vec3;
    readonly down: Vec3;
    readonly forward: Vec3;
}

export interface Quaternion {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, factor: number): Vec3 {
    return { x: a.x * factor, y: a.y * factor, z: a.z * factor };
}

export function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

export function magnitude(a: Vec3): number {
    return Math.sqrt(dot(a, a));
}

/**
 * Throws rather than returning a zero vector or NaN.
 *
 * Every caller here is building a camera basis, where a zero-length axis means
 * the look-at target coincides with the camera or the up reference is parallel
 * to the view. Both are bugs upstream, and both produce a pose file that loads
 * without complaint and reconstructs into nonsense — the worst failure mode
 * available. `calculateTriangleCustom` guards its own precondition the same way.
 */
export function normalize(a: Vec3): Vec3 {
    const length = magnitude(a);
    if (length === 0) throw new RangeError('Cannot normalise a zero-length vector.');
    return scale(a, 1 / length);
}

/** Apply the rotation to a world vector, giving it in camera coordinates. */
export function rotate(basis: Basis, v: Vec3): Vec3 {
    return { x: dot(basis.right, v), y: dot(basis.down, v), z: dot(basis.forward, v) };
}

/**
 * The camera orientation that looks from `from` at `at` with no roll.
 *
 * Built in the convention COLMAP and OpenCV share: +Z along the view direction,
 * +X to the right, +Y downward in the image. The "no roll" part is what makes
 * it well defined — the down axis is world-down with the forward component
 * removed, which is exactly what a two-axis gimbal produces.
 *
 * Straight down is the one direction that breaks that, because world-down is
 * then parallel to the view and has nothing left after the projection. A nadir
 * frame has no natural roll at all, so the convention has to be chosen: this
 * points the image's downward axis along the track, which keeps a nadir frame
 * oriented the same way as the oblique frames either side of it.
 */
export function lookAt(from: Vec3, at: Vec3): Basis {
    const forward = normalize(subtract(at, from));

    const WORLD_DOWN: Vec3 = { x: 0, y: -1, z: 0 };
    const ALONG_TRACK: Vec3 = { x: 0, y: 0, z: 1 };
    const reference = magnitude(cross(forward, WORLD_DOWN)) < 1e-9 ? ALONG_TRACK : WORLD_DOWN;

    const down = normalize(subtract(reference, scale(forward, dot(reference, forward))));

    return { right: cross(down, forward), down, forward };
}

/**
 * Quaternion for a rotation given as orthonormal rows, by Shepperd's method.
 *
 * The branches are not stylistic: taking the square root of whichever diagonal
 * term is largest keeps the divisor away from zero, where the naive
 * trace-only formula loses most of its precision.
 */
export function quaternionFrom(basis: Basis): Quaternion {
    const { right: r, down: d, forward: f } = basis;
    const trace = r.x + d.y + f.z;

    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        return { w: 0.25 * s, x: (d.z - f.y) / s, y: (f.x - r.z) / s, z: (r.y - d.x) / s };
    }
    if (r.x > d.y && r.x > f.z) {
        const s = Math.sqrt(1 + r.x - d.y - f.z) * 2;
        return { w: (d.z - f.y) / s, x: 0.25 * s, y: (r.y + d.x) / s, z: (f.x + r.z) / s };
    }
    if (d.y > f.z) {
        const s = Math.sqrt(1 + d.y - r.x - f.z) * 2;
        return { w: (f.x - r.z) / s, x: (r.y + d.x) / s, y: 0.25 * s, z: (d.z + f.y) / s };
    }
    const s = Math.sqrt(1 + f.z - r.x - d.y) * 2;
    return { w: (r.y - d.x) / s, x: (f.x + r.z) / s, y: (d.z + f.y) / s, z: 0.25 * s };
}
