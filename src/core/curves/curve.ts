import type { Point } from '../types';

/**
 * The virtual surface the finished panorama is projected onto.
 *
 * Every method is parameterised by arc length along the curve, in metres,
 * from 0 to getTotalLength().
 */
export interface Curve {
    /** Where a sample sits on the panorama surface. */
    getPointOnTheCurve(length: number): Point;

    /** The patch of ground that sample images. */
    getPointOnTheGround(length: number): Point;

    /** Where the camera must be for the two to line up, given the viewer's eye. */
    getShootingPoint(length: number, viewPoint: Point): Point;

    getTotalLength(): number;
}
