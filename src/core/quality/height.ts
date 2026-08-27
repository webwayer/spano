import { project } from '../imaging/pinhole';
import type { PanoramaGeometry } from '../imaging/strip-warp';
import type { Point } from '../types';
import type { SeamParallax } from './parallax';

/**
 * Turn a measured seam disagreement into a height above the ground, and a
 * height back into the displacement it causes.
 *
 * This is the one place in the project where the scene is *measured* rather
 * than assumed. Everything else treats the ground as flat because it has no
 * choice; here the two frames meeting at a seam are a stereo pair with a base
 * spano knows exactly, so the disagreement between them is not a defect to be
 * hidden but a reading to be taken.
 *
 * The arithmetic is short because the hard part is already done elsewhere. An
 * object of height `h` standing at ground point P is imaged by a camera as
 * though it stood at `P + h·tanθ`, which is the relief displacement of
 * classical aerial photogrammetry. Two cameras therefore place it two different
 * distances apart on the ground, and that distance is `h` times the seam's
 * `slidePerMetre` — the very number `parallax.ts` reports. So
 *
 *     h = disparity_in_rows / (slidePerMetre × rows_per_ground_metre)
 *
 * and every term on the right is known. The result is in metres, not in some
 * relative unit needing a scale fitted to it afterwards, which is what a
 * monocular depth estimate would have given.
 */

/**
 * Panorama rows per metre of ground near a given point, **signed**.
 *
 * Measured by projecting two points a metre apart rather than derived, because
 * the panorama is a perspective camera and the scale changes down the picture:
 * a single number for the whole image would be wrong everywhere but one row.
 *
 * Signed because the sign is load-bearing. Ground further along the track
 * appears *higher* in the panorama, so the derivative is negative, and a
 * correction that ignored that would move every object the wrong way — by
 * exactly twice as much as leaving it alone.
 */
export function rowsPerGroundMetre(panorama: PanoramaGeometry, curvePoint: Point, alongTrackStep = 1): number {
    const at = (x: number): number => project(panorama.camera, { x: 0, y: curvePoint.y, z: x }).y;
    return (at(curvePoint.x + alongTrackStep) - at(curvePoint.x)) / alongTrackStep;
}

/**
 * Heights above the ground, one per panorama column, from a measured seam.
 *
 * Zero where the seam has no parallax to speak of. That is not a failure: a
 * seam whose two frames agree has nothing to measure, and reporting a height
 * derived by dividing a small number by a smaller one would be noise dressed as
 * a reading.
 */
/**
 * Rows of disagreement a metre of height must produce before it is believed.
 *
 * Half a row per metre, so a single row of measured disparity means at most two
 * metres of height. Below that the search's own quantisation is larger than the
 * thing being measured and the reading is noise, however confident it looks.
 *
 * This threshold is what makes the mode's central irony explicit. Height is
 * recovered from the parallax between two frames, and every other mode here
 * exists to make that parallax small — so the finer the capture, the worse this
 * measurement gets. On the default curve one row of disparity means 0.36 m of
 * height at the wide-strip plan, 1.9 m at fine strips, and 18 m at the dense
 * pass. It is the one mode that wants a coarse flight.
 */
export const MIN_ROWS_PER_METRE_OF_HEIGHT = 0.5;

export function heightsFromDisparities(
    seam: SeamParallax,
    disparities: ArrayLike<number>,
    rowsPerMetre: number
): Float64Array {
    const heights = new Float64Array(disparities.length);

    // Magnitudes throughout: slidePerMetre is already an absolute difference,
    // and a negative height would mean the ground bulged downwards, which this
    // measurement cannot distinguish from a matching failure anyway.
    const scale = seam.slidePerMetre * Math.abs(rowsPerMetre);
    if (!Number.isFinite(scale) || scale < MIN_ROWS_PER_METRE_OF_HEIGHT) return heights;

    // Nothing on the ground can reach the aircraft: a reading that says
    // otherwise has matched the wrong thing, and letting it through would drag
    // a whole column of the panorama somewhere absurd.
    const ceiling = Math.max(0, seam.from.y) * 0.5;

    for (let index = 0; index < disparities.length; index++) {
        const height = Math.abs(disparities[index] ?? 0) / scale;
        heights[index] = height > ceiling ? 0 : height;
    }
    return heights;
}

/**
 * Rows a frame displaces an object of this height by, relative to its base.
 *
 * The correction the true-orthophoto path applies, with its sign: an object is
 * drawn away from the camera's nadir, so removing the displacement moves it
 * back towards it.
 */
export function reliefRows(height: number, tangentFromNadir: number, rowsPerMetre: number): number {
    return height * tangentFromNadir * rowsPerMetre;
}

/** Tangent of the angle from nadir, for a camera over a ground point. */
export function tangentFromNadir(shootingPoint: Point, groundPoint: Point): number {
    if (shootingPoint.y <= 0) return 0;
    return (shootingPoint.x - groundPoint.x) / shootingPoint.y;
}

export interface HeightSummary {
    /** Metres. NaN when nothing could be measured. */
    readonly tallest: number;
    readonly median: number;
    readonly measuredColumns: number;
}

/**
 * What the seams collectively say about the scene.
 *
 * Worth surfacing on its own: the comparison table asks the user how tall the
 * things on their ground are, and until now they had to guess. This answers it
 * from their own photographs.
 */
export function summariseHeights(profiles: readonly Float64Array[]): HeightSummary {
    const measured: number[] = [];
    for (const profile of profiles) {
        for (const height of profile) {
            if (Number.isFinite(height) && Math.abs(height) > 0.05) measured.push(Math.abs(height));
        }
    }

    if (measured.length === 0) return { tallest: NaN, median: NaN, measuredColumns: 0 };

    measured.sort((a, b) => a - b);
    // A 99th percentile rather than the maximum: one column of mismatched
    // texture should not be allowed to report a fifty-metre tree.
    const tallest = measured[Math.min(measured.length - 1, Math.floor(measured.length * 0.99))] ?? NaN;

    return {
        tallest,
        median: measured[Math.floor(measured.length / 2)] ?? NaN,
        measuredColumns: measured.length,
    };
}
