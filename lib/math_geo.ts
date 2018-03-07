import {toDegrees, toRadians} from "./math";

export class GeoPoint {
    lat: number;
    lon: number;
}

export function getGeoPointFromStartPointDistanceBearing(startPoint: GeoPoint, distance: number, bearing: number): GeoPoint {
    const R = 6371e3; // metres
    const d = distance;
    const brng = toRadians(bearing);
    const f1 = toRadians(startPoint.lat);
    const l1 = toRadians(startPoint.lon);

    const f2 = Math.asin(Math.sin(f1) * Math.cos(d / R) +
        Math.cos(f1) * Math.sin(d / R) * Math.cos(brng));
    const l2 = l1 + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(f1),
        Math.cos(d / R) - Math.sin(f1) * Math.sin(f2));

    return {
        lat: toDegrees(f2),
        lon: toDegrees(l2)
    }
}

export function getBearingBetween2GeoPoints(point1: GeoPoint, point2: GeoPoint): number {
    const f1 = toRadians(point1.lat);
    const f2 = toRadians(point2.lat);
    const l1 = toRadians(point1.lon);
    const l2 = toRadians(point2.lon);

    const y = Math.sin(l2 - l1) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) -
        Math.sin(f1) * Math.cos(f2) * Math.cos(l2 - l1);
    const brng = toDegrees(Math.atan2(y, x));

    return (brng + 360) % 360
}