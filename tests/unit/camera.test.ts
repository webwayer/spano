import { describe, expect, it } from 'vitest';

import {
    CAMERA_PROFILES,
    DEFAULT_ALTITUDE_CEILING,
    MAVIC_PRO,
    PREVIEW_CAMERA,
    waypointsAboveCeiling,
} from '../../src/core/camera/profiles';

describe('camera profiles', () => {
    it('keeps the vertical field of view this project was calibrated against', () => {
        // vFov drives calcViewport and therefore every crop the tool has ever
        // produced. It stays.
        expect(MAVIC_PRO.vFov).toBe(46.8);
    });

    it('carries the corrected horizontal field of view', () => {
        // Was 62.4 from 2018 until 2026, which is 46.8 * 4/3 — an aspect ratio
        // applied to an angle rather than to its tangent. The replacement is not
        // a new measurement: with vFov trusted and the sensor known to be 4:3,
        // 2 * atan(4/3 * tan(23.4)) is the only value the two can agree on.
        expect(MAVIC_PRO.hFov).toBeCloseTo(59.9686, 4);
        expect(MAVIC_PRO.hFov).toBeLessThan(62.4);
    });

    it('gives every profile a wider horizontal than vertical field of view', () => {
        for (const profile of [...CAMERA_PROFILES, PREVIEW_CAMERA]) {
            expect(profile.hFov).toBeGreaterThan(profile.vFov);
            expect(profile.gimbalPitchRange[0]).toBeLessThan(profile.gimbalPitchRange[1]);
        }
    });

    it('keeps both fields of view consistent with the shape of the sensor', () => {
        // The invariant that was silently violated from 2018 until 2026. For a
        // pinhole camera the aspect ratio is the ratio of the tangents of the
        // half-angles, not of the angles: hFov was 62.4 because someone scaled
        // 46.8 by 4/3, which describes a sensor of ratio 1.3995 rather than the
        // 4:3 the camera actually writes. Asserting it here is what stops the
        // same shortcut being taken by the next person to add a profile.
        const halfAngle = (degrees: number): number => Math.tan((degrees / 2) * (Math.PI / 180));

        for (const profile of [...CAMERA_PROFILES, PREVIEW_CAMERA]) {
            const implied = halfAngle(profile.hFov) / halfAngle(profile.vFov);
            const actual = profile.sensorPixels.width / profile.sensorPixels.height;
            expect(
                implied,
                `${profile.name} implies ${implied.toFixed(4)}, sensor is ${actual.toFixed(4)}`
            ).toBeCloseTo(actual, 5);
        }
    });

    it('has unique profile ids', () => {
        const ids = CAMERA_PROFILES.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('altitude ceiling', () => {
    it('defaults to the 120 m limit common to EASA and FAA rules', () => {
        expect(DEFAULT_ALTITUDE_CEILING).toBe(120);
    });

    it('reports the indices of waypoints that break the ceiling', () => {
        expect(waypointsAboveCeiling([50, 119, 120, 121, 200])).toEqual([3, 4]);
    });

    it('is quiet when everything is legal', () => {
        expect(waypointsAboveCeiling([10, 50, 120])).toEqual([]);
    });

    it('accepts a custom ceiling', () => {
        expect(waypointsAboveCeiling([50, 100], 60)).toEqual([1]);
    });
});
