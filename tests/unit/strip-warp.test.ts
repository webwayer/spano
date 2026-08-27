import { describe, expect, it } from 'vitest';

import { MAVIC_PRO } from '../../src/core/camera/profiles';
import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import { apply, invert } from '../../src/core/geometry/homography';
import { project } from '../../src/core/imaging/pinhole';
import {
    DEFAULT_OVERLAP_FRACTION,
    MAX_PANORAMA_SWEEP,
    PanoramaFolds,
    PanoramaTooWide,
    overlappingStrips,
    panoramaGeometryFor,
    pinholeForStep,
    seamBands,
    stripSampling,
} from '../../src/core/imaging/strip-warp';
import { plan } from '../../src/core/planner/plan';

const LIMITS = { width: 1200, maxHeight: 8000 };
const VIEW_POINT = { x: 0, y: 50 };
const { steps } = plan(new Arc90Curve(50, 50, 100, 50), VIEW_POINT);
const panorama = panoramaGeometryFor(steps, VIEW_POINT, MAVIC_PRO, LIMITS);
const samplings = steps.map(step => stripSampling(step, MAVIC_PRO, panorama));

describe('panorama geometry', () => {
    it('sizes itself to hold the whole curve, top row at zero', () => {
        const rows = samplings.flatMap(s => [s.destination.y, s.destination.y + s.destination.height]);
        expect(Math.min(...rows)).toBeCloseTo(0, 6);
        expect(Math.max(...rows)).toBeCloseTo(panorama.height, 0);
    });

    it('keeps within the height it was given', () => {
        expect(panorama.height).toBeLessThanOrEqual(LIMITS.maxHeight);
        expect(panorama.width).toBeLessThanOrEqual(LIMITS.width);
    });

    it('trades width for height rather than cropping a tall curve', () => {
        // The whole curve stays in frame; only the scale gives way. Silently
        // losing one end of the panorama would be far worse than a small one.
        const tight = panoramaGeometryFor(steps, VIEW_POINT, MAVIC_PRO, { width: 1200, maxHeight: 400 });
        expect(tight.height).toBeLessThanOrEqual(400);
        expect(tight.width).toBeLessThan(panorama.width);
    });

    it('refuses a sweep no flat projection can carry, and says why', () => {
        // A pinhole cannot image half a turn, and degrades long before it.
        const wide = plan(new Arc135Curve(10, 10, 10, 200), { x: 0, y: 10 });
        expect(() => panoramaGeometryFor(wide.steps, { x: 0, y: 10 }, MAVIC_PRO, LIMITS)).toThrow(PanoramaTooWide);
        expect(MAX_PANORAMA_SWEEP).toBeLessThan(180);
    });

    it('refuses a curve that doubles back through the line of sight', () => {
        // The 135 degree arc's second leg rises at 45 degrees back towards the
        // viewer. From the right height it runs almost along the line of sight,
        // its angular position reverses, and two parts of the ground claim the
        // same direction. Stacking the strips anyway would paint one silently
        // over the other.
        const folding = plan(new Arc135Curve(10, 10, 10, 10), { x: 0, y: 45 });
        expect(() => panoramaGeometryFor(folding.steps, { x: 0, y: 45 }, MAVIC_PRO, LIMITS)).toThrow(PanoramaFolds);
    });

    it('refuses an empty plan', () => {
        expect(() => panoramaGeometryFor([], VIEW_POINT, MAVIC_PRO, LIMITS)).toThrow(RangeError);
    });
});

describe('strip placement', () => {
    it('tiles the panorama edge to edge, with no gap and no overlap', () => {
        // The strips ARE the panorama; a gap would show as a band of nothing.
        const ordered = [...samplings].sort((a, b) => a.destination.y - b.destination.y);
        for (let i = 1; i < ordered.length; i++) {
            const previous = ordered[i - 1];
            const current = ordered[i];
            expect(previous).toBeDefined();
            expect(current).toBeDefined();
            if (!previous || !current) continue;
            expect(previous.destination.y + previous.destination.height).toBeCloseTo(current.destination.y, 6);
        }
    });

    it('spans the full width of the panorama', () => {
        for (const sampling of samplings) {
            expect(sampling.destination.x).toBe(0);
            expect(sampling.destination.width).toBe(panorama.width);
        }
    });
});

