import { describe, expect, it } from 'vitest';

import { MAVIC_PRO } from '../../src/core/camera/profiles';
import { Arc90Curve } from '../../src/core/curves/arc-90';
import { panoramaGeometryFor } from '../../src/core/imaging/strip-warp';
import {
    MIN_ROWS_PER_METRE_OF_HEIGHT,
    heightsFromDisparities,
    reliefRows,
    rowsPerGroundMetre,
    summariseHeights,
    tangentFromNadir,
} from '../../src/core/quality/height';
import { parallaxReport } from '../../src/core/quality/parallax';
import { plan } from '../../src/core/planner/plan';

const VIEW_POINT = { x: 0, y: 50 };
const { steps } = plan(new Arc90Curve(50, 50, 100, 50), VIEW_POINT);
const panorama = panoramaGeometryFor(steps, VIEW_POINT, MAVIC_PRO, { width: 1200, maxHeight: 8000 });
const seams = parallaxReport(steps).seams;

describe('panorama scale', () => {
    it('is signed, because ground further along the track appears higher up', () => {
        // Losing the sign would move every object the wrong way, by exactly
        // twice as much as leaving it alone.
        const scale = rowsPerGroundMetre(panorama, steps[2]?.centerElement.pointOnTheCurve ?? { x: 100, y: 0 });
        expect(scale).toBeLessThan(0);
    });

    it('changes down the picture, which is why it is measured rather than assumed', () => {
        const near = Math.abs(rowsPerGroundMetre(panorama, steps[0]?.centerElement.pointOnTheCurve ?? { x: 0, y: 0 }));
        const far = Math.abs(
            rowsPerGroundMetre(panorama, steps[steps.length - 1]?.centerElement.pointOnTheCurve ?? { x: 0, y: 0 })
        );

        expect(near).toBeGreaterThan(0);
        expect(far).toBeGreaterThan(0);
        expect(near).not.toBeCloseTo(far, 3);
    });
});

describe('height from disparity', () => {
    const measurable = seams.find(seam => seam.slidePerMetre > 0.3);

    it('turns rows of disagreement into metres, using the base it already knows', () => {
        expect(measurable).toBeDefined();
        if (!measurable) return;

        const rows = 7;
        const heights = heightsFromDisparities(measurable, new Int32Array([0, 4, 8]), rows);

        // h = d / (slidePerMetre * rowsPerMetre), and nothing here is fitted.
        expect(heights[0]).toBe(0);
        expect(heights[2] ?? 0).toBeCloseTo((heights[1] ?? 0) * 2, 6);
        expect(heights[1] ?? 0).toBeCloseTo(4 / (measurable.slidePerMetre * rows), 6);
    });

    it('refuses to measure a seam with no parallax to measure', () => {
        // The mode's central irony: height comes from the disagreement, and
        // every other mode exists to make the disagreement small. A seam whose
        // frames agree has nothing to say, and dividing by its near-zero scale
        // would turn quantisation noise into tens of metres.
        const flat = seams.find(seam => seam.slidePerMetre === 0);
        expect(flat).toBeDefined();
        if (!flat) return;

        expect([...heightsFromDisparities(flat, new Int32Array([9, 9, 9]), 7)]).toEqual([0, 0, 0]);
    });

    it('discards a reading that puts the ground halfway to the aircraft', () => {
        expect(measurable).toBeDefined();
        if (!measurable) return;

        const absurd = heightsFromDisparities(measurable, new Int32Array([100_000]), 7);
        expect(absurd[0]).toBe(0);
    });

    it('states the precision it needs, rather than leaving it implicit', () => {
        expect(MIN_ROWS_PER_METRE_OF_HEIGHT).toBeGreaterThan(0);
        // Half a row per metre: one measured row means at most two metres.
        expect(1 / MIN_ROWS_PER_METRE_OF_HEIGHT).toBe(2);
    });
});

describe('relief displacement', () => {
    it('is zero for something lying on the ground', () => {
        // toBeCloseTo, not toBe: multiplying zero by a negative gives -0, which
        // Object.is separates from 0 and arithmetic does not.
        expect(reliefRows(0, 1.4, -7)).toBeCloseTo(0, 12);
    });

    it('grows with height and with the angle from nadir', () => {
        expect(Math.abs(reliefRows(10, 1.4, -7))).toBeGreaterThan(Math.abs(reliefRows(5, 1.4, -7)));
        expect(Math.abs(reliefRows(10, 2.8, -7))).toBeGreaterThan(Math.abs(reliefRows(10, 1.4, -7)));
    });

    it('reverses when the aircraft is on the other side of the patch', () => {
        expect(Math.sign(reliefRows(10, 1.4, -7))).toBe(-Math.sign(reliefRows(10, -1.4, -7)));
    });
});

describe('tangentFromNadir', () => {
    it('is the horizontal run over the drop', () => {
        expect(tangentFromNadir({ x: 100, y: 50 }, { x: 0, y: 0 })).toBeCloseTo(2, 12);
        expect(tangentFromNadir({ x: 0, y: 50 }, { x: 0, y: 0 })).toBe(0);
    });

    it('answers zero rather than infinity for an aircraft at ground level', () => {
        expect(tangentFromNadir({ x: 100, y: 0 }, { x: 0, y: 0 })).toBe(0);
        expect(tangentFromNadir({ x: 100, y: -5 }, { x: 0, y: 0 })).toBe(0);
    });
});

describe('summariseHeights', () => {
    it('reports nothing when nothing stood high enough', () => {
        const summary = summariseHeights([new Float64Array([0, 0, 0])]);
        expect(summary.tallest).toBeNaN();
        expect(summary.measuredColumns).toBe(0);
    });

    it('takes a high percentile rather than the maximum', () => {
        // One column of mismatched texture should not be allowed to report a
        // fifty-metre tree over a scene of two-metre hedges.
        const profile = new Float64Array(200).fill(2);
        profile[0] = 50;

        const summary = summariseHeights([profile]);
        expect(summary.tallest).toBeLessThan(50);
        expect(summary.median).toBeCloseTo(2, 6);
    });
});
