import { describe, expect, it } from 'vitest';

import {
    CAMERA_PROFILES,
    DEFAULT_ALTITUDE_CEILING,
    MAVIC_PRO,
    PREVIEW_CAMERA,
    waypointsAboveCeiling,
} from '../../src/core/camera/profiles';

describe('camera profiles', () => {
    it('keeps the Mavic Pro figures this project was calibrated against', () => {
        expect(MAVIC_PRO.vFov).toBe(46.8);
        expect(MAVIC_PRO.hFov).toBe(62.4);
    });

    it('gives every profile a wider horizontal than vertical field of view', () => {
        for (const profile of [...CAMERA_PROFILES, PREVIEW_CAMERA]) {
            expect(profile.hFov).toBeGreaterThan(profile.vFov);
            expect(profile.gimbalPitchRange[0]).toBeLessThan(profile.gimbalPitchRange[1]);
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
