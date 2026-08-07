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

/**
 * Steps asking for more ground than the camera can see in one frame.
 *
 * `maxViewAngle` (20°) is a planning *target*, not a bound. The greedy splitter
 * admits the final sample of a run unconditionally, the anchored layout then
 * merges pairs of groups, and every shot is widened again by the deliberate
 * one-sample overlap — none of which re-checks the budget. Most plans stay near
 * 20°, but degenerate geometry (a shooting point that lands on the ground
 * between the two points it frames) reaches 178°.
 *
 * This behaviour is inherited from the 2018 planner and is preserved
 * deliberately: the differential against those sources matches across ~165,000
 * parameter combinations. Correcting the allocation is a change to the flight
 * model and belongs in its own commit, with its own baseline review. What is
 * not acceptable is shipping such a plan without saying so — hence this.
 */
export function stepsExceedingFieldOfView(anglesOfView: readonly number[], camera: CameraProfile): number[] {
    return anglesOfView.map((angle, i) => (angle > camera.vFov ? i : -1)).filter(i => i >= 0);
}
