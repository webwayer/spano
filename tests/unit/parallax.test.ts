import { describe, expect, it } from 'vitest';

import { MAVIC_PRO } from '../../src/core/camera/profiles';
import {
    groundSampleDistance,
    parallaxReport,
    seamSlideMetres,
    slideMetres,
    slidePixels,
} from '../../src/core/quality/parallax';
import type { Point, Step, Triple } from '../../src/core/types';

function tripleAt(groundX: number, shootingPoint: Point): Triple {
    return {
        pointOnTheCurve: { x: groundX, y: 0 },
        pointOnTheGround: { x: groundX, y: 0 },
        shootingPoint,
    };
}

/**
 * A step is mostly derived fields; only `shootingPoint` and the ground point of
 * `firstElement` matter here, so the rest is filled with plausible constants.
 */
function stepAt(shootingPoint: Point, firstGroundX: number, lastGroundX: number): Step {
    return {
        shotOn: 'center',
        shootingPoint,
        shootedPoint: { x: (firstGroundX + lastGroundX) / 2, y: 0 },
        angleOfView: 10,
        viewAngleToTheGround: -45,
        backwards: false,
        firstElement: tripleAt(firstGroundX, shootingPoint),
        centerElement: tripleAt((firstGroundX + lastGroundX) / 2, shootingPoint),
        lastElement: tripleAt(lastGroundX, shootingPoint),
    };
}

describe('parallaxReport', () => {
    it('measures the disagreement between the two frames meeting at a seam', () => {
        // Cameras 50 m either side of the seam patch, both at 100 m: the patch
        // sits at tan = -0.5 from one and +0.5 from the other.
        const steps = [stepAt({ x: 0, y: 100 }, 0, 50), stepAt({ x: 100, y: 100 }, 50, 100)];

        const report = parallaxReport(steps);

        expect(report.seams).toHaveLength(1);
        expect(report.seams[0]?.slidePerMetre).toBeCloseTo(1, 12);
        expect(report.worstSlidePerMetre).toBeCloseTo(1, 12);
        expect(report.meanSlidePerMetre).toBeCloseTo(1, 12);
        expect(report.degenerateSeams).toEqual([]);
    });

    it('stays at zero from one viewpoint even when the object out-tops the aircraft', () => {
        // Each displacement is separately unbounded there; they are the same
        // unbounded expression, so the seam does not open.
        const hover = { x: 0, y: 20 };
        const report = parallaxReport([stepAt(hover, 0, 50), stepAt(hover, 50, 100)]);

        expect(slideMetres(report, 60).worst).toBe(0);
    });

    it('reports exactly zero when both frames are shot from the same point', () => {
        // This is the whole promise of a gimbal-only sweep, stated as algebra
        // rather than measured: one shooting point means one angle to the patch.
        const hover = { x: 0, y: 100 };
        const steps = [stepAt(hover, 0, 50), stepAt(hover, 50, 100), stepAt(hover, 100, 150)];

        const report = parallaxReport(steps);

        expect(report.worstSlidePerMetre).toBe(0);
        expect(report.meanSlidePerMetre).toBe(0);
    });

    it('produces one seam per gap between steps', () => {
        const steps = [
            stepAt({ x: 0, y: 100 }, 0, 10),
            stepAt({ x: 10, y: 100 }, 10, 20),
            stepAt({ x: 20, y: 100 }, 20, 30),
        ];

        expect(parallaxReport(steps).seams.map(seam => seam.seamIndex)).toEqual([0, 1]);
    });

    it('flags a seam the aircraft flies at or below ground level, instead of printing a number', () => {
        const steps = [stepAt({ x: 0, y: 100 }, 0, 50), stepAt({ x: 100, y: 0 }, 50, 100)];

        const report = parallaxReport(steps);

        expect(report.degenerateSeams).toEqual([0]);
        expect(report.seams[0]?.slidePerMetre).toBeNaN();
    });

    it('treats a negative altitude as degenerate too', () => {
        // Not hypothetical: Arc135Curve(10, 10, 10, 10) with the viewpoint at
        // 200 m puts a shooting point at -101.7 m.
        const steps = [stepAt({ x: 0, y: -101.7 }, 0, 50), stepAt({ x: 100, y: 100 }, 50, 100)];

        expect(parallaxReport(steps).degenerateSeams).toEqual([0]);
    });

    it('answers zero for a plan with no seams, because nothing can slide', () => {
        for (const steps of [[], [stepAt({ x: 0, y: 100 }, 0, 50)]]) {
            const report = parallaxReport(steps);
            expect(report.seams).toHaveLength(0);
            expect(report.worstSlidePerMetre).toBe(0);
            expect(report.meanSlidePerMetre).toBe(0);
        }
    });

    it('answers NaN when seams exist but none could be measured', () => {
        // Distinct from the case above on purpose. Printing 0.00 m for a plan
        // that was never measured would read as "this one is perfect".
        const steps = [stepAt({ x: 0, y: -5 }, 0, 50), stepAt({ x: 100, y: -5 }, 50, 100)];

        const report = parallaxReport(steps);

        expect(report.seams).toHaveLength(1);
        expect(report.worstSlidePerMetre).toBeNaN();
        expect(report.meanSlidePerMetre).toBeNaN();
    });

    it('averages over the measurable seams and ignores the rest', () => {
        const steps = [
            stepAt({ x: 0, y: 100 }, 0, 50),
            stepAt({ x: 100, y: 100 }, 50, 100),
            stepAt({ x: 150, y: 0 }, 100, 150),
        ];

        const report = parallaxReport(steps);

        expect(report.degenerateSeams).toEqual([1]);
        expect(report.meanSlidePerMetre).toBeCloseTo(1, 12);
    });
});

