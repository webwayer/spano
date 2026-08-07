import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { getBearingBetween2GeoPoints, getGeoPointFromStartPointDistanceBearing } from '../../src/core/geo/great-circle';

/** Away from the poles, where bearing is ill-conditioned. */
const geoPoint = fc.record({
    lat: fc.double({ min: -80, max: 80, noNaN: true }),
    lon: fc.double({ min: -179, max: 179, noNaN: true }),
});

const bearing = fc.double({ min: 0, max: 359.999, noNaN: true });
/** Realistic drone distances. */
const distance = fc.double({ min: 1, max: 5000, noNaN: true });

describe('great-circle', () => {
    it('round-trips: walking a bearing then measuring it back agrees', () => {
        // Cheap, and it validates the two functions against each other rather
        // than against hand-computed constants that could both be wrong.
        fc.assert(
            fc.property(geoPoint, distance, bearing, (start, d, b) => {
                const destination = getGeoPointFromStartPointDistanceBearing(start, d, b);
                const measured = getBearingBetween2GeoPoints(start, destination);

                // Circular difference, so 359.99 and 0.01 count as close.
                const delta = Math.abs(((measured - b + 540) % 360) - 180);
                expect(delta).toBeLessThan(0.01);
            })
        );
    });

    it('travels the distance it was asked to', () => {
        const EARTH_RADIUS = 6371e3;
        fc.assert(
            fc.property(geoPoint, distance, bearing, (start, d, b) => {
                const end = getGeoPointFromStartPointDistanceBearing(start, d, b);

                // Haversine, independently of the implementation under test.
                const toRad = (x: number): number => (x * Math.PI) / 180;
                const dLat = toRad(end.lat - start.lat);
                const dLon = toRad(end.lon - start.lon);
                const a =
                    Math.sin(dLat / 2) ** 2 +
                    Math.cos(toRad(start.lat)) * Math.cos(toRad(end.lat)) * Math.sin(dLon / 2) ** 2;
                const measured = 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));

                expect(measured).toBeCloseTo(d, 3);
            })
        );
    });

    it('always reports a bearing in [0, 360)', () => {
        fc.assert(
            fc.property(geoPoint, geoPoint, (a, b) => {
                const result = getBearingBetween2GeoPoints(a, b);
                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThan(360);
            })
        );
    });

    it('zero distance stays put', () => {
        fc.assert(
            fc.property(geoPoint, bearing, (start, b) => {
                const end = getGeoPointFromStartPointDistanceBearing(start, 0, b);
                expect(end.lat).toBeCloseTo(start.lat, 9);
                expect(end.lon).toBeCloseTo(start.lon, 9);
            })
        );
    });

    it('due north and due east read as 0 and 90', () => {
        expect(getBearingBetween2GeoPoints({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 6);
        expect(getBearingBetween2GeoPoints({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 6);
    });
});