describe('seam agreement', () => {
    /** Where a ground point lands in the panorama, according to one strip. */
    function panoramaPixelFor(index: number, lateral: number, alongTrack: number): { x: number; y: number } {
        const step = steps[index];
        const sampling = samplings[index];
        if (!step || !sampling) throw new Error('no such strip');

        const inFrame = project(pinholeForStep(step, MAVIC_PRO), { x: lateral, y: 0, z: alongTrack });
        return apply(invert(sampling.toSource), inFrame);
    }

    it('puts a ground point at the seam in the same place from either side', () => {
        // This is the entire point of the warp. Two frames shot from different
        // positions foreshorten the ground differently; cutting a rectangle out
        // of each leaves them disagreeing wherever the cut falls. Resampling
        // through the exact projective map removes that disagreement, and what
        // is left is machine zero rather than merely small.
        for (let i = 1; i < steps.length; i++) {
            const shared = steps[i]?.firstElement.pointOnTheGround;
            expect(shared).toBeDefined();
            if (!shared) continue;

            for (const lateral of [-40, -10, 0, 10, 40]) {
                const before = panoramaPixelFor(i - 1, lateral, shared.x);
                const after = panoramaPixelFor(i, lateral, shared.x);
                expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(1e-6);
            }
        }
    });

    it('does not agree by collapsing everything to one point', () => {
        // A degenerate map would satisfy the test above trivially.
        const near = panoramaPixelFor(0, 0, steps[0]?.firstElement.pointOnTheGround.x ?? 0);
        const far = panoramaPixelFor(0, 0, steps[0]?.lastElement.pointOnTheGround.x ?? 0);
        expect(Math.abs(near.y - far.y)).toBeGreaterThan(1);
    });
});

describe('overlap for seam choice', () => {
    const placements = overlappingStrips(samplings);

    it('keeps a strip’s nominal extent alongside its widened one', () => {
        expect(placements).toHaveLength(samplings.length);
        for (const placement of placements) {
            expect(placement.sampling.destination.y).toBeLessThanOrEqual(placement.nominal.y);
            expect(placement.sampling.destination.height).toBeGreaterThanOrEqual(placement.nominal.height);
        }
    });

    it('carries the index back, because plan order is not panorama order', () => {
        // Strips are sorted down the panorama here, but the caller still has to
        // find the photograph each one came from.
        expect([...placements].map(p => p.index).sort((a, b) => a - b)).toEqual(samplings.map((_, index) => index));
    });

    it('never lets a layer overlap itself', () => {
        // The whole reason for two layers rather than one canvas per strip. With
        // the overshoot below a half, strip i reaches at most 0.4 into its
        // neighbour while strip i+2 reaches back at most 0.4 from the other
        // side — 0.4 against 0.6, so they cannot meet.
        for (const layer of [0, 1] as const) {
            const own = placements
                .filter(placement => placement.layer === layer)
                .sort((a, b) => a.sampling.destination.y - b.sampling.destination.y);

            for (let i = 1; i < own.length; i++) {
                const previous = own[i - 1];
                const current = own[i];
                if (!previous || !current) continue;
                expect(previous.sampling.destination.y + previous.sampling.destination.height).toBeLessThanOrEqual(
                    current.sampling.destination.y + 1e-9
                );
            }
        }
    });

    it('alternates layers down the panorama', () => {
        placements.forEach((placement, index) => {
            expect(placement.layer).toBe(index % 2);
        });
    });

    it('refuses an overshoot that would make the scheme unsound', () => {
        expect(() => overlappingStrips(samplings, 0.5)).toThrow(RangeError);
        expect(() => overlappingStrips(samplings, 0)).toThrow(RangeError);
        expect(DEFAULT_OVERLAP_FRACTION).toBeLessThan(0.5);
    });

    it('offers one band per gap, all of them with room to move', () => {
        const bands = seamBands(placements);

        expect(bands).toHaveLength(placements.length - 1);
        for (const band of bands) expect(band.height).toBeGreaterThan(0);
    });

    it('still offers a band where two strips fail to overlap, so the cut stays put', () => {
        // Degrading to the nominal boundary is what the plain warp already does,
        // so a plan the overlap cannot help composites correctly rather than
        // breaking.
        const touching = samplings.map(sampling => ({ ...sampling }));
        const bands = seamBands(
            overlappingStrips(touching, 1e-9 + Number.MIN_VALUE).map(placement => ({
                ...placement,
                sampling: { ...placement.sampling, destination: { ...placement.nominal, x: 0, width: 1 } },
            }))
        );

        expect(bands).toHaveLength(placements.length - 1);
        for (const band of bands) expect(band.height).toBe(0);
    });
});
