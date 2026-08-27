import { describe, expect, it } from 'vitest';

import { MAVIC_PRO } from '../../src/core/camera/profiles';

import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import { NodalSweepCurve } from '../../src/core/curves/nodal-sweep';
import { getGeoSteps } from '../../src/core/geo/flight-path';
import { plan } from '../../src/core/planner/plan';
import { parallaxReport, slideMetres } from '../../src/core/quality/parallax';
import {
    ARC_STRIPS,
    DENSE_LINEAR,
    PHOTOGRAMMETRY,
    CAPTURE_STRATEGIES,
    DEFAULT_CAPTURE_STRATEGY,
    FINE_STRIPS,
    NODAL_SWEEP,
    captureStrategyById,
    defaultDensity,
    densityById,
} from '../../src/core/strategy/capture';

const curve = (): Arc90Curve => new Arc90Curve(50, 50, 50, 50);
const VIEW_POINT = { x: 0, y: 50 };

describe('capture strategy registry', () => {
    it('offers every strategy that exists', () => {
        // A strategy can be written, exported and unit-tested while never
        // reaching the registry, and then it simply is not in the product. That
        // happened to the dense pass, and only an end-to-end test noticed.
        for (const strategy of [ARC_STRIPS, FINE_STRIPS, DENSE_LINEAR, NODAL_SWEEP, PHOTOGRAMMETRY]) {
            expect(CAPTURE_STRATEGIES).toContain(strategy);
        }
    });

    it('has unique ids', () => {
        const ids = CAPTURE_STRATEGIES.map(strategy => strategy.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives every strategy at least one density, with unique ids within it', () => {
        for (const strategy of CAPTURE_STRATEGIES) {
            expect(strategy.densities.length).toBeGreaterThan(0);
            const ids = strategy.densities.map(density => density.id);
            expect(new Set(ids).size).toBe(ids.length);
        }
    });

    it('defaults to the incumbent plan, so the page opens on what it always showed', () => {
        expect(DEFAULT_CAPTURE_STRATEGY).toBe(ARC_STRIPS);
    });

    it('resolves an unknown id to the default rather than throwing', () => {
        expect(captureStrategyById('nope')).toBe(DEFAULT_CAPTURE_STRATEGY);
        expect(captureStrategyById('fine-strips')).toBe(FINE_STRIPS);
    });

    it('resolves an unknown density to the strategy default', () => {
        expect(densityById(FINE_STRIPS, 'nope')).toBe(defaultDensity(FINE_STRIPS));
        expect(densityById(FINE_STRIPS, 'finest').id).toBe('finest');
    });

    it('refuses a strategy with no densities instead of returning undefined', () => {
        expect(() => defaultDensity({ ...ARC_STRIPS, densities: [] })).toThrow(/declares no densities/);
    });
});

describe('arc-strips', () => {
    it('is byte-for-byte the plan the bare planner produces', () => {
        // The comparison baseline has to *be* the incumbent, not resemble it.
        expect(ARC_STRIPS.build(curve(), VIEW_POINT, MAVIC_PRO)).toEqual(plan(curve(), VIEW_POINT));
    });
});

describe('fine-strips', () => {
    // Named curves, not a property: the ladder is monotone on realistic
    // geometry and not universally so. Picking the presets from one curve is
    // exactly how the first attempt shipped an "8x" step that produced more
    // frames than the "16x" one on the form's own defaults.
    const REALISTIC: [string, Arc90Curve | Arc135Curve][] = [
        ['the form defaults', new Arc90Curve(50, 50, 100, 50)],
        ['a tight 90 arc', new Arc90Curve(50, 50, 50, 50)],
        ['a 135 arc', new Arc135Curve(50, 50, 100, 50)],
        ['a large 90 arc', new Arc90Curve(200, 200, 200, 200)],
    ];

    it.each(REALISTIC)('trades frames for seam slide across its densities, on %s', (_name, shape) => {
        let previousFrames = ARC_STRIPS.build(shape, VIEW_POINT, MAVIC_PRO).steps.length;
        let previousSlide = parallaxReport(ARC_STRIPS.build(shape, VIEW_POINT, MAVIC_PRO).steps).worstSlidePerMetre;

        for (const density of FINE_STRIPS.densities) {
            const steps = FINE_STRIPS.build(shape, VIEW_POINT, MAVIC_PRO, density).steps;
            const slide = parallaxReport(steps).worstSlidePerMetre;

            expect(steps.length).toBeGreaterThan(previousFrames);
            expect(slide).toBeLessThan(previousSlide);

            previousFrames = steps.length;
            previousSlide = slide;
        }
    });

    it('holds the frames-times-slide product near the measured constant', () => {
        // The pushbroom result in pilot units: slide buys back frames one for
        // one. Measured at 10.4 to 11.8 across the range on this curve; the band
        // is wide enough to survive allocator jitter and narrow enough that a
        // real regression in the trade would break it.
        for (const density of FINE_STRIPS.densities) {
            const steps = FINE_STRIPS.build(curve(), VIEW_POINT, MAVIC_PRO, density).steps;
            const product = steps.length * parallaxReport(steps).worstSlidePerMetre;
            expect(product).toBeGreaterThan(8);
            expect(product).toBeLessThan(16);
        }
    });
});

describe('nodal-sweep', () => {
    it('photographs everything from one point', () => {
        const steps = NODAL_SWEEP.build(curve(), VIEW_POINT, MAVIC_PRO).steps;
        const hovers = new Set(steps.map(step => `${step.shootingPoint.x},${step.shootingPoint.y}`));

        expect(hovers.size).toBe(1);
        expect(steps.every(step => !step.backwards)).toBe(true);
    });

    it('has exactly zero shooting error, not merely a small one', () => {
        // Both sides of the subtraction in error-model.ts are now the same
        // expression, so this is bit-identical zero and deserves toBe, not
        // toBeCloseTo.
        expect(Math.max(...plan(new NodalSweepCurve(curve()), VIEW_POINT).shootingErrors)).toBe(0);
    });

    it('slides by exactly nothing, at any object height', () => {
        const report = parallaxReport(NODAL_SWEEP.build(curve(), VIEW_POINT, MAVIC_PRO).steps);

        expect(report.worstSlidePerMetre).toBe(0);
        expect(slideMetres(report, 10).worst).toBe(0);
        expect(slideMetres(report, 40).worst).toBe(0);
    });

    it('buys resolution back with narrower frames', () => {
        // The honest cost of one viewpoint is foreshortening, and the only
        // lever against it is spending more frames on the same angular span.
        const wide = NODAL_SWEEP.build(curve(), VIEW_POINT, MAVIC_PRO, densityById(NODAL_SWEEP, 'wide')).steps.length;
        const narrow = NODAL_SWEEP.build(curve(), VIEW_POINT, MAVIC_PRO, densityById(NODAL_SWEEP, 'narrow')).steps
            .length;

        expect(narrow).toBeGreaterThan(wide);
    });

    it('delegates the ground and the surface to the curve it wraps', () => {
        const inner = new Arc135Curve(50, 50, 50, 50);
        const sweep = new NodalSweepCurve(inner);

        expect(sweep.getTotalLength()).toBe(inner.getTotalLength());
        expect(sweep.getPointOnTheGround(10)).toEqual(inner.getPointOnTheGround(10));
        expect(sweep.getPointOnTheCurve(10)).toEqual(inner.getPointOnTheCurve(10));
        expect(sweep.getShootingPoint(10, VIEW_POINT)).toBe(VIEW_POINT);
    });

    it('refuses a curve whose ground starts at the viewer', () => {
        const degenerate = {
            getTotalLength: (): number => 10,
            getPointOnTheGround: (): { x: number; y: number } => ({ x: 0, y: 0 }),
            getPointOnTheCurve: (): { x: number; y: number } => ({ x: 0, y: 0 }),
            getShootingPoint: (): { x: number; y: number } => ({ x: 0, y: 0 }),
        };

        expect(() => new NodalSweepCurve(degenerate)).toThrow(RangeError);
    });
});

describe('mission spacing for a single hover', () => {
    const start = { lat: 55.75, lon: 37.62 };
    const direction = { lat: 55.76, lon: 37.62 };

    it('would walk the hover along the track at the default spacing', () => {
        // Not a hypothetical failure: this is what shipping nodal-sweep without
        // the override would do, while the plan on screen still said zero.
        const steps = NODAL_SWEEP.build(curve(), VIEW_POINT, MAVIC_PRO, densityById(NODAL_SWEEP, 'narrow')).steps;
        const spread = new Set(getGeoSteps(start, direction, steps).map(geoStep => geoStep.geoPoint.lat));

        expect(spread.size).toBeGreaterThan(1);
    });

    it('places every waypoint where it was asked for when the strategy says so', () => {
        const steps = NODAL_SWEEP.build(curve(), VIEW_POINT, MAVIC_PRO, densityById(NODAL_SWEEP, 'narrow')).steps;
        const geoSteps = getGeoSteps(start, direction, steps, { minSpacing: NODAL_SWEEP.minWaypointSpacing });

        expect(new Set(geoSteps.map(geoStep => geoStep.geoPoint.lat)).size).toBe(1);
        expect(new Set(geoSteps.map(geoStep => geoStep.geoPoint.lon)).size).toBe(1);
    });

    it('leaves the strip strategies on the incumbent spacing', () => {
        expect(ARC_STRIPS.minWaypointSpacing).toBeGreaterThan(0);
        expect(FINE_STRIPS.minWaypointSpacing).toBe(ARC_STRIPS.minWaypointSpacing);
    });
});

describe('dense-linear', () => {
    it('goes further than fine strips, which is the only thing separating them', () => {
        // The two look identical in the comparison table — same path, same
        // altitudes, fewer metres of slide. What actually distinguishes this
        // one is that consecutive frames end up close enough for optical flow
        // to match them, and that costs frames.
        const fine = FINE_STRIPS.build(curve(), VIEW_POINT, MAVIC_PRO, densityById(FINE_STRIPS, 'finest'));
        const dense = DENSE_LINEAR.build(curve(), VIEW_POINT, MAVIC_PRO);

        expect(dense.steps.length).toBeGreaterThan(fine.steps.length);
        expect(parallaxReport(dense.steps).worstSlidePerMetre).toBeLessThan(
            parallaxReport(fine.steps).worstSlidePerMetre
        );
    });

    it('recommends the flow blend where it can work, and offers it everywhere', () => {
        // Offered everywhere on purpose: watching a mode produce no change is
        // a finding about the flight, and a picker that refuses to run it
        // cannot tell you that. What varies is the expectation, not the access.
        for (const strategy of [ARC_STRIPS, FINE_STRIPS, DENSE_LINEAR, NODAL_SWEEP]) {
            expect(strategy.processingModes, strategy.id).toContain('flow-blend');
            expect(strategy.processingModes, strategy.id).toContain('depth-warp');
        }

        // Fifteen degrees between frames puts the ground further than any
        // sensible search covers, and one viewpoint has no parallax at all.
        expect(DENSE_LINEAR.recommendedProcessing).toContain('flow-blend');
        expect(FINE_STRIPS.recommendedProcessing).toContain('flow-blend');
        expect(ARC_STRIPS.recommendedProcessing).not.toContain('flow-blend');
        expect(NODAL_SWEEP.recommendedProcessing).not.toContain('flow-blend');

        // And the height measurement wants the opposite: parallax to measure.
        expect(ARC_STRIPS.recommendedProcessing).toContain('depth-warp');
        expect(DENSE_LINEAR.recommendedProcessing).not.toContain('depth-warp');
    });

    it('offers nothing for the survey, because its frames do not map to strips', () => {
        // The one genuine impossibility rather than a discouragement: several
        // lines cover the same ground, so several frames claim the same rows.
        expect(PHOTOGRAMMETRY.processingModes).toEqual([]);
    });
});
