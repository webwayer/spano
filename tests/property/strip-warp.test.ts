import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { MAVIC_PRO } from '../../src/core/camera/profiles';
import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import { apply, invert } from '../../src/core/geometry/homography';
import { project } from '../../src/core/imaging/pinhole';
import {
    PanoramaFolds,
    PanoramaTooWide,
    panoramaGeometryFor,
    pinholeForStep,
    stripSampling,
} from '../../src/core/imaging/strip-warp';
import { plan } from '../../src/core/planner/plan';

const params = fc.record({
    offset: fc.integer({ min: 10, max: 200 }),
    firstLeg: fc.integer({ min: 10, max: 200 }),
    radius: fc.integer({ min: 10, max: 200 }),
    secondLeg: fc.integer({ min: 10, max: 200 }),
    viewPointY: fc.integer({ min: 10, max: 200 }),
});
const kinds = fc.constantFrom(0 as const, 1 as const);
const curveKinds = [Arc90Curve, Arc135Curve] as const;
const LIMITS = { width: 1200, maxHeight: 8000 };

interface CaseParams {
    offset: number;
    firstLeg: number;
    radius: number;
    secondLeg: number;
    viewPointY: number;
}

/**
 * Null when no flat projection of this shape exists — a legitimate answer, not
 * a failure. Either it sweeps further than a pinhole can carry, or it doubles
 * back through the line of sight.
 */
function warpFor(p: CaseParams, kind: 0 | 1) {
    const Ctor = curveKinds[kind];
    const viewPoint = { x: 0, y: p.viewPointY };
    const { steps } = plan(new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg), viewPoint);

    try {
        const panorama = panoramaGeometryFor(steps, viewPoint, MAVIC_PRO, LIMITS);
        return { steps, panorama, samplings: steps.map(step => stripSampling(step, MAVIC_PRO, panorama)) };
    } catch (error) {
        if (error instanceof PanoramaTooWide || error instanceof PanoramaFolds) return null;
        throw error;
    }
}

describe('strip warp', () => {
    it('either builds a panorama or refuses for one of the two stated reasons', () => {
        // Anything else escaping is a bug: a crop that cannot be computed leaves
        // the page with no preview and an error the user cannot act on.
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                expect(() => warpFor(p, kind)).not.toThrow();
            }),
            { numRuns: 200 }
        );
    });

    it('puts a seam’s ground line in one place, everywhere in the form space', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const warp = warpFor(p, kind);
                if (!warp) return;

                for (let i = 1; i < warp.steps.length; i++) {
                    const earlier = warp.steps[i - 1];
                    const later = warp.steps[i];
                    const before = warp.samplings[i - 1];
                    const after = warp.samplings[i];
                    if (!earlier || !later || !before || !after) continue;

                    const shared = later.firstElement.pointOnTheGround;
                    for (const lateral of [-30, 0, 30]) {
                        const world = { x: lateral, y: 0, z: shared.x };
                        const a = apply(invert(before.toSource), project(pinholeForStep(earlier, MAVIC_PRO), world));
                        const b = apply(invert(after.toSource), project(pinholeForStep(later, MAVIC_PRO), world));
                        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-4);
                    }
                }
            }),
            { numRuns: 120 }
        );
    });

    it('tiles the panorama without gaps, whatever the shape', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const warp = warpFor(p, kind);
                if (!warp) return;

                const ordered = [...warp.samplings].sort((a, b) => a.destination.y - b.destination.y);
                for (let i = 1; i < ordered.length; i++) {
                    const previous = ordered[i - 1];
                    const current = ordered[i];
                    if (!previous || !current) continue;
                    expect(previous.destination.y + previous.destination.height).toBeCloseTo(current.destination.y, 4);
                }
            }),
            { numRuns: 120 }
        );
    });

    it('stays inside the canvas it was allowed', () => {
        fc.assert(
            fc.property(params, kinds, (p, kind) => {
                const warp = warpFor(p, kind);
                if (!warp) return;
                expect(warp.panorama.height).toBeLessThanOrEqual(LIMITS.maxHeight);
                expect(warp.panorama.width).toBeLessThanOrEqual(LIMITS.width);
                expect(warp.panorama.width).toBeGreaterThan(0);
            }),
            { numRuns: 120 }
        );
    });
});
