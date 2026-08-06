import { asin, atan2, cos, radiansOf, sin, toDegrees, toRadians } from '../geometry/angles';
import type { GeoPoint } from '../types';

/** Mean Earth radius, metres. */
const EARTH_RADIUS = 6371e3;

/**
 * The point reached by travelling `distance` metres from `startPoint` along
 * `bearing` degrees, on a great circle.
 */
export function getGeoPointFromStartPointDistanceBearing(
    startPoint: GeoPoint,
    distance: number,
    bearing: number
): GeoPoint {
    const R = EARTH_RADIUS;
    const d = distance;
    const brng = toRadians(bearing);
    const f1 = toRadians(startPoint.lat);
    const l1 = toRadians(startPoint.lon);

    // d / R is an arc length over a radius, which is already an angle in radians.
    const angularDistance = radiansOf(d / R);

    const f2 = asin(sin(f1) * cos(angularDistance) + cos(f1) * sin(angularDistance) * cos(brng));
    const l2 = radiansOf(
        l1 + atan2(sin(brng) * sin(angularDistance) * cos(f1), cos(angularDistance) - sin(f1) * sin(f2))
    );

    return { lat: toDegrees(f2), lon: toDegrees(l2) };
}

/** Initial bearing from point1 to point2, degrees clockwise from north. */
export function getBearingBetween2GeoPoints(point1: GeoPoint, point2: GeoPoint): number {
    const f1 = toRadians(point1.lat);
    const f2 = toRadians(point2.lat);
    const l1 = toRadians(point1.lon);
    const l2 = toRadians(point2.lon);

    const deltaLon = radiansOf(l2 - l1);

    const y = sin(deltaLon) * cos(f2);
    const x = cos(f1) * sin(f2) - sin(f1) * cos(f2) * cos(deltaLon);
    const brng = toDegrees(atan2(y, x));

    return (brng + 360) % 360;
}
