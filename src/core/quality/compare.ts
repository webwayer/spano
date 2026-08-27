import type { CameraProfile } from '../camera/profiles';
import { stepsExceedingFieldOfView, waypointsAboveCeiling } from '../camera/profiles';
import type { Curve } from '../curves/curve';
import { lengthFromCoordinates } from '../geometry/triangle';
import type { CaptureDensity, CaptureStrategy } from '../strategy/capture';
import { defaultDensity } from '../strategy/capture';
import type { Point } from '../types';
import { groundSampleDistance, parallaxReport, slideMetres, slidePixels } from './parallax';

/**
 * One row of the strategy comparison.
 *
 * The point of the table is that these numbers move in opposite directions.
 * Nothing here is a score, and there is deliberately no ranking function: a
 * plan that removes all the seam slide by never moving the aircraft also throws
 * away the distant detail the flight existed to capture, and only a person
 * looking at their own scene can weigh that.
 */
export interface StrategyComparison {
    readonly strategyId: string;
    readonly strategyName: string;
    readonly densityId: string;
    readonly densityLabel: string;
    /** Photographs the pilot has to take. */
    readonly frameCount: number;
    /** Distance the aircraft travels between hover points, metres. */
    readonly pathLengthMetres: number;
    readonly maxAltitudeMetres: number;
    /** Metres of seam slide per metre of object height. Zero for a single hover. */
    readonly worstSlidePerMetre: number;
    readonly meanSlidePerMetre: number;
    /** The same at the caller's object height, in metres and in pixels. */
    readonly worstSlideMetres: number;
    readonly worstSlidePixels: number;
    /** Frames asking for more ground than the sensor can see. Indices, counted. */
    readonly framesOverFieldOfView: number;
    readonly framesOverCeiling: number;
    /** Seams the model cannot measure, because the aircraft is at or below ground. */
    readonly degenerateSeams: number;
}

export interface ComparisonOptions {
    /** Height of the objects standing on the ground, metres. */
    readonly objectHeight: number;
    readonly camera: CameraProfile;
    readonly altitudeCeiling: number;
    /** Sensor height in pixels, for the only unit that decides visibility. */
    readonly frameHeightPx: number;
}

/**
 * Straight-line distance flown between consecutive hover points.
 *
 * A polyline over the hover points, not the length of the underlying curve, and
 * the two differ: a sparse plan cuts the corners and under-measures. On the
 * default curve a 10-frame plan reports 214.67 m and a 161-frame plan 214.99 m
 * — the same flight, sampled harder. The 0.15% is discretisation, not a longer
 * mission, and a comparison table must not invite anyone to read it as one.
 */
function pathLength(points: readonly Point[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];
        if (!previous || !current) continue;
        total += lengthFromCoordinates(previous, current);
    }
    return total;
}

/** Measure one strategy at one density. */
export function measureStrategy(
    strategy: CaptureStrategy,
    curve: Curve,
    viewPoint: Point,
    options: ComparisonOptions,
    density: CaptureDensity = defaultDensity(strategy)
): StrategyComparison {
    const { steps } = strategy.build(curve, viewPoint, options.camera, density);
    const report = parallaxReport(steps);
    const altitudes = steps.map(step => step.shootingPoint.y);

    // A survey has no seams, so the slide figure has nothing to measure. NaN
    // renders as "not applicable"; a number here would be computed from frames
    // that share no edge, and would be confidently wrong.
    const worstSlideMetres = strategy.hasSeams ? slideMetres(report, options.objectHeight).worst : NaN;

    // Ground sampling is taken at the highest hover, which is the coarsest
    // point of the flight and therefore the most forgiving pixel figure. If a
    // defect is visible there it is visible everywhere.
    const gsd = groundSampleDistance(options.camera, Math.max(...altitudes, 0), options.frameHeightPx);

    return {
        strategyId: strategy.id,
        strategyName: strategy.name,
        densityId: density.id,
        densityLabel: density.label,
        frameCount: steps.length,
        pathLengthMetres: pathLength(steps.map(step => step.shootingPoint)),
        maxAltitudeMetres: Math.max(...altitudes, 0),
        worstSlidePerMetre: strategy.hasSeams ? report.worstSlidePerMetre : NaN,
        meanSlidePerMetre: strategy.hasSeams ? report.meanSlidePerMetre : NaN,
        worstSlideMetres,
        worstSlidePixels: slidePixels(worstSlideMetres, gsd),
        framesOverFieldOfView: stepsExceedingFieldOfView(
            steps.map(step => step.angleOfView),
            options.camera
        ).length,
        framesOverCeiling: waypointsAboveCeiling(altitudes, options.altitudeCeiling).length,
        degenerateSeams: report.degenerateSeams.length,
    };
}

/**
 * Every strategy at every density, in registry order.
 *
 * Cheap enough to run on every keystroke: it is arithmetic over a few hundred
 * samples with no image touched, which is the whole reason the comparison can
 * exist before any of the image pipelines do.
 */
export function compareStrategies(
    strategies: readonly CaptureStrategy[],
    curve: Curve,
    viewPoint: Point,
    options: ComparisonOptions
): StrategyComparison[] {
    return strategies.flatMap(strategy =>
        strategy.densities.map(density => measureStrategy(strategy, curve, viewPoint, options, density))
    );
}