describe('seamSlideMetres', () => {
    const steps = [stepAt({ x: 0, y: 100 }, 0, 50), stepAt({ x: 100, y: 100 }, 50, 100)];
    const seam = parallaxReport(steps).seams[0];

    it('exceeds the linearised estimate, by the factor the approximation drops', () => {
        // Exact: (S.x - P.x) * h / (S.y - h) either side, so 500/90 each way.
        // Linearised: h * 1.0 = 10 m. The gap is H/(H-h) = 100/90.
        expect(seam).toBeDefined();
        if (!seam) return;

        expect(seamSlideMetres(seam, 10)).toBeCloseTo(11.1111111, 6);
        expect(seam.slidePerMetre * 10).toBeCloseTo(10, 12);
    });

    it('converges on the linearised estimate as the object gets short', () => {
        expect(seam).toBeDefined();
        if (!seam) return;

        // The gap is H/(H-h), so it closes linearly as h shrinks.
        expect(seamSlideMetres(seam, 1e-4) / 1e-4).toBeCloseTo(seam.slidePerMetre, 5);
    });

    it('is infinite once the object reaches the aircraft', () => {
        expect(seam).toBeDefined();
        if (!seam) return;

        expect(seamSlideMetres(seam, 100)).toBe(Infinity);
        expect(seamSlideMetres(seam, 150)).toBe(Infinity);
    });

    it('is zero for an object of no height', () => {
        expect(seam).toBeDefined();
        if (!seam) return;

        expect(seamSlideMetres(seam, 0)).toBe(0);
    });
});

describe('slideMetres', () => {
    it('aggregates the exact slide across a plan', () => {
        const steps = [stepAt({ x: 0, y: 100 }, 0, 50), stepAt({ x: 100, y: 100 }, 50, 100)];

        expect(slideMetres(parallaxReport(steps), 10).worst).toBeCloseTo(11.1111111, 6);
    });

    it('keeps the no-seam answer at zero', () => {
        expect(slideMetres(parallaxReport([]), 10)).toEqual({ worst: 0, mean: 0 });
    });
});

describe('groundSampleDistance', () => {
    it('matches the nadir footprint of the Mavic Pro at 100 m', () => {
        // 2 * 100 * tan(23.4 deg) / 3000 px, about 2.9 cm per pixel.
        expect(groundSampleDistance(MAVIC_PRO, 100, 3000)).toBeCloseTo(0.0288492, 7);
    });

    it('scales with altitude', () => {
        expect(groundSampleDistance(MAVIC_PRO, 200, 3000)).toBeCloseTo(
            2 * groundSampleDistance(MAVIC_PRO, 100, 3000),
            12
        );
    });
});

describe('slidePixels', () => {
    it('turns metres of slide into the unit that decides whether it is visible', () => {
        expect(slidePixels(11.111, 0.0288492)).toBeCloseTo(385.14, 2);
    });
});

describe('occlusion in the aggregate', () => {
    it('lets an unmeasurably tall object dominate the worst case instead of vanishing', () => {
        // The seam that matters most is the one where the object out-tops the
        // aircraft. Dropping it made the headline improve as obstacles grew.
        const steps = [
            stepAt({ x: 0, y: 100 }, 0, 50),
            stepAt({ x: 100, y: 100 }, 50, 100),
            stepAt({ x: 150, y: 3 }, 100, 150),
        ];

        const report = parallaxReport(steps);

        expect(report.degenerateSeams).toEqual([]);
        expect(slideMetres(report, 1).worst).toBeLessThan(Infinity);
        expect(slideMetres(report, 5).worst).toBe(Infinity);
    });
});
