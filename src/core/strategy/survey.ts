import type { CameraProfile } from '../camera/profiles';
import { tan, toRadians } from '../geometry/angles';
import { getTopAngle } from '../geometry/triangle';
import type { Point, Step, Triple } from '../types';

/**
 * A photogrammetric survey of the ground the panorama needs.
 *
 * Not a way of taking a panorama — it produces no strips and nothing to stack.
 * It exists because the residual this project cannot remove by any planar means
 * is the parallax of objects standing above the ground, and the only complete
 * answer to that is to reconstruct the scene and render the view that was never
 * photographed. Reconstruction wants overlapping coverage from many angles,
 * which is a different flight from a line of strips.
 *
 * Two things it deliberately does not do, both for the same reason:
 *
 * - **No cross-hatch.** A perpendicular pass needs a heading that is not the
 *   track's, and a `Step` carries no heading of its own — `getGeoSteps` derives
 *   one from the track bearing and the `backwards` flag.
 * - **No sideways obliques.** A frame aimed across the track has a target that
 *   is not in the vertical slice, and `Step.shootedPoint` is a point *in* the
 *   slice.
 *
 * Both would need `Step` to carry a full three-dimensional pose, which would
 * ripple through the map, the step list, the mission export and the 3D preview.
 * Fore-and-aft obliques cost nothing by comparison, because pitch already
 * exists — so those are here, and the rest is written down rather than faked.
 */

export interface SurveyOptions {
    /** Height above the ground for the whole survey, metres. */
    readonly altitude: number;
    /** Fraction of a frame shared with the next one along the line. */
    readonly frontOverlap: number;
    /** Fraction shared with the neighbouring line. */
    readonly sideOverlap: number;
    /** Add a second pass looking forward at this pitch. Omitted for nadir only. */
    readonly obliquePitch?: number;
}

/** Ground the survey has to cover, in the plan's own coordinates. */
export interface SurveyArea {
    readonly from: number;
    readonly to: number;
    /** Half the width to either side of the centreline, metres. */
    readonly halfWidth: number;
}

function tripleAt(groundX: number, shootingPoint: Point): Triple {
    const ground: Point = { x: groundX, y: 0 };
    // A survey is not projected onto the panorama surface, so the curve point
    // is the ground point. Saying so is better than inventing a surface the
    // flight has nothing to do with.
    return { pointOnTheCurve: ground, pointOnTheGround: ground, shootingPoint };
}

function frameAt(
    alongTrack: number,
    lateral: number,
    options: SurveyOptions,
    camera: CameraProfile,
    pitch: number
): Step {
    const shootingPoint: Point = { x: alongTrack, y: options.altitude };

    // Where the frame is aimed. Straight down for a nadir pass; further along
    // the track for an oblique one, by however far the pitch throws it.
    const throwAhead = pitch <= -90 ? 0 : options.altitude / Math.tan(toRadians(-pitch));
    const shootedPoint: Point = { x: alongTrack + throwAhead, y: 0 };

    const halfFootprint = options.altitude * tan(toRadians(camera.vFov / 2));
    const first = tripleAt(shootedPoint.x - halfFootprint, shootingPoint);
    const last = tripleAt(shootedPoint.x + halfFootprint, shootingPoint);

    return {
        shotOn: 'center',
        shootingPoint,
        shootedPoint,
        angleOfView: getTopAngle(shootingPoint, first.pointOnTheGround, last.pointOnTheGround),
        viewAngleToTheGround: pitch,
        backwards: false,
        lateralOffset: lateral,
        firstElement: first,
        centerElement: tripleAt(shootedPoint.x, shootingPoint),
        lastElement: last,
    };
}

/** Positions along one axis that cover `span` with the given overlap, centred. */
function positions(from: number, to: number, footprint: number, overlap: number): number[] {
    const spacing = Math.max(1, footprint * (1 - overlap));
    const span = Math.max(0, to - from);
    const count = Math.max(1, Math.ceil(span / spacing) + 1);

    // Centred on the span rather than started at one end, so the coverage
    // overhangs equally at both instead of running out at the far edge.
    const covered = (count - 1) * spacing;
    const start = from + (span - covered) / 2;

    return Array.from({ length: count }, (_, index) => start + index * spacing);
}

export function surveySteps(area: SurveyArea, camera: CameraProfile, options: SurveyOptions): Step[] {
    const alongFootprint = 2 * options.altitude * tan(toRadians(camera.vFov / 2));
    const acrossFootprint = 2 * options.altitude * tan(toRadians(camera.hFov / 2));

    const alongTrack = positions(area.from, area.to, alongFootprint, options.frontOverlap);
    const lines = positions(-area.halfWidth, area.halfWidth, acrossFootprint, options.sideOverlap);

    const pitches = options.obliquePitch === undefined ? [-90] : [-90, options.obliquePitch];

    // Line by line, so consecutive steps are consecutive waypoints and the map
    // draws a flight path rather than a scribble.
    return pitches.flatMap(pitch =>
        lines.flatMap((lateral, lineIndex) => {
            // Serpentine: every other line runs the other way, which is how a
            // survey is actually flown and halves the transit between lines.
            const ordered = lineIndex % 2 === 0 ? alongTrack : [...alongTrack].reverse();
            return ordered.map(along => frameAt(along, lateral, options, camera, pitch));
        })
    );
}
