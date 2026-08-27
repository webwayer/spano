/**
 * Projective maps between quadrilaterals.
 *
 * A 2D canvas transform is affine and cannot express these: an affine map sends
 * a rectangle to a parallelogram, and the ground seen obliquely is a trapezoid.
 * That single fact is why rectifying a strip needs a GPU rather than
 * `setTransform`.
 *
 * Row-major, so `m[row * 3 + col]`, and the bottom-right term is normalised to
 * 1 wherever the construction allows it.
 */

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export interface Vec2 {
    readonly x: number;
    readonly y: number;
}

/** Quad corners, counter-clockwise from the origin of the unit square. */
export type Quad = readonly [Vec2, Vec2, Vec2, Vec2];

export function multiply(a: Mat3, b: Mat3): Mat3 {
    const out = new Array<number>(9).fill(0);
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            let sum = 0;
            for (let k = 0; k < 3; k++) sum += (a[row * 3 + k] ?? 0) * (b[k * 3 + col] ?? 0);
            out[row * 3 + col] = sum;
        }
    }
    return out as unknown as Mat3;
}

export function apply(m: Mat3, point: Vec2): Vec2 {
    const w = m[6] * point.x + m[7] * point.y + m[8];
    if (w === 0) throw new RangeError('Projective map sends this point to infinity.');
    return {
        x: (m[0] * point.x + m[1] * point.y + m[2]) / w,
        y: (m[3] * point.x + m[4] * point.y + m[5]) / w,
    };
}

export function invert(m: Mat3): Mat3 {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h;
    const B = f * g - d * i;
    const C = d * h - e * g;
    const determinant = a * A + b * B + c * C;

    if (determinant === 0) throw new RangeError('Projective map is singular and cannot be inverted.');

    const s = 1 / determinant;
    return [
        A * s,
        (c * h - b * i) * s,
        (b * f - c * e) * s,
        B * s,
        (a * i - c * g) * s,
        (c * d - a * f) * s,
        C * s,
        (b * g - a * h) * s,
        (a * e - b * d) * s,
    ];
}

/**
 * The projective map taking the unit square to a quad, in closed form.
 *
 * Corners in order: (0,0), (1,0), (1,1), (0,1). The closed form is used in
 * preference to solving an eight-by-eight system because it is shorter, exact,
 * and has one clean special case — when the quad is a parallelogram the
 * perspective terms vanish and the general formula divides by zero.
 */
export function unitSquareTo(quad: Quad): Mat3 {
    const [p0, p1, p2, p3] = quad;

    const sumX = p0.x - p1.x + p2.x - p3.x;
    const sumY = p0.y - p1.y + p2.y - p3.y;

    if (sumX === 0 && sumY === 0) {
        // A parallelogram: affine, no perspective division.
        return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
    }

    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;

    const denominator = dx1 * dy2 - dx2 * dy1;
    if (denominator === 0) throw new RangeError('Degenerate quad: three of its corners are collinear.');

    const g = (sumX * dy2 - dx2 * sumY) / denominator;
    const h = (dx1 * sumY - sumX * dy1) / denominator;

    return [
        p1.x - p0.x + g * p1.x,
        p3.x - p0.x + h * p3.x,
        p0.x,
        p1.y - p0.y + g * p1.y,
        p3.y - p0.y + h * p3.y,
        p0.y,
        g,
        h,
        1,
    ];
}

/** The projective map taking `from` onto `to`, corner for corner. */
export function quadToQuad(from: Quad, to: Quad): Mat3 {
    return multiply(unitSquareTo(to), invert(unitSquareTo(from)));
}
