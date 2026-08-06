/**
 * Camera geometry, as data.
 *
 * The 2018 code carried 46.8, 62.4 and 45 as bare literals at five call sites.
 * Naming them is tidiness; making them a *type* is what unblocks the feature
 * this project most obviously wants — supporting an aircraft other than the one
 * it was written for. Adding a Mavic 3 is now a five-line change.
 */
export interface CameraProfile {
    readonly id: string;
    readonly name: string;
    /** Vertical field of view, degrees. Sets how much ground one frame covers. */
    readonly vFov: number;
    /** Horizontal field of view, degrees. Sets the width of the ground footprint. */
    readonly hFov: number;
    /** Gimbal pitch limits, degrees; negative points down. */
    readonly gimbalPitchRange: readonly [number, number];
}

/** The aircraft everything in this repo was measured against. */
export const MAVIC_PRO: CameraProfile = {
    id: 'dji-mavic-pro',
    name: 'DJI Mavic Pro',
    vFov: 46.8,
    hFov: 62.4,
    gimbalPitchRange: [-90, 30],
};

/**
 * The synthetic three.js preview camera.
 *
 * Not a real aircraft — it exists so the preview crop uses the same code path
 * as a real one. Its vFov must match the PerspectiveCamera in the 3D adapter.
 */
export const PREVIEW_CAMERA: CameraProfile = {
    id: 'preview-3d',
    name: '3D preview camera',
    vFov: 45,
    hFov: 60,
    gimbalPitchRange: [-90, 90],
};

export const CAMERA_PROFILES: readonly CameraProfile[] = [MAVIC_PRO];

/**
 * Most jurisdictions cap uncrewed flight at 120 m above ground level (EASA Open
 * Category) or 400 ft ~= 122 m (FAA Part 107). Not legal advice — a default the
 * UI warns against exceeding, because the tool will otherwise hand you an
 * illegal plan without comment.
 */
export const DEFAULT_ALTITUDE_CEILING = 120;

/** Waypoints above the ceiling, if any. */
export function waypointsAboveCeiling(
    altitudes: readonly number[],
    ceiling: number = DEFAULT_ALTITUDE_CEILING
): number[] {
    return altitudes.map((altitude, i) => (altitude > ceiling ? i : -1)).filter(i => i >= 0);
}
