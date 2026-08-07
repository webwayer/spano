import type { Curve } from '../curves/curve';
import type { Point, Triple } from '../types';

/**
 * Stage 1 — walk the curve at a fixed arc-length interval and, for each sample,
 * work out the three points that define it.
 */
export function getPointTriples(curve: Curve, viewPoint: Point, stepLength = 1): Triple[] {
    const totalCurveLength = curve.getTotalLength();

    const pointTriples: Triple[] = [];
    for (let i = 0; i <= totalCurveLength; i += stepLength) {
        const pointOnTheCurve = curve.getPointOnTheCurve(i);
        const pointOnTheGround = curve.getPointOnTheGround(i);
        const shootingPoint = curve.getShootingPoint(i, viewPoint);

        pointTriples.push({
            pointOnTheCurve,
            pointOnTheGround,
            shootingPoint,
        });
    }

    return pointTriples;
}
