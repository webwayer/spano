import { describe, expect, it } from 'vitest';

import { Arc90Curve } from '../../src/core/curves/arc-90';
import { plan } from '../../src/core/planner/plan';

import { divideSegmentsIntoShots } from '../../src/core/planner/allocation';
import { convertShotsIntoSteps } from '../../src/core/planner/steps';
import type { Segment, Shot, ShotAnchor, Triple } from '../../src/core/types';

/**
 * Synthetic samples: ground points spread along x, all photographed from one
 * elevated position. The angle subtended at the camera grows with the spread,
 * which is enough to drive the greedy splitter predictably.
 */
function triple(i: number): Triple {
    return {
        pointOnTheGround: { x: i * 10, y: 0 },
        pointOnTheCurve: { x: i * 10, y: 0 },
        shootingPoint: { x: -50, y: 100 },
    };
}

function segment(sampleCount: number, avgError: number): Segment {
    return {
        triples: Array.from({ length: sampleCount }, (_, i) => triple(i)),
        avgError,
    };
}

/** Above the flatness threshold, so the curved (anchored-layout) branch is taken. */
const CURVED = 0.5;
/** Below it, so the flat branch is taken. */
const FLAT = 0.0001;

const ANCHORS: ShotAnchor[] = ['start', 'center', 'end'];

describe('convertShotsIntoSteps', () => {
    it.each(ANCHORS)('handles a shot holding a single sample, anchored on %s', anchor => {
        // Regression: the centre index used to round up to 1 and be resolved
        // eagerly, so a one-sample shot threw — even for start and end, which
        // never read it. The 2018 code left it undefined and worked, so a plan
        // that used to be produced was denied entirely.
        const shot: Shot = { shotOn: anchor, triples: [triple(0)] };

        expect(() => convertShotsIntoSteps([shot])).not.toThrow();

        const [step] = convertShotsIntoSteps([shot]);
        expect(step?.centerElement).toBe(shot.triples[0]);
        expect(step?.firstElement).toBe(shot.triples[0]);
        expect(step?.lastElement).toBe(shot.triples[0]);
    });

    it('picks the same centre sample as before for ordinary shots', () => {
        // Math.round(n/2) replaced parseInt((n/2).toFixed(), 10). They agree for
        // every positive n — pinned here so the cleanup cannot drift.
        for (let n = 1; n <= 64; n++) {
            const legacy = parseInt((n / 2).toFixed(), 10);
            const expected = Math.min(legacy, n - 1);
            const shot: Shot = { shotOn: 'center', triples: Array.from({ length: n }, (_, i) => triple(i)) };
            const [step] = convertShotsIntoSteps([shot]);
            expect(step?.centerElement, `n=${n}`).toBe(shot.triples[expected]);
        }
    });
});

