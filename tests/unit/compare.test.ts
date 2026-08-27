import { describe, expect, it } from 'vitest';

import { DEFAULT_ALTITUDE_CEILING, MAVIC_PRO } from '../../src/core/camera/profiles';
import { Arc90Curve } from '../../src/core/curves/arc-90';
import { compareStrategies, measureStrategy, type ComparisonOptions } from '../../src/core/quality/compare';
import { ARC_STRIPS, CAPTURE_STRATEGIES, FINE_STRIPS, NODAL_SWEEP } from '../../src/core/strategy/capture';

const CURVE = new Arc90Curve(50, 50, 50, 50);
const VIEW_POINT = { x: 0, y: 50 };
const OPTIONS: ComparisonOptions = {
    objectHeight: 10,
    camera: MAVIC_PRO,
    altitudeCeiling: DEFAULT_ALTITUDE_CEILING,
    frameHeightPx: 3648,
};

describe('measureStrategy', () => {
    it('measures the incumbent plan at the figure this project was built to explain', () => {
        const row = measureStrategy(ARC_STRIPS, CURVE, VIEW_POINT, OPTIONS);

        expect(row.frameCount).toBe(10);
        expect(row.worstSlideMetres).toBeCloseTo(14.16, 1);
        // The number that decides whether anyone notices: roughly 400 pixels of
        // slide, in a frame 3648 pixels tall.
        expect(row.worstSlidePixels).toBeGreaterThan(300);
    });

    it('finds the ceiling breach the default plan already has', () => {
        // Not introduced here — the incumbent plan climbs to 150 m, over both
        // the EASA and FAA limits. Worth surfacing in the comparison rather
        // than leaving it to the separate warning.
        const row = measureStrategy(ARC_STRIPS, CURVE, VIEW_POINT, OPTIONS);

        expect(row.maxAltitudeMetres).toBeGreaterThan(DEFAULT_ALTITUDE_CEILING);
        expect(row.framesOverCeiling).toBeGreaterThan(0);
    });

    it('reports a single hover as flying nowhere and sliding by nothing', () => {
        const row = measureStrategy(NODAL_SWEEP, CURVE, VIEW_POINT, OPTIONS);

        expect(row.pathLengthMetres).toBe(0);
        expect(row.maxAltitudeMetres).toBe(VIEW_POINT.y);
        expect(row.worstSlideMetres).toBe(0);
        expect(row.worstSlidePixels).toBe(0);
        expect(row.framesOverCeiling).toBe(0);
    });

    it('flies the same path when only the strip width changes', () => {
        // fine-strips is the same flight, sampled harder. The path length is a
        // polyline over hover points, so a denser plan measures marginally
        // longer where a sparser one cut the corner; anything beyond that would
        // mean the strategy had moved the aircraft, which it does not claim to.
        const baseline = measureStrategy(ARC_STRIPS, CURVE, VIEW_POINT, OPTIONS);
        const fine = measureStrategy(FINE_STRIPS, CURVE, VIEW_POINT, OPTIONS, FINE_STRIPS.densities[2]);

        const drift = Math.abs(fine.pathLengthMetres - baseline.pathLengthMetres) / baseline.pathLengthMetres;
        expect(drift).toBeLessThan(0.01);
        expect(fine.pathLengthMetres).toBeGreaterThanOrEqual(baseline.pathLengthMetres);
        expect(fine.maxAltitudeMetres).toBeCloseTo(baseline.maxAltitudeMetres, 6);
        expect(fine.worstSlideMetres).toBeLessThan(baseline.worstSlideMetres);
    });

    it('carries the density it measured, so a table row can name itself', () => {
        const row = measureStrategy(FINE_STRIPS, CURVE, VIEW_POINT, OPTIONS, FINE_STRIPS.densities[1]);

        expect(row.densityId).toBe('finer');
        expect(row.densityLabel).toBe(FINE_STRIPS.densities[1]?.label);
    });

    it('scales the slide with the height of the objects on the ground', () => {
        const short = measureStrategy(ARC_STRIPS, CURVE, VIEW_POINT, { ...OPTIONS, objectHeight: 2 });
        const tall = measureStrategy(ARC_STRIPS, CURVE, VIEW_POINT, { ...OPTIONS, objectHeight: 20 });

        expect(tall.worstSlideMetres).toBeGreaterThan(short.worstSlideMetres);
    });
});

describe('compareStrategies', () => {
    it('produces a row per strategy per density, in registry order', () => {
        const rows = compareStrategies(CAPTURE_STRATEGIES, CURVE, VIEW_POINT, OPTIONS);
        const expected = CAPTURE_STRATEGIES.reduce((total, strategy) => total + strategy.densities.length, 0);

        expect(rows).toHaveLength(expected);
        expect(rows[0]?.strategyId).toBe('arc-strips');
    });

    it('ranks nothing, and leaves the trade to the caller', () => {
        const rows = compareStrategies(CAPTURE_STRATEGIES, CURVE, VIEW_POINT, OPTIONS);
        const cheapest = rows.reduce((best, row) => (row.frameCount < best.frameCount ? row : best));
        const steadiest = rows.reduce((best, row) => (row.worstSlideMetres < best.worstSlideMetres ? row : best));

        // The cheapest flight and the steadiest seams are the same row here
        // only because a single hover wins both — and it loses on the thing the
        // table cannot show, which is how coarse the far ground becomes.
        expect(cheapest.strategyId).toBe('nodal-sweep');
        expect(steadiest.worstSlideMetres).toBe(0);
    });
});
