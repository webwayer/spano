import { getTopAngle } from '../geometry/triangle';
import type { Triple } from '../types';

/**
 * Stage 2 — quantify, for each sample, how far the available viewpoint is from
 * the ideal one.
 *
 * For sample i this compares the angle to its ground point as seen from its own
 * shooting position against the angle as seen from the *previous* shooting
 * position. On the flat legs the two coincide and the error is ~0; around the
 * arc they diverge, and that divergence is what a straight crop cannot correct.
 *
 * Returns one value per gap, so the array is one shorter than `pointTriples`.
 */
export function getShootingErrorsForTriples(pointTriples: Triple[]): number[] {
    const shootingErrors: number[] = [];
    for (let i = 1; i < pointTriples.length; i++) {
        const triple = pointTriples[i];
        const prevTriple = pointTriples[i - 1];

        const perfectAngleForTriple = getTopAngle(triple.pointOnTheGround, { x: 0, y: 0 }, triple.shootingPoint);
        const angleToTheNextPointOnTheGround = getTopAngle(
            triple.pointOnTheGround,
            { x: 0, y: 0 },
            prevTriple.shootingPoint
        );

        const deltaAngle = Math.abs(perfectAngleForTriple - angleToTheNextPointOnTheGround);

        shootingErrors.push(deltaAngle);
    }
    return shootingErrors;
}
