import type { Curve } from '../curves/curve';
import type { Point, Segment, Shot, Step, Triple } from '../types';
import { getPointTriples } from './sampling';
import { getShootingErrorsForTriples } from './error-model';
import { divideTriplesIntoSegmentsByErrors } from './segmentation';
import { divideSegmentsIntoShots } from './allocation';
import { convertShotsIntoSteps } from './steps';

/**
 * Largest angular height of ground a single frame may cover, degrees.
 * Below the sensor's vertical field of view, leaving margin for the crop.
 */
export const DEFAULT_MAX_VIEW_ANGLE = 20;

/** Largest distortion allowed to accumulate across one frame, degrees. */
export const DEFAULT_MAX_DISTORTION_ANGLE = 7;

/** Arc-length interval between samples, metres. */
export const DEFAULT_STEP_LENGTH = 1;

export interface PlanOptions {
    maxViewAngle?: number;
    maxDistortionAngle?: number;
    stepLength?: number;
}

export interface Plan {
    totalCurveLength: number;
    pointTriples: Triple[];
    shootingErrors: number[];
    segments: Segment[];
    shots: Shot[];
    steps: Step[];
}

/**
 * The single public entry point of the planning core.
 *
 * Sample the curve, measure how far each sample's available viewpoint is from
 * the ideal, split into segments by that error, allocate photographs, and turn
 * them into pilot instructions.
 */
export function plan(curve: Curve, viewPoint: Point, options: PlanOptions = {}): Plan {
    const {
        maxViewAngle = DEFAULT_MAX_VIEW_ANGLE,
        maxDistortionAngle = DEFAULT_MAX_DISTORTION_ANGLE,
        stepLength = DEFAULT_STEP_LENGTH,
    } = options;

    const pointTriples = getPointTriples(curve, viewPoint, stepLength);
    const shootingErrors = getShootingErrorsForTriples(pointTriples);
    const segments = divideTriplesIntoSegmentsByErrors(pointTriples, shootingErrors);
    const shots = divideSegmentsIntoShots(segments, maxViewAngle, maxDistortionAngle, stepLength);
    const steps = convertShotsIntoSteps(shots);

    return {
        totalCurveLength: curve.getTotalLength(),
        pointTriples,
        shootingErrors,
        segments,
        shots,
        steps,
    };
}
