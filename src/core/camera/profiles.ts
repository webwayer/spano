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
    /**
     * Still-image dimensions, pixels.
     *
     * Needed the moment anything reasons in pixels rather than angles: how many
     * pixels a seam defect spans, and the focal length a pose export has to
     * declare. Carried on the profile rather than passed around, because it is
     * a property of the camera and getting it wrong is silent — the numbers
     * stay plausible and are simply untrue.
     */
    readonly sensorPixels: { readonly width: number; readonly height: number };
}

/**
 * The aircraft everything in this repo was measured against.
 *
 * `hFov` was 62.4 from 2018 until 2026, and it was wrong. The tell is that
 * 62.4 / 46.8 is exactly 4/3: the horizontal figure had been obtained by
 * scaling the vertical *angle* by the sensor's aspect ratio, and angles do not
 * scale that way. For a pinhole camera it is the *tangents* that carry the
 * aspect ratio, so the two declared fields described a sensor of ratio 1.3995
 * while the camera writes 4:3 stills.
 *
 * Which of the two to keep was not a coin toss. `vFov` drives `calcViewport`
 * and therefore every crop the tool has ever produced; strips have stacked
 * cleanly along the flat legs for years, which is an empirical check, and a
 * 28 mm-equivalent lens gives 46.40 degrees independently. `hFov` had no valid
 * derivation at all and only one consumer — the ground footprints drawn on the
 * map, which nobody has ever checked against reality. With `vFov` trusted and
 * the sensor known to be 4:3, the horizontal field is determined rather than
 * chosen: 2 * atan(4/3 * tan(23.4)) = 59.9686.
 *
 * Two plausible-looking alternatives were rejected for the same reason as the
 * original: DJI publishes 78.8 degrees diagonal, which on a 4:3 sensor implies
 * 66.62 horizontal — but also 52.47 vertical; and a 28 mm equivalent implies
 * 65.47 horizontal — but on a 3:2 frame, with 46.40 vertical. Each is a
 * self-consistent pair. Taking the horizontal from one and the vertical from
 * another is precisely the mistake being corrected.
 *
 * The absolute figures remain unverified against the real optics. What is fixed
 * here is that they can no longer contradict each other and the sensor:
 * tests/unit/camera.test.ts asserts the tangent ratio for every profile.
 */
export const MAVIC_PRO: CameraProfile = {
    id: 'dji-mavic-pro',
    name: 'DJI Mavic Pro',
    vFov: 46.8,
    hFov: 59.96859,
    gimbalPitchRange: [-90, 30],
    // 4000x3000 stills, which is what the aircraft actually writes.
    sensorPixels: { width: 4000, height: 3000 },
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
    hFov: 57.822402,
    gimbalPitchRange: [-90, 90],
    // Matches RENDER_WIDTH and RENDER_HEIGHT in src/adapters/scene3d/scene.ts.
    // Its hFov was 60 and is now 57.8224, which is not a recalibration but a
    // correction to what three.js already renders: a PerspectiveCamera with
    // fov 45 and aspect 4/3 has exactly that horizontal field.
    sensorPixels: { width: 1000, height: 750 },
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
