import { describe, expect, it } from 'vitest';

import { MAVIC_PRO } from '../../src/core/camera/profiles';
import { Arc90Curve } from '../../src/core/curves/arc-90';
import { surveySteps } from '../../src/core/strategy/survey';
import { PHOTOGRAMMETRY } from '../../src/core/strategy/capture';

const AREA = { from: 50, to: 280, halfWidth: 120 };
const OPTIONS = { altitude: 100, frontOverlap: 0.8, sideOverlap: 0.7 };
const steps = surveySteps(AREA, MAVIC_PRO, OPTIONS);

const alongFootprint = 2 * OPTIONS.altitude * Math.tan((MAVIC_PRO.vFov / 2) * (Math.PI / 180));
const acrossFootprint = 2 * OPTIONS.altitude * Math.tan((MAVIC_PRO.hFov / 2) * (Math.PI / 180));

describe('survey grid', () => {
    it('flies level, straight down, and never backwards', () => {
        for (const step of steps) {
            expect(step.shootingPoint.y).toBe(OPTIONS.altitude);
            expect(step.viewAngleToTheGround).toBe(-90);
            expect(step.backwards).toBe(false);
        }
    });

    it('puts every frame on a line, and the lines either side of the centre', () => {
        const lines = [...new Set(steps.map(step => step.lateralOffset))];

        expect(lines.length).toBeGreaterThan(1);
        expect(Math.min(...lines.map(l => l ?? 0))).toBeLessThan(0);
        expect(Math.max(...lines.map(l => l ?? 0))).toBeGreaterThan(0);
    });

    it('achieves the front overlap it was asked for', () => {
        // The number that decides whether a reconstruction succeeds. Measured
        // from the positions rather than assumed from the spacing, because the
        // centring adjusts the spacing to fit the span.
        const line = steps.filter(step => step.lateralOffset === steps[0]?.lateralOffset);
        const along = line.map(step => step.shootingPoint.x).sort((a, b) => a - b);

        for (let i = 1; i < along.length; i++) {
            const gap = (along[i] ?? 0) - (along[i - 1] ?? 0);
            expect(1 - gap / alongFootprint).toBeGreaterThanOrEqual(OPTIONS.frontOverlap - 1e-9);
        }
    });

    it('achieves the side overlap between neighbouring lines', () => {
        const lines = [...new Set(steps.map(step => step.lateralOffset ?? 0))].sort((a, b) => a - b);

        for (let i = 1; i < lines.length; i++) {
            const gap = (lines[i] ?? 0) - (lines[i - 1] ?? 0);
            expect(1 - gap / acrossFootprint).toBeGreaterThanOrEqual(OPTIONS.sideOverlap - 1e-9);
        }
    });

    it('covers the whole area, overhanging equally at both ends', () => {
        const along = steps.map(step => step.shootingPoint.x);
        const before = AREA.from - Math.min(...along);
        const after = Math.max(...along) - AREA.to;

        expect(Math.min(...along)).toBeLessThanOrEqual(AREA.from);
        expect(Math.max(...along)).toBeGreaterThanOrEqual(AREA.to);
        expect(before).toBeCloseTo(after, 6);
    });

    it('flies a serpentine, so the aircraft is not thrown back down the line each time', () => {
        const lines = [...new Set(steps.map(step => step.lateralOffset ?? 0))];
        const first = steps.filter(s => (s.lateralOffset ?? 0) === lines[0]).map(s => s.shootingPoint.x);
        const second = steps.filter(s => (s.lateralOffset ?? 0) === lines[1]).map(s => s.shootingPoint.x);

        expect((first.at(-1) ?? 0) > (first[0] ?? 0)).toBe(true);
        expect((second.at(-1) ?? 0) < (second[0] ?? 0)).toBe(true);
    });

    it('adds a forward-looking pass when asked, aimed further down the track', () => {
        const withOblique = surveySteps(AREA, MAVIC_PRO, { ...OPTIONS, obliquePitch: -45 });
        const oblique = withOblique.filter(step => step.viewAngleToTheGround === -45);

        expect(withOblique).toHaveLength(steps.length * 2);
        expect(oblique).toHaveLength(steps.length);
        for (const step of oblique) {
            // At 45 degrees the aiming point is thrown ahead by the altitude.
            expect(step.shootedPoint.x - step.shootingPoint.x).toBeCloseTo(OPTIONS.altitude, 6);
        }
    });

    it('says the curve point is the ground point, rather than inventing a surface', () => {
        // A survey is not projected onto the panorama surface. Claiming it was
        // would give the reprojection something plausible and false to work on.
        for (const step of steps) {
            expect(step.firstElement.pointOnTheCurve).toEqual(step.firstElement.pointOnTheGround);
        }
    });
});

describe('the survey as a capture strategy', () => {
    const curve = new Arc90Curve(50, 50, 100, 50);

    it('declares that it has no seams and feeds no processing mode', () => {
        expect(PHOTOGRAMMETRY.hasSeams).toBe(false);
        expect(PHOTOGRAMMETRY.processingModes).toEqual([]);
        expect(PHOTOGRAMMETRY.recommendedProcessing).toEqual([]);
    });

    it('stays under the altitude ceiling, unlike the strip plans it replaces', () => {
        const plan = PHOTOGRAMMETRY.build(curve, { x: 0, y: 50 }, MAVIC_PRO);

        expect(plan.steps.length).toBeGreaterThan(20);
        for (const step of plan.steps) expect(step.shootingPoint.y).toBeLessThanOrEqual(120);
    });

    it('returns empty planner intermediates rather than fabricating them', () => {
        const plan = PHOTOGRAMMETRY.build(curve, { x: 0, y: 50 }, MAVIC_PRO);

        expect(plan.pointTriples).toEqual([]);
        expect(plan.segments).toEqual([]);
        expect(plan.shots).toEqual([]);
        expect(plan.shootingErrors).toEqual([]);
    });
});
