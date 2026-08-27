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
 * `minSpacing` overrides the nudge below. It exists for the single-hover
 * strategy, where every waypoint is coincident *by design*: the default 0.6 m
 * would walk the hover along the track one step at a time — fifteen frames
 * become 8.4 m of travel — and hand back a mission with the very parallax the
 * strategy was chosen to avoid, while the plan on screen still read zero. Pass
 * 0 to place every waypoint where it was asked for.
 *
 * The parameter is optional and defaults to the incumbent constant, so the
 * three-argument call in tools/golden/record.ts is unchanged and
 * tests/golden/flight-path.json proves this edit moved nothing.
 *
 * Baseline: tests/golden/flight-path.json.
 */
export function getGeoSteps(
    startPoint: GeoPoint,
    directionPoint: GeoPoint,
    steps: Step[],
    { minSpacing = MIN_WAYPOINT_SPACING }: { minSpacing?: number } = {}
): GeoStep[] {
    const bearing = Math.round(getBearingBetween2GeoPoints(startPoint, directionPoint));
    const invertedBearing = (bearing + 540) % 360;

    const geoSteps: GeoStep[] = steps.map(step => {
        const distance = step.shootingPoint.x;

        const alongTrack = getGeoPointFromStartPointDistanceBearing(startPoint, distance, bearing);
        // A survey grid flies lines either side of the centreline, and the
        // slice has no sideways axis to carry that. Guarded rather than always
        // applied: every strip plan leaves lateralOffset undefined, takes the
        // early exit, and produces the coordinates it always did — which is
        // what tests/golden/flight-path.json checks.
        const geoPoint = step.lateralOffset
            ? getGeoPointFromStartPointDistanceBearing(alongTrack, step.lateralOffset, (bearing + 90) % 360)
            : alongTrack;

        return {
            geoPoint,
            heading: step.backwards ? invertedBearing : bearing,
            shootingPoint: step.shootingPoint,
            viewAngleToTheGround: step.viewAngleToTheGround,
        };
    });

    // Push coincident waypoints apart, measuring against where the previous one
    // was actually PLACED rather than where it was asked to go.
    //
    // The 2018 version measured from `prevStep.shootingPoint.x` — the requested
    // position — so three consecutive steps sharing a shooting point produced
    // two waypoints at the identical coordinate: both were nudged to the same
    // `x + 0.6`. That is precisely the situation this rule exists to prevent,
    // and it happens routinely, because an `end` shot and the `start` shot that
    // follows it hover in the same place. A property test comparing coordinates
    // rather than object identity found it immediately.
    let lastPlacedX = geoSteps[0]?.shootingPoint.x ?? 0;

    for (let i = 1; i < geoSteps.length; i++) {
        const step = geoSteps[i];
        const prevStep = geoSteps[i - 1];
        if (!step || !prevStep) continue;

        const deltaX = step.shootingPoint.x - prevStep.shootingPoint.x;
        const deltaY = step.shootingPoint.y - prevStep.shootingPoint.y;
        // The sideways axis counts too. Without it a survey grid looks
        // coincident to this rule wherever a serpentine line turns back — the
        // last frame of one line and the first of the next share an x, and are
        // thirty metres apart across the track. Both offsets are undefined for
        // every strip plan, so the term is zero and nothing moves.
        const deltaLateral = (steps[i]?.lateralOffset ?? 0) - (steps[i - 1]?.lateralOffset ?? 0);
        const distance = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2) + Math.pow(deltaLateral, 2));

        if (distance < minSpacing) {
            lastPlacedX += minSpacing;
            step.geoPoint = getGeoPointFromStartPointDistanceBearing(startPoint, lastPlacedX, bearing);
        } else {
            lastPlacedX = step.shootingPoint.x;
        }
    }

    return geoSteps;
}

/**
 * Half-widths of the frame's ground footprint at its near and far edges, given
 * the sensor's horizontal field of view. Used to draw the covered area on a map.
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