describe('divideSegmentsIntoShots', () => {
    /**
     * The boundary of the defect this codebase advertises as fixed. No segment
     * in the golden corpus ever yields fewer than seven groups, so before this
     * test the fallback path had no coverage at all — and moving the threshold
     * from 3 to 4 changed nothing that any test could see.
     */
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 12, 20])('emits only well-formed shots for a %i-sample curved segment', n => {
        const shots = divideSegmentsIntoShots([segment(n, CURVED)], 20, 1);

        // Never zero: a segment that produced no shots would drop that stretch
        // of ground from the plan with no error anywhere.
        expect(shots.length).toBeGreaterThan(0);

        for (const shot of shots) {
            expect(Array.isArray(shot.triples), `shot ${shot.shotOn} has no sample array`).toBe(true);
            expect(shot.triples.length).toBeGreaterThan(0);
            expect((shot.triples as (Triple | undefined)[]).every(t => t !== undefined)).toBe(true);
            expect(ANCHORS).toContain(shot.shotOn);
        }

        // And the whole chain must survive them.
        expect(() => convertShotsIntoSteps(shots)).not.toThrow();
    });

    it.each([1, 2, 3, 8, 20])('emits only well-formed shots for a %i-sample flat segment', n => {
        const shots = divideSegmentsIntoShots([segment(n, FLAT)], 20, 1);

        for (const shot of shots) {
            expect(shot.triples.length).toBeGreaterThan(0);
            expect((shot.triples as (Triple | undefined)[]).every(t => t !== undefined)).toBe(true);
        }
        expect(() => convertShotsIntoSteps(shots)).not.toThrow();
    });

    it('switches from the fallback to the anchored layout at exactly three groups', () => {
        // Pins the boundary itself, not just well-formedness. With these inputs
        // the greedy splitter yields 1, 2 and 3 groups at 4, 7 and 8 samples;
        // below three groups each group becomes its own frame, at three the
        // start / centre-pairs / end layout takes over and the shot count jumps.
        //
        // Without this, moving MIN_GROUPS_FOR_ANCHORED_LAYOUT from 3 to 4
        // changed nothing any test could see.
        const anchorsFor = (n: number): string =>
            divideSegmentsIntoShots([segment(n, CURVED)], 20, 1)
                .map(s => s.shotOn)
                .join(',');

        expect(anchorsFor(4), '1 group → one frame, centred').toBe('center');
        expect(anchorsFor(7), '2 groups → one frame per group, anchored at the ends').toBe('start,end');
        expect(anchorsFor(8), '3 groups → anchored layout').toBe('start,end,start,end');
    });

    it('overlaps consecutive shots by exactly one sample', () => {
        // The seam contract: each shot re-includes its predecessor's last
        // sample, so neighbouring frames share a reference point.
        const shots = divideSegmentsIntoShots([segment(40, CURVED)], 5, 0.5);
        expect(shots.length).toBeGreaterThan(1);

        for (let i = 1; i < shots.length; i++) {
            const previous = shots[i - 1];
            const current = shots[i];
            expect(current?.triples[0], `shot ${i} does not start on shot ${i - 1}'s last sample`).toBe(
                previous?.triples[previous.triples.length - 1]
            );
        }
    });

    it('covers the whole segment, leaving no sample unphotographed', () => {
        const source = segment(30, CURVED);
        const shots = divideSegmentsIntoShots([source], 20, 1);

        const covered = new Set(shots.flatMap(s => s.triples));
        for (const t of source.triples) {
            expect(covered.has(t)).toBe(true);
        }
    });

    it('returns nothing for an empty segment rather than throwing', () => {
        expect(divideSegmentsIntoShots([segment(0, CURVED)], 20, 1)).toEqual([]);
        expect(divideSegmentsIntoShots([], 20, 1)).toEqual([]);
    });
});

describe('flatness at fine sampling', () => {
    it('does not call a curve flat merely because it was sampled finely', () => {
        // avgError is measured between neighbouring samples, so it scales with
        // stepLength. Against an absolute threshold that made the test a
        // statement about the sampling rate rather than about the ground: at a
        // 0.07 m interval this curve's average fell below 0.01, the whole arc
        // took the flat branch, and the greedy splitter closed no group at all
        // — 14,284 samples became one photograph.
        const curve = new Arc90Curve(200, 200, 200, 200);
        const viewPoint = { x: 0, y: 50 };

        const coarse = plan(curve, viewPoint, { stepLength: 0.25, maxDistortionAngle: 0.05 });
        const fine = plan(curve, viewPoint, { stepLength: 0.05, maxDistortionAngle: 0.05 });

        expect(fine.pointTriples.length).toBeGreaterThan(coarse.pointTriples.length);
        expect(fine.steps.length).toBeGreaterThan(coarse.steps.length);
    });

    it('still treats a genuinely flat run as flat, at any sampling rate', () => {
        // The flat legs really are flat: their error is ~1e-14 whatever the
        // interval, so the branch must still be reachable.
        const { segments } = plan(new Arc90Curve(50, 50, 100, 50), { x: 0, y: 50 }, { stepLength: 0.25 });
        expect(segments.some(segment => segment.avgError < 1e-9)).toBe(true);
    });
});
