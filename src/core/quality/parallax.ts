/**
 * How far objects standing above the ground slide between adjacent frames.
 *
 * This is the defect the planner has never been able to remove, as distinct
 * from the one it measures. `error-model.ts` compares the angle to a ground
 * patch from its own shooting point against the angle from the previous one:
 * that is a statement about the *ground*, and a projective warp can correct it.
 * Anything standing above the ground is a different problem, and no planar warp
 * reaches it.
 *
 * The geometry is the relief displacement of classical aerial photogrammetry —
 * the same effect that leans buildings outward in an ordinary orthophoto. A
 * camera at S images the top of an object of height h standing at ground point
 * P as though it stood at a ground point displaced by
 *
 *     (S.x - P.x) * h / (S.y - h)
 *
 * away from the nadir. Two frames meeting at a seam image that patch from two
 * different positions, so the object lands in two different places and the eye
 * reads the difference as the object sliding.
 *
 * Linearised for h much smaller than the flying height, the displacement is
 * h * tan(theta), where theta is the angle from nadir. That gives the number
 * this module leads with: metres of slide **per metre of object height**,
 *
 *     |tan(theta_before) - tan(theta_after)|
 *
 * which is a property of the flight alone. How tall the trees actually are is
 * the caller's business, and separating the two is the point: it makes plans
 * comparable without anyone having to agree on a scene.
 *
 * The tangent needs no trigonometry. Theta is measured from straight down, so
 * tan(theta) is the horizontal run over the drop: (S.x - P.x) / S.y. Keeping it
 * a division matters more than it looks — the golden baselines hold the shared
 * maths to 1e-9, which below |x| = 1 is effectively absolute, and the flat-leg
 * averages they pin sit at 1e-14. Not touching that maths is how this module
 * stays free.
 */

import type { CameraProfile } from '../camera/profiles';
import { tan, toRadians } from '../geometry/angles';
import type { Point, Step } from '../types';

/** One seam, and how badly the two frames meeting at it disagree. */
export interface SeamParallax {
    /** The seam lies between `steps[seamIndex]` and `steps[seamIndex + 1]`. */
    readonly seamIndex: number;
    /** The ground patch both frames image at the seam. */
    readonly groundPoint: Point;
    /** Where the aircraft hovered for the frame before the seam. */
    readonly from: Point;
    /** And for the frame after it. */
    readonly to: Point;
    /**
     * Metres of ground slide per metre of object height, linearised.
     *
     * `NaN` when either frame is degenerate — see `degenerateSeams`.
     */
    readonly slidePerMetre: number;
}

export interface ParallaxReport {
    readonly seams: readonly SeamParallax[];
    /** Worst and mean over the usable seams only. See the notes on emptiness. */
    readonly worstSlidePerMetre: number;
    readonly meanSlidePerMetre: number;
    /**
     * Indices into `seams` whose geometry cannot be measured, because the
     * aircraft is at or below ground level there.
     *
     * That is not hypothetical. Sweeping the whole space the form can reach
     * (70,346 seams) finds shooting points as low as -101.7 m, on
     * `Arc135Curve(10, 10, 10, 10)` with the viewpoint at 200 m. It is the same
     * degenerate geometry `stepsExceedingFieldOfView` already reports as a 178°
     * frame, seen from a different side. Reporting indices rather than a
     * boolean follows `waypointsAboveCeiling` and `stepsExceedingFieldOfView`.
     */
    readonly degenerateSeams: readonly number[];
}

/**
 * Tangent of the angle from nadir, signed: positive when the aircraft is
 * further along the ground than the patch it is imaging.
 */
function tangentFromNadir(shootingPoint: Point, groundPoint: Point): number {
    return (shootingPoint.x - groundPoint.x) / shootingPoint.y;
}

/**
 * Measure every seam in a plan.
 *
 * The seam's ground patch is taken from the frame *after* it. That is exact
 * rather than approximate: `divideSegmentsIntoShots` deliberately hands the
 * last sample of each shot to the next one, so `steps[i].firstElement` and
 * `steps[i - 1].lastElement` are the same object. `tests/unit/planner.test.ts`
 * pins that, and this module quietly depends on it.
 */
