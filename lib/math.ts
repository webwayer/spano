export class Point {
    constructor(public x, public y) {
    }
}

export interface Triangle {
    A: Point,
    B: Point,
    C: Point,
    a: number,
    b: number,
    c: number,
    alpha: number,
    beta: number,
    gamma: number,
}

export function calculateTriangleFromCoordinates(A: Point, B: Point, C: Point): Triangle {
    const a = lengthFromCoordinates(B, C);
    const b = lengthFromCoordinates(A, C);
    const c = lengthFromCoordinates(A, B);

    const alpha = angleFromLines(a, b, c);
    const beta = angleFromLines(b, a, c);
    const gamma = angleFromLines(c, a, b);

    return { A, B, C, a, b, c, alpha, beta, gamma }
}

// Gamma is strictly 90 degrees, and b is on the Y
export function calculateTriangleCustom(A: Point, alpha: number, c: number): Triangle {
    const gamma = 90;
    const beta = 180 - gamma - alpha;

    const a = c * Math.cos(toRadians(beta));
    const b = c * Math.cos(toRadians(alpha));

    const C = { x: A.x - b, y: 0 };
    const B = { x: C.x, y: a };

    return { A, B, C, a, b, c, alpha, beta, gamma }
}

// and a is on the X
export function calculateTriangleCustom2(A: Point, alpha: number, C: Point, gamma: number): Triangle {
    const beta = 180 - gamma - alpha;

    const b = lengthFromCoordinates(A, C);
    const a = b * (Math.sin(toRadians(alpha)) / Math.sin(toRadians(beta)));
    const c = a * (Math.sin(toRadians(gamma)) / Math.sin(toRadians(alpha)));

    const B = { x: a + C.x, y: 0 };

    return { A, B, C, a, b, c, alpha, beta, gamma }
}

// and a is on the X
export function calculateTriangleCustom3(A: Point, alpha: number, C: Point, gamma: number): Triangle {
    const beta = 180 - gamma - alpha;

    const b = lengthFromCoordinates(A, C);
    const a = b * (Math.sin(toRadians(alpha)) / Math.sin(toRadians(beta)));
    const c = a * (Math.sin(toRadians(gamma)) / Math.sin(toRadians(alpha)));

    const B = { x: a, y: 0 };

    return { A, B, C, a, b, c, alpha, beta, gamma }
}

export function lengthFromCoordinates(point1: Point, point2: Point): number {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
}

export function angleFromLines(a: number, b: number, c: number): number {
    return toDegrees(Math.acos((Math.pow(b, 2) + Math.pow(c, 2) - Math.pow(a, 2)) / (2 * b * c)))
}

export function toRadians(angle: number): number {
    return angle * (Math.PI / 180);
}

export function toDegrees(angle: number): number {
    return angle * (180 / Math.PI);
}

export function lineEquationFrom2PointsByX(point1: Point, point2: Point): (x: number) => number {
    return function (x: number): number {
        return -((x * (point1.y - point2.y) + (point1.x * point2.y - point2.x * point1.y)) / (point2.x - point1.x))
    }
}

export function getTopAngle(topPoint: Point, firstPoint: Point, secondPoint: Point): number {
    const triangle = calculateTriangleFromCoordinates(topPoint, firstPoint, secondPoint);
    return triangle.alpha;
}