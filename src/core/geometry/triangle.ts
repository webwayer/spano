import { acos, cos, sin, toDegrees, toRadians } from './angles';
import type { Point } from '../types';

/**
 * Vertices A, B, C with the side opposite each in lower case, and the angle at
 * each vertex as alpha, beta, gamma. Angles are degrees.
 */
export interface Triangle {
    A: Point;
    B: Point;
    C: Point;
    a: number;
    b: number;
    c: number;
    alpha: number;
    beta: number;
    gamma: number;
}

export function calculateTriangleFromCoordinates(A: Point, B: Point, C: Point): Triangle {
    const a = lengthFromCoordinates(B, C);
    const b = lengthFromCoordinates(A, C);
    const c = lengthFromCoordinates(A, B);

    const alpha = angleFromLines(a, b, c);
    const beta = angleFromLines(b, a, c);
    const gamma = angleFromLines(c, a, b);

    return { A, B, C, a, b, c, alpha, beta, gamma };
}

/**
 * Gamma is fixed at 90 degrees and side b lies on the Y axis.
 *
 * PRECONDITION: `A` must lie on the ground (`A.y === 0`).
 *
 * The construction places C at `A.x - b` with `C.y = 0`, ignoring `A.y`
 * entirely, so for any elevated A the returned triangle is not self-consistent:
 * |AB| comes out different from the `c` that was passed in. Both call sites
 * pass a ground point, so this has always held — but it was never written down,
 * and a future caller reaching for "the generic right-triangle solver" would
 * get quietly wrong answers. Surfaced by a property test in Phase 5.
 */
export function calculateTriangleCustom(A: Point, alpha: number, c: number): Triangle {
    if (A.y !== 0) {
        throw new Error(
            `calculateTriangleCustom requires a point on the ground, got y=${A.y}. ` +
                'Use calculateTriangleFromCoordinates for an elevated vertex.'
        );
    }
    const gamma = 90;
    const beta = 180 - gamma - alpha;

    const a = c * cos(toRadians(beta));
    const b = c * cos(toRadians(alpha));

    const C = { x: A.x - b, y: 0 };
    const B = { x: C.x, y: a };

    return { A, B, C, a, b, c, alpha, beta, gamma };
}

/** Solved from two vertices and their angles, with side a lying on the X axis. */
export function calculateTriangleCustom2(A: Point, alpha: number, C: Point, gamma: number): Triangle {
    const beta = 180 - gamma - alpha;

    const b = lengthFromCoordinates(A, C);
    const a = b * (sin(toRadians(alpha)) / sin(toRadians(beta)));
    const c = a * (sin(toRadians(gamma)) / sin(toRadians(alpha)));

    const B = { x: a + C.x, y: 0 };

    return { A, B, C, a, b, c, alpha, beta, gamma };
}

export function lengthFromCoordinates(point1: Point, point2: Point): number {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
}

/**
 * Law of cosines: the angle opposite side `a`, in degrees.
 *
 * Returns NaN for a degenerate triangle, where floating-point error pushes the
 * ratio just outside [-1, 1]. Callers in this codebase never hit that, and the
 * golden baselines confirm no NaN reaches any output today.
 */
export function angleFromLines(a: number, b: number, c: number): number {
    return toDegrees(acos((Math.pow(b, 2) + Math.pow(c, 2) - Math.pow(a, 2)) / (2 * b * c)));
}

/** The line through two points, as a function of x. */
export function lineEquationFrom2PointsByX(point1: Point, point2: Point): (x: number) => number {
    return function (x: number): number {
        return -((x * (point1.y - point2.y) + (point1.x * point2.y - point2.x * point1.y)) / (point2.x - point1.x));
    };
}

/** The angle at `topPoint` subtended by the other two, in degrees. */
export function getTopAngle(topPoint: Point, firstPoint: Point, secondPoint: Point): number {
    return calculateTriangleFromCoordinates(topPoint, firstPoint, secondPoint).alpha;
}