export function parallaxReport(steps: readonly Step[]): ParallaxReport {
    const seams: SeamParallax[] = [];
    const degenerateSeams: number[] = [];

    for (let i = 1; i < steps.length; i++) {
        const before = steps[i - 1];
        const after = steps[i];
        if (!before || !after) continue;

        const groundPoint = after.firstElement.pointOnTheGround;
        const from = before.shootingPoint;
        const to = after.shootingPoint;

        const degenerate = from.y <= 0 || to.y <= 0;
        if (degenerate) degenerateSeams.push(seams.length);

        seams.push({
            seamIndex: i - 1,
            groundPoint,
            from,
            to,
            slidePerMetre: degenerate
                ? NaN
                : Math.abs(tangentFromNadir(from, groundPoint) - tangentFromNadir(to, groundPoint)),
        });
    }

    return { seams, degenerateSeams, ...aggregate(seams.map(seam => seam.slidePerMetre)) };
}

/**
 * Worst and mean over the measured values.
 *
 * Two empty cases, deliberately answered differently. A plan with no seams at
 * all — one frame, or none — has nowhere for anything to slide, so zero is the
 * true answer and the comparison table can print it. A plan whose every seam is
 * degenerate was not measured, and printing 0.00 m there would be a lie, so it
 * yields NaN for a caller to render as "not available".
 *
 * It discards NaN but **keeps Infinity**, and the distinction is not pedantry.
 * NaN means the geometry could not be measured; Infinity means it was measured
 * and the answer is unbounded — the object reaches the aircraft, so its top
 * lands on no ground point at all. Filtering both looked tidier and was wrong:
 * a property test found `Arc135Curve(72, 10, 17, 10)` at a 133 m viewpoint
 * reporting a worst slide of 200.6 m for a 1 m object and 7.7 m for a 2 m one,
 * because the seam responsible had gone occluded and quietly left the average.
 * A headline figure that improves as the obstacles get taller is worse than no
 * figure at all.
 */
function aggregate(values: readonly number[]): { worstSlidePerMetre: number; meanSlidePerMetre: number } {
    if (values.length === 0) return { worstSlidePerMetre: 0, meanSlidePerMetre: 0 };

    const usable = values.filter(value => !Number.isNaN(value));
    if (usable.length === 0) return { worstSlidePerMetre: NaN, meanSlidePerMetre: NaN };

    return {
        worstSlidePerMetre: Math.max(...usable),
        meanSlidePerMetre: usable.reduce((total, value) => total + value, 0) / usable.length,
    };
}

/**
 * Ground slide at one seam for a given object height, without the small-h
 * approximation.
 *
 * `Infinity` when the object reaches the aircraft: its top is then imaged at or
 * beyond the horizon and lands on no ground point at all. The linearised
 * `slidePerMetre` hides that, which is exactly why this exists alongside it.
 */
export function seamSlideMetres(seam: SeamParallax, objectHeight: number): number {
    // One viewpoint cannot disagree with itself. Both frames place the object
    // in the same wrong place, and the same wrong place is not a seam artefact.
    // This has to come before the occlusion test, not after: when the object
    // out-tops the aircraft each displacement is separately unbounded, but they
    // are the *same* unbounded expression and their difference is zero. A
    // property test over the whole form space found this by asserting a nodal
    // sweep is free of parallax and getting Infinity back for a 25 m object
    // seen from a 10 m hover.
    if (seam.from.x === seam.to.x && seam.from.y === seam.to.y) return 0;

    if (seam.from.y <= objectHeight || seam.to.y <= objectHeight) return Infinity;

    const displacement = (shootingPoint: Point): number =>
        ((shootingPoint.x - seam.groundPoint.x) * objectHeight) / (shootingPoint.y - objectHeight);

    return Math.abs(displacement(seam.from) - displacement(seam.to));
}

/** The same, aggregated over a whole plan. Empty cases follow `aggregate`. */
export function slideMetres(
    report: ParallaxReport,
    objectHeight: number
): { readonly worst: number; readonly mean: number } {
    const slides = report.seams.map(seam => seamSlideMetres(seam, objectHeight));
    const { worstSlidePerMetre, meanSlidePerMetre } = aggregate(slides);
    return { worst: worstSlidePerMetre, mean: meanSlidePerMetre };
}

/**
 * Metres of ground per pixel, looking straight down from `altitude`.
 *
 * Oblique frames sample the far edge more coarsely than this, so it is the
 * optimistic end of the range — which is the right end for a warning: if a
 * defect is visible at the best resolution in the frame, it is visible.
 */
export function groundSampleDistance(camera: CameraProfile, altitude: number, imageHeightPx: number): number {
    return (2 * altitude * tan(toRadians(camera.vFov / 2))) / imageHeightPx;
}

/** Slide expressed in pixels, which is the only unit that says "will I see it". */
export function slidePixels(slideInMetres: number, groundSampleDistanceInMetres: number): number {
    return slideInMetres / groundSampleDistanceInMetres;
}
