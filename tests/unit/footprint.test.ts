import { describe, expect, it } from 'vitest';

import { planFootprints, stepFootprint } from '../../src/core/geo/footprint';
import { getPointsForViewport } from '../../src/core/geo/flight-path';
import { getBearingBetween2GeoPoints, getGeoPointFromStartPointDistanceBearing } from '../../src/core/geo/great-circle';
import type { Point, Step, Triple } from '../../src/core/types';

/*
 * Footprints came back from the deleted Google Maps integration when the map
 * returned, and arrived with no tests at all — CI caught it as a coverage drop.
 * They are the only thing standing between the plan and what the pilot sees
 * covered on the map, so they are worth pinning properly.
 */

const START = { lat: 37.77068, lon: -122.393042 };

function triple(groundX: number): Triple {
    return {
        pointOnTheCurve: { x: groundX, y: 0 },
        pointOnTheGround: { x: groundX, y: 0 },
        shootingPoint: { x: 0, y: 0 },
    };
}

function step(overrides: Partial<Step> = {}): Step {
    const first = triple(100);
    const last = triple(200);
    return {
        shotOn: 'center',
        shootingPoint: { x: 0, y: 50 },
        shootedPoint: { x: 150, y: 0 },
        angleOfView: 40,
        viewAngleToTheGround: -20,
        backwards: false,
        firstElement: first,
        centerElement: triple(150),
        lastElement: last,
        ...overrides,
    };
}

/** Metres between two points in the vertical slice. */
function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('getPointsForViewport', () => {
    it('widens with distance from the camera', () => {
        const { bottomViewportOffset, topViewportOffset } = getPointsForViewport(step(), 60);

        // firstElement is 100 m out, lastElement 200 m; the far edge of the
        // frame covers more ground than the near edge.
        expect(bottomViewportOffset).toBeGreaterThan(0);
        expect(topViewportOffset).toBeGreaterThan(bottomViewportOffset);
    });

    it('scales the half-width as tan of half the field of view', () => {
        const narrow = getPointsForViewport(step(), 40);
        const wide = getPointsForViewport(step(), 80);

        expect(wide.bottomViewportOffset).toBeGreaterThan(narrow.bottomViewportOffset);

        // The half-width is the opposite side of a right triangle whose other
        // side is the slant range, so it is range * tan(hFov / 2).
        const slantRange = distance(step().shootingPoint, step().firstElement.pointOnTheGround);
        expect(narrow.bottomViewportOffset).toBeCloseTo(slantRange * Math.tan((20 * Math.PI) / 180), 6);
    });

    it('swaps near and far for a backwards step', () => {
        const forwards = getPointsForViewport(step(), 60);
        const backwards = getPointsForViewport(step({ backwards: true }), 60);

        expect(backwards.bottomViewportOffset).toBeCloseTo(forwards.topViewportOffset, 12);
        expect(backwards.topViewportOffset).toBeCloseTo(forwards.bottomViewportOffset, 12);
    });
});

