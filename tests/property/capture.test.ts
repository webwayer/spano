import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { MAVIC_PRO } from '../../src/core/camera/profiles';
import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import { plan } from '../../src/core/planner/plan';
import { parallaxReport, slideMetres } from '../../src/core/quality/parallax';
import { ARC_STRIPS, FINE_STRIPS, NODAL_SWEEP } from '../../src/core/strategy/capture';

const params = fc.record({
    offset: fc.integer({ min: 10, max: 200 }),
    firstLeg: fc.integer({ min: 10, max: 200 }),
    radius: fc.integer({ min: 10, max: 200 }),
    secondLeg: fc.integer({ min: 10, max: 200 }),
    viewPointY: fc.integer({ min: 10, max: 200 }),
});

const curveKinds = [Arc90Curve, Arc135Curve] as const;
const kinds = fc.constantFrom(0 as const, 1 as const);

interface CaseParams {
    offset: number;
    firstLeg: number;
    radius: number;
    secondLeg: number;
    viewPointY: number;
}

function curveFor(p: CaseParams, kind: 0 | 1): Arc90Curve | Arc135Curve {
    const Ctor = curveKinds[kind];
    return new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
}

describe('nodal sweep', () => {
    it('has no parallax anywhere in the form space, exactly', () => {
        // The machine-checked form of the whole claim. Not toBeCloseTo: with one
        // shooting point, error-model.ts subtracts an expression from itself.
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const { steps, shootingErrors } = NODAL_SWEEP.build(
                    curveFor(p, kind),
                    { x: 0, y: p.viewPointY },
                    MAVIC_PRO
                );
                const report = parallaxReport(steps);

                for (const error of shootingErrors) expect(error).toBe(0);
                expect(report.degenerateSeams).toEqual([]);
                expect(report.worstSlidePerMetre).toBe(0);
                expect(slideMetres(report, 25).worst).toBe(0);
            }),
            { numRuns: 200 }
        );
    });

    it('never puts the aircraft below the ground, unlike the arc it replaces', () => {
        // The arc planner reaches -101.7 m in the corners of this same space.
        // Holding one hover point cannot, because the hover is the viewpoint.
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const { steps } = NODAL_SWEEP.build(curveFor(p, kind), { x: 0, y: p.viewPointY }, MAVIC_PRO);
                for (const step of steps) expect(step.shootingPoint.y).toBe(p.viewPointY);
            }),
            { numRuns: 150 }
        );
    });
});

describe('capture strategies', () => {
    it('all build without throwing, everywhere the form can reach', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                for (const strategy of [ARC_STRIPS, FINE_STRIPS, NODAL_SWEEP]) {
                    for (const density of strategy.densities) {
                        expect(() =>
                            strategy.build(curveFor(p, kind), { x: 0, y: p.viewPointY }, MAVIC_PRO, density)
                        ).not.toThrow();
                    }
                }
            }),
            { numRuns: 60 }
        );
    });

    it('leaves the incumbent plan identical', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const viewPoint = { x: 0, y: p.viewPointY };
                expect(ARC_STRIPS.build(curveFor(p, kind), viewPoint, MAVIC_PRO)).toEqual(
                    plan(curveFor(p, kind), viewPoint)
                );
            }),
            { numRuns: 150 }
        );
    });

    it('makes fine strips cost more frames than the baseline', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const viewPoint = { x: 0, y: p.viewPointY };
                const baseline = ARC_STRIPS.build(curveFor(p, kind), viewPoint, MAVIC_PRO).steps.length;
                const finest = FINE_STRIPS.build(curveFor(p, kind), viewPoint, MAVIC_PRO, FINE_STRIPS.densities[2])
                    .steps.length;

                expect(finest).toBeGreaterThanOrEqual(baseline);
            }),
            { numRuns: 150 }
        );
    });
});
