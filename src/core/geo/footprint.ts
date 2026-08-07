import { getGeoPointFromStartPointDistanceBearing } from './great-circle';
import { getPointsForViewport } from './flight-path';
import type { GeoPoint, Step } from '../types';

/**
 * The patch of ground one frame actually covers, as a quadrilateral on the map.
 *
 * The plan is computed in a vertical slice, so a step only knows *how far along
 * the track* it looks. Width comes from the camera's horizontal field of view,
 * via `getPointsForViewport`, and the four corners are then walked out from the
 * start point along the flight bearing and across it.
 *
 * This is the polygon the 2018 `drawOnMap` drew, lifted out of the deleted
 * Google Maps integration into `core` where it is pure and testable. It had no
 * caller between then and the map returning.
 */
export function stepFootprint(step: Step, startPoint: GeoPoint, heading: number, hFov: number): GeoPoint[] {
    const { bottomViewportOffset, topViewportOffset } = getPointsForViewport(step, hFov);

    // A backwards step already carries the inverted heading, so adding 180
    // recovers the direction the track actually runs — and near/far swap with
    // it. Preserved from the 2018 layout rather than re-derived.
    const along = step.backwards ? heading + 180 : heading;
    const near = step.backwards ? step.lastElement : step.firstElement;
    const far = step.backwards ? step.firstElement : step.lastElement;

    const nearCentre = getGeoPointFromStartPointDistanceBearing(startPoint, near.pointOnTheGround.x, along);
    const farCentre = getGeoPointFromStartPointDistanceBearing(startPoint, far.pointOnTheGround.x, along);

    const left = heading - 90;
    const right = heading + 90;

    return [
        getGeoPointFromStartPointDistanceBearing(nearCentre, bottomViewportOffset, left),
        getGeoPointFromStartPointDistanceBearing(nearCentre, bottomViewportOffset, right),
        getGeoPointFromStartPointDistanceBearing(farCentre, topViewportOffset, right),
        getGeoPointFromStartPointDistanceBearing(farCentre, topViewportOffset, left),
    ];
}

/** Every footprint in a plan, in step order. */
export function planFootprints(
    steps: Step[],
    headings: readonly number[],
    startPoint: GeoPoint,
    hFov: number
): GeoPoint[][] {
    return steps.map((step, i) => stepFootprint(step, startPoint, headings[i] ?? 0, hFov));
}