describe('stepFootprint', () => {
    it('returns four corners: near-left, near-right, far-right, far-left', () => {
        const ring = stepFootprint(step(), START, 0, 60);

        expect(ring).toHaveLength(4);
        for (const corner of ring) {
            expect(Number.isFinite(corner.lat)).toBe(true);
            expect(Number.isFinite(corner.lon)).toBe(true);
        }
    });

    it('straddles the track, near edge closer to the start than the far edge', () => {
        // Heading due north, so the track runs along a meridian and the two
        // near corners sit either side of the start point's longitude.
        const [nearLeft, nearRight, farRight, farLeft] = stepFootprint(step(), START, 0, 60);
        if (!nearLeft || !nearRight || !farRight || !farLeft) throw new Error('expected four corners');

        expect(nearLeft.lon).toBeLessThan(START.lon);
        expect(nearRight.lon).toBeGreaterThan(START.lon);

        // firstElement is 100 m out and lastElement 200 m, so the far pair is
        // further north.
        expect(farLeft.lat).toBeGreaterThan(nearLeft.lat);
        expect(farRight.lat).toBeGreaterThan(nearRight.lat);

        // The far edge is wider, matching the viewport offsets above.
        expect(farRight.lon - farLeft.lon).toBeGreaterThan(nearRight.lon - nearLeft.lon);
    });

    it('runs a backwards step in the opposite direction', () => {
        const forwards = stepFootprint(step(), START, 0, 60);
        const backwards = stepFootprint(step({ backwards: true }), START, 0, 60);

        // `backwards` steps carry an already-inverted heading, so the function
        // adds 180 to recover the direction of travel: the polygon lands on the
        // far side of the start point.
        expect(forwards.every(p => p.lat > START.lat)).toBe(true);
        expect(backwards.every(p => p.lat < START.lat)).toBe(true);
    });

    it('reverses which element is the near edge when the step is backwards', () => {
        // Not covered by the direction test above, and a real hazard: dropping
        // the near/far swap leaves both centres on the same element and the
        // polygon collapses to a line, while still pointing the right way.
        //
        // Pinning the positions rather than comparing them. An inequality here
        // passed under exactly that mutation: with both centres collapsed onto
        // one point, the comparison fell through to the sub-millimetre latitude
        // drift of a great circle running east-west, and its sign was luck.
        const midpoint = (ring: typeof forwards, a: number, b: number) => {
            const p = ring[a];
            const q = ring[b];
            if (!p || !q) throw new Error('expected four corners');
            return { lat: (p.lat + q.lat) / 2, lon: (p.lon + q.lon) / 2 };
        };
        const on = (distance: number, bearing: number) =>
            getGeoPointFromStartPointDistanceBearing(START, distance, bearing);

        const forwards = stepFootprint(step(), START, 0, 60);
        const backwards = stepFootprint(step({ backwards: true }), START, 0, 60);

        // firstElement images ground 100 m out, lastElement 200 m. Flying
        // forwards the near edge is the 100 m one; backwards it is the 200 m
        // one, and the whole quad is on the other side of the start point.
        // 6 decimal places of latitude is about 0.1 m.
        expect(midpoint(forwards, 0, 1).lat).toBeCloseTo(on(100, 0).lat, 6);
        expect(midpoint(forwards, 2, 3).lat).toBeCloseTo(on(200, 0).lat, 6);
        expect(midpoint(backwards, 0, 1).lat).toBeCloseTo(on(200, 180).lat, 6);
        expect(midpoint(backwards, 2, 3).lat).toBeCloseTo(on(100, 180).lat, 6);
    });

    it('follows the flight bearing', () => {
        const east = stepFootprint(step(), START, 90, 60);
        for (const corner of east) {
            expect(corner.lon).toBeGreaterThan(START.lon);
        }

        // The near edge's midpoint lies on the bearing the step was given.
        const [nearLeft, nearRight] = east;
        if (!nearLeft || !nearRight) throw new Error('expected four corners');
        const midpoint = { lat: (nearLeft.lat + nearRight.lat) / 2, lon: (nearLeft.lon + nearRight.lon) / 2 };
        expect(getBearingBetween2GeoPoints(START, midpoint)).toBeCloseTo(90, 3);
    });
});

describe('planFootprints', () => {
    it('produces one polygon per step, in order', () => {
        const first = step();
        const rings = planFootprints([first, step({ backwards: true }), step()], [0, 180, 0], START, 60);

        expect(rings).toHaveLength(3);
        expect(rings.every(ring => ring.length === 4)).toBe(true);
        expect(rings[0]).toStrictEqual(stepFootprint(first, START, 0, 60));
    });

    it('falls back to a zero heading when one is missing', () => {
        // getGeoSteps and the step list are computed separately; a short
        // headings array must not produce NaN coordinates on the map.
        const rings = planFootprints([step(), step()], [45], START, 60);

        expect(rings).toHaveLength(2);
        expect(rings[1]).toStrictEqual(stepFootprint(step(), START, 0, 60));
        for (const corner of rings.flat()) {
            expect(Number.isNaN(corner.lat)).toBe(false);
            expect(Number.isNaN(corner.lon)).toBe(false);
        }
    });

    it('returns nothing for an empty plan', () => {
        expect(planFootprints([], [], START, 60)).toStrictEqual([]);
    });
});
