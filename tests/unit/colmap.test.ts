import { describe, expect, it } from 'vitest';

import { MAVIC_PRO } from '../../src/core/camera/profiles';
import { Arc90Curve } from '../../src/core/curves/arc-90';
import { makeColmapModel } from '../../src/core/export/colmap';
import { plan } from '../../src/core/planner/plan';
import { NODAL_SWEEP } from '../../src/core/strategy/capture';

const { steps } = plan(new Arc90Curve(50, 50, 100, 50), { x: 0, y: 50 });
const model = makeColmapModel(steps, MAVIC_PRO);

/** The image lines, without the headers and the blank observation lines. */
function poseLines(images: string): string[] {
    return images.split('\n').filter(line => line.length > 0 && !line.startsWith('#'));
}

interface Pose {
    q: { w: number; x: number; y: number; z: number };
    t: [number, number, number];
    name: string;
}

function parsePose(line: string): Pose {
    const f = line.split(' ');
    return {
        q: { w: Number(f[1]), x: Number(f[2]), y: Number(f[3]), z: Number(f[4]) },
        t: [Number(f[5]), Number(f[6]), Number(f[7])],
        name: String(f[9]),
    };
}

/** World-to-camera, rebuilt from the quaternion rather than from our own basis. */
function toCamera(pose: Pose, world: [number, number, number]): [number, number, number] {
    const { w, x, y, z } = pose.q;
    const rows: [[number, number, number], [number, number, number], [number, number, number]] = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
    const [tx, ty, tz] = pose.t;
    const apply = (row: [number, number, number]): number => row[0] * world[0] + row[1] * world[1] + row[2] * world[2];
    return [apply(rows[0]) + tx, apply(rows[1]) + ty, apply(rows[2]) + tz];
}

describe('cameras.txt', () => {
    it('declares one PINHOLE camera at the profile’s pixel size', () => {
        const line = model.cameras.split('\n').find(l => !l.startsWith('#') && l.length > 0);
        expect(line).toBeDefined();

        const fields = (line ?? '').split(' ');
        expect(fields[0]).toBe('1');
        expect(fields[1]).toBe('PINHOLE');
        expect(fields[2]).toBe('4000');
        expect(fields[3]).toBe('3000');
        // Principal point at the centre.
        expect(Number(fields[6])).toBeCloseTo(2000, 6);
        expect(Number(fields[7])).toBeCloseTo(1500, 6);
    });

    it('derives one focal length, because the pixels are square', () => {
        const fields = (model.cameras.split('\n').find(l => !l.startsWith('#') && l.length > 0) ?? '').split(' ');
        const fx = Number(fields[4]);
        const fy = Number(fields[5]);

        expect(fy).toBeCloseTo(1500 / Math.tan((23.4 * Math.PI) / 180), 4);

        // fx and fy are computed from the two fields of view independently, so
        // their agreeing is not a tautology — it is the sensor-consistency
        // invariant showing up again, one layer down. Until 2026 they came out
        // 5% apart, because hFov was an angle scaled by the aspect ratio.
        expect(fx).toBeCloseTo(fy, 3);
    });
});

describe('images.txt', () => {
    it('writes one pose per step', () => {
        expect(poseLines(model.images)).toHaveLength(steps.length);
    });

    it('leaves the blank observation line COLMAP requires after each pose', () => {
        // Dropping it does not error — it shifts every subsequent image by a
        // line, which is the kind of fault that surfaces as a bad reconstruction
        // hours later.
        const body = model.images.split('\n').filter(line => !line.startsWith('#'));
        const poses = body.filter(line => line.length > 0);
        const blanks = body.filter(line => line.length === 0);

        expect(blanks.length).toBe(poses.length);
    });

    it('stores world-to-camera, so the camera centre lands on its own origin', () => {
        // The single most valuable assertion here. Writing the camera position
        // as the translation, rather than -R times it, produces a file that
        // loads without complaint and reconstructs into nonsense.
        for (const [index, line] of poseLines(model.images).entries()) {
            const step = steps[index];
            expect(step).toBeDefined();
            if (!step) continue;

            const centre = toCamera(parsePose(line), [0, step.shootingPoint.y, step.shootingPoint.x]);
            expect(Math.hypot(...centre)).toBeLessThan(1e-3);
        }
    });

    it('puts each frame’s aiming point straight down the view axis, in front', () => {
        for (const [index, line] of poseLines(model.images).entries()) {
            const step = steps[index];
            expect(step).toBeDefined();
            if (!step) continue;

            const target = toCamera(parsePose(line), [0, step.shootedPoint.y, step.shootedPoint.x]);
            expect(Math.hypot(target[0], target[1])).toBeLessThan(1e-3);
            // Positive depth: COLMAP's +Z is the viewing direction, and a
            // negative value would mean the camera is aimed away from the ground.
            expect(target[2]).toBeGreaterThan(0);
        }
    });

    it('numbers the frames from one, in plan order', () => {
        const names = poseLines(model.images).map(line => parsePose(line).name);
        expect(names[0]).toBe('frame_0001.jpg');
        expect(names.at(-1)).toBe(`frame_${String(steps.length).padStart(4, '0')}.jpg`);
    });

    it('takes a naming scheme, because the drone chose the real one', () => {
        const named = makeColmapModel(steps.slice(0, 2), MAVIC_PRO, {
            namePrefix: 'DJI_',
            nameExtension: '.JPG',
        });
        expect(parsePose(poseLines(named.images)[0] ?? '').name).toBe('DJI_0001.JPG');
    });

    it('handles a single hover, where every frame shares one position', () => {
        // Degenerate for anything that infers motion from the poses, and the
        // mode most likely to be exported, since it is the one with no parallax.
        const sweep = NODAL_SWEEP.build(new Arc90Curve(50, 50, 100, 50), { x: 0, y: 50 }, MAVIC_PRO);
        const sweepModel = makeColmapModel(sweep.steps, MAVIC_PRO);

        const translations = poseLines(sweepModel.images).map(line => parsePose(line).t.join(','));
        expect(poseLines(sweepModel.images)).toHaveLength(sweep.steps.length);
        // Same centre, different orientations: the translations differ because
        // the translation is -R*C and R is what changes.
        expect(new Set(translations).size).toBeGreaterThan(1);
    });
});

describe('points3D.txt', () => {
    it('exists and is empty, because the model will not load without it', () => {
        expect(model.points3D).toContain('# 3D point list');
        expect(model.points3D.split('\n').filter(l => l.length > 0 && !l.startsWith('#'))).toEqual([]);
    });
});
