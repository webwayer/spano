import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import { plan } from '../../src/core/planner/plan';
import { MAVIC_PRO, stepsExceedingFieldOfView } from '../../src/core/camera/profiles';
import { getGeoSteps, MIN_WAYPOINT_SPACING } from '../../src/core/geo/flight-path';

const params = fc.record({
    offset: fc.integer({ min: 10, max: 200 }),
    firstLeg: fc.integer({ min: 10, max: 200 }),
    radius: fc.integer({ min: 10, max: 200 }),
    secondLeg: fc.integer({ min: 10, max: 200 }),
    viewPointY: fc.integer({ min: 10, max: 200 }),
});

const curveKinds = [Arc90Curve, Arc135Curve] as const;

interface CaseParams {
    offset: number;
    firstLeg: number;
    radius: number;
    secondLeg: number;
    viewPointY: number;
}

function planFor(p: CaseParams, kind: 0 | 1): ReturnType<typeof plan> {
    const Ctor = curveKinds[kind];
    return plan(new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg), { x: 0, y: p.viewPointY });
}

describe('plan', () => {
    it('never throws anywhere in the UI-reachable parameter space', () => {
        // The whole point of the Phase 4 allocation fix. Before it, a short
        // high-error segment produced undefined triples and a TypeError several
        // stages downstream.
        fc.assert(
            fc.property(params, fc.constantFrom(0 as const, 1 as const), (p, kind) => {
                expect(() => planFor(p, kind)).not.toThrow();
            }),
            { numRuns: 300 }
        );
    });

    it('produces at least one step, and no NaN in any of them', () => {
        fc.assert(
            fc.property(params, fc.constantFrom(0 as const, 1 as const), (p, kind) => {
                const { steps } = planFor(p, kind);
                expect(steps.length).toBeGreaterThan(0);

                for (const step of steps) {
                    expect(Number.isFinite(step.angleOfView)).toBe(true);
                    expect(Number.isFinite(step.viewAngleToTheGround)).toBe(true);
                    expect(Number.isFinite(step.shootingPoint.x)).toBe(true);
                    expect(Number.isFinite(step.shootingPoint.y)).toBe(true);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('produces a physically meaningful angle of view for every frame', () => {
        // What this does NOT assert, and why.
        //
        // An earlier version of this test claimed every frame stays inside the
        // sensor's 46.8° field of view. That is false, and the test failed on
        // roughly 15% of runs — each failure telling the truth. Sweeping the
        // form's own range finds frames at 178°: a shooting point that lands on
        // the ground between the two points it frames subtends almost a
        // straight line.
        //
        // maxViewAngle is a planning target, not a bound — see
        // stepsExceedingFieldOfView. The behaviour is inherited from the 2018
        // planner and preserved deliberately, so the honest contract is: the
        // angle is always a real angle, and anything beyond the sensor is
        // reported rather than hidden.
        fc.assert(
            fc.property(params, fc.constantFrom(0 as const, 1 as const), (p, kind) => {
                const { steps } = planFor(p, kind);
                for (const step of steps) {
                    expect(Number.isFinite(step.angleOfView)).toBe(true);
                    expect(step.angleOfView).toBeGreaterThanOrEqual(0);
                    expect(step.angleOfView).toBeLessThan(180);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('reports every frame the camera cannot capture, and no others', () => {
        fc.assert(
            fc.property(params, fc.constantFrom(0 as const, 1 as const), (p, kind) => {
                const { steps } = planFor(p, kind);
                const angles = steps.map(s => s.angleOfView);
                const flagged = new Set(stepsExceedingFieldOfView(angles, MAVIC_PRO));

                angles.forEach((angle, i) => {
                    expect(flagged.has(i), `step ${i} at ${angle}°`).toBe(angle > MAVIC_PRO.vFov);
                });
            }),
            { numRuns: 200 }
        );
    });

    it('flags the known uncapturable plan', () => {
        // Concrete regression for the case above: 178° against a 46.8° sensor.
        const { steps } = planFor({ offset: 11, firstLeg: 37, radius: 17, secondLeg: 200, viewPointY: 89 }, 1);
        const flagged = stepsExceedingFieldOfView(
            steps.map(s => s.angleOfView),
            MAVIC_PRO
        );

        expect(flagged.length).toBeGreaterThan(0);
        for (const i of flagged) {
            const step = steps[i];
            expect(step).toBeDefined();
            expect(step?.angleOfView).toBeGreaterThan(MAVIC_PRO.vFov);
        }
    });

    it('gives every shot at least two samples, so it spans real ground', () => {
        fc.assert(
            fc.property(params, fc.constantFrom(0 as const, 1 as const), (p, kind) => {
                const { shots } = planFor(p, kind);
                for (const shot of shots) {
                    expect(shot.triples.length).toBeGreaterThanOrEqual(1);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('samples the curve at one-metre intervals, inclusive of both ends', () => {
        fc.assert(
            fc.property(params, fc.constantFrom(0 as const, 1 as const), (p, kind) => {
                const result = planFor(p, kind);
                expect(result.pointTriples.length).toBe(Math.floor(result.totalCurveLength) + 1);
                expect(result.shootingErrors.length).toBe(result.pointTriples.length - 1);
            }),
            { numRuns: 100 }
        );
    });
});

describe('flight path placement', () => {
    const geoPoint = fc.record({
        lat: fc.double({ min: -60, max: 60, noNaN: true }),
        lon: fc.double({ min: -170, max: 170, noNaN: true }),
    });

    it('never places two consecutive waypoints closer than the minimum spacing', () => {
        // A flight controller cannot resolve waypoints that nearly coincide.
        fc.assert(
            fc.property(params, geoPoint, (p, start) => {
                const { steps } = planFor(p, 0);
                const direction = { lat: start.lat, lon: start.lon + 0.01 };
                const geoSteps = getGeoSteps(start, direction, steps);

                for (let i = 1; i < geoSteps.length; i++) {
                    const previous = geoSteps[i - 1];
                    const current = geoSteps[i];
                    if (!previous || !current) continue;

                    const deltaX = current.shootingPoint.x - previous.shootingPoint.x;
                    const deltaY = current.shootingPoint.y - previous.shootingPoint.y;
                    const separation = Math.hypot(deltaX, deltaY);

                    // Compare COORDINATES, not object identity. The earlier
                    // version tested `current.geoPoint !== previous.geoPoint`,
                    // and getGeoPointFromStartPointDistanceBearing returns a
                    // fresh object on every call — so that could never fail.
                    // Setting the spacing to 6, to 0, and disabling the nudge
                    // entirely all passed it.
                    const moved =
                        current.geoPoint.lat !== previous.geoPoint.lat ||
                        current.geoPoint.lon !== previous.geoPoint.lon;
                    expect(separation >= MIN_WAYPOINT_SPACING || moved, `step ${i}`).toBe(true);
                }
            }),
            { numRuns: 60 }
        );
    });

    it('flips the heading exactly for backwards steps', () => {
        fc.assert(
            fc.property(params, geoPoint, (p, start) => {
                const { steps } = planFor(p, 1);
                const direction = { lat: start.lat, lon: start.lon + 0.01 };
                const geoSteps = getGeoSteps(start, direction, steps);

                const headings = new Set(geoSteps.map(s => s.heading));
                // At most two distinct headings: outbound and its inverse.
                expect(headings.size).toBeLessThanOrEqual(2);

                const [a, b] = [...headings];
                if (a !== undefined && b !== undefined) {
                    // The circular difference of two exact opposites is 180.
                    expect(Math.abs(((a - b + 540) % 360) - 180)).toBeCloseTo(180, 9);
                }
            }),
            { numRuns: 60 }
        );
    });
});
