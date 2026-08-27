import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import { plan } from '../../src/core/planner/plan';
import { parallaxReport, seamSlideMetres, slideMetres } from '../../src/core/quality/parallax';

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

const kinds = fc.constantFrom(0 as const, 1 as const);

describe('parallax report', () => {
    it('produces one seam per gap between steps, everywhere in the form space', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const { steps } = planFor(p, kind);
                expect(parallaxReport(steps).seams).toHaveLength(Math.max(0, steps.length - 1));
            }),
            { numRuns: 200 }
        );
    });

    it('finds the seam patch shared by object identity, not by coordinate luck', () => {
        // The metric asks "what does the ground patch at this seam look like from
        // either side", which only means something because divideSegmentsIntoShots
        // hands each shot's last sample to the next one. tests/unit/planner.test.ts
        // pins that for shots; this pins the consequence for steps, which is the
        // form parallaxReport actually consumes.
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const { steps } = planFor(p, kind);
                for (let i = 1; i < steps.length; i++) {
                    expect(steps[i]?.firstElement).toBe(steps[i - 1]?.lastElement);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('never reports a negative slide', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                for (const seam of parallaxReport(planFor(p, kind).steps).seams) {
                    // NaN is the degenerate marker and is checked separately.
                    if (Number.isNaN(seam.slidePerMetre)) continue;
                    expect(seam.slidePerMetre).toBeGreaterThanOrEqual(0);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('marks a seam degenerate exactly when the aircraft is at or below ground', () => {
        // The report must not quietly hand back a number for geometry the model
        // cannot express. Sweeping the form space finds shooting points as low
        // as -101.7 m, so this branch is reachable, not defensive.
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const report = parallaxReport(planFor(p, kind).steps);
                const expected = report.seams
                    .map((seam, index) => (seam.from.y <= 0 || seam.to.y <= 0 ? index : -1))
                    .filter(index => index >= 0);

                expect(report.degenerateSeams).toEqual(expected);
                for (const index of expected) expect(report.seams[index]?.slidePerMetre).toBeNaN();
            }),
            { numRuns: 200 }
        );
    });

    it('keeps the worst at or above the mean', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const { worstSlidePerMetre, meanSlidePerMetre } = parallaxReport(planFor(p, kind).steps);
                if (Number.isNaN(worstSlidePerMetre)) return;
                expect(worstSlidePerMetre).toBeGreaterThanOrEqual(meanSlidePerMetre);
            }),
            { numRuns: 200 }
        );
    });

    it('gives a finite answer wherever no seam is degenerate', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const report = parallaxReport(planFor(p, kind).steps);
                if (report.degenerateSeams.length > 0) return;
                expect(Number.isFinite(report.worstSlidePerMetre)).toBe(true);
                expect(Number.isFinite(report.meanSlidePerMetre)).toBe(true);
            }),
            { numRuns: 200 }
        );
    });

    it('grows with the height of the object, monotonically', () => {
        // The reason the headline number is normalised per metre of height at
        // all: the flight decides the shape of the curve, the scene only scales
        // along it.
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const report = parallaxReport(planFor(p, kind).steps);
                const low = slideMetres(report, 1).worst;
                const high = slideMetres(report, 2).worst;
                // Infinity is a legitimate high value, not a skip: it means the
                // taller object reaches the aircraft. Only NaN — nothing was
                // measurable at all — is out of scope here.
                if (Number.isNaN(low) || Number.isNaN(high)) return;
                expect(high).toBeGreaterThanOrEqual(low);
            }),
            { numRuns: 150 }
        );
    });

    it('agrees with the linearised estimate for objects far shorter than the flight', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const report = parallaxReport(planFor(p, kind).steps);
                for (const seam of report.seams) {
                    if (Number.isNaN(seam.slidePerMetre)) continue;
                    const exact = seamSlideMetres(seam, 1e-6) / 1e-6;
                    if (!Number.isFinite(exact)) continue;
                    // Relative, scaled the way tools/golden/compare.ts scales its
                    // tolerance: slidePerMetre reaches 840 in degenerate corners of
                    // the form space, where an absolute epsilon means nothing.
                    expect(Math.abs(exact - seam.slidePerMetre)).toBeLessThanOrEqual(
                        1e-4 * Math.max(1, seam.slidePerMetre)
                    );
                }
            }),
            { numRuns: 150 }
        );
    });
});
