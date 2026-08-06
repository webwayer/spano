import { calculateTriangleCustom2, lengthFromCoordinates } from '../geometry/triangle';
import { getBearingBetween2GeoPoints, getGeoPointFromStartPointDistanceBearing } from './great-circle';
import type { GeoPoint, GeoStep, Step } from '../types';

/**
 * Waypoints closer together than this confuse the flight controller, so a step
 * that lands inside the gap is pushed out to it. Metres.
 */
export const MIN_WAYPOINT_SPACING = 0.6;

/**
 * Place the abstract steps on the map.
 *
 * The plan is computed in a vertical slice with x as ground distance; this
 * projects that distance along the bearing from the start point toward the
 * direction point. Backwards steps keep the same position but face the other
 * way.
 *
 * Moved verbatim out of index.ts in Phase 3 — see tests/golden/geo-steps.json,
 * captured before any further change.
 */
export function getGeoSteps(startPoint: GeoPoint, directionPoint: GeoPoint, steps: Step[]): GeoStep[] {
    const bearing = Math.round(getBearingBetween2GeoPoints(startPoint, directionPoint));
    const invertedBearing = (bearing + 540) % 360;

    const geoSteps: GeoStep[] = steps.map(step => {
        const distance = step.shootingPoint.x;

        const geoPoint = getGeoPointFromStartPointDistanceBearing(startPoint, distance, bearing);

        return {
            geoPoint,
            heading: step.backwards ? invertedBearing : bearing,
            shootingPoint: step.shootingPoint,
            viewAngleToTheGround: step.viewAngleToTheGround,
        };
    });

    for (let i = 0; i < geoSteps.length; i++) {
        const step = geoSteps[i];
        const prevStep = geoSteps[i - 1];
        if (prevStep) {
            const deltaX = step.shootingPoint.x - prevStep.shootingPoint.x;
            const deltaY = step.shootingPoint.y - prevStep.shootingPoint.y;
            const distance = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2));

            if (distance < MIN_WAYPOINT_SPACING) {
                step.geoPoint = getGeoPointFromStartPointDistanceBearing(
                    startPoint,
                    prevStep.shootingPoint.x + MIN_WAYPOINT_SPACING,
                    bearing
                );
            }
        }
    }

    return geoSteps;
}

/**
 * Half-widths of the frame's ground footprint at its near and far edges, given
 * the sensor's horizontal field of view. Used to draw the covered area on a map.
 *
 * Moved verbatim out of index.ts in Phase 3.
 */
export function getPointsForViewport(
    step: Step,
    hFov: number
): { bottomViewportOffset: number; topViewportOffset: number } {
    const near = step.backwards ? step.lastElement : step.firstElement;
    const far = step.backwards ? step.firstElement : step.lastElement;

    const bottomViewSideTriangle = calculateTriangleCustom2(
        { x: 0, y: lengthFromCoordinates(step.shootingPoint, near.pointOnTheGround) },
        hFov / 2,
        { x: 0, y: 0 },
        90
    );
    const topViewSideTriangle = calculateTriangleCustom2(
        { x: 0, y: lengthFromCoordinates(step.shootingPoint, far.pointOnTheGround) },
        hFov / 2,
        { x: 0, y: 0 },
        90
    );

    return { bottomViewportOffset: bottomViewSideTriangle.B.x, topViewportOffset: topViewSideTriangle.B.x };
}
