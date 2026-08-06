/**
 * The planner chain, isolated from the DOM.
 *
 * This reproduces calcModel() from index.ts:163-176 exactly, minus its five
 * console.log calls. It exists because index.ts also imports jQuery and
 * three.js, so the pure planner cannot be reached from there in Node.
 *
 * Nothing in the import graph below touches the DOM:
 *   lib/model.ts       imports only ./math
 *   lib/curves/*.ts    import only ./Curve and ../math
 *   lib/math.ts        imports nothing
 */

import { SimpleCurve } from '../../lib/curves/SimpleCurve';
import { StunningCurve } from '../../lib/curves/StunningCurve';
import {
    getPointTriples,
    getShootingErrorsForTriples,
    divideTriplesIntoSegmentsByErrors,
    divideSegmentsIntoShots,
    convertShotsIntoSteps,
} from '../../lib/model';
import type { Case, CaseParams, CurveKind } from './cases';

/**
 * index.ts:35 calls calcModel(curve, viewPoint, 7, 20) against the signature
 * (curve, viewPoint, maxDistortionAngle, maxViewAngle), which then forwards as
 * divideSegmentsIntoShots(segments, maxViewAngle, maxDistortionAngle).
 * So the values that actually reach the planner are 20 and 7, in that order.
 */
export const MAX_VIEW_ANGLE = 20;
export const MAX_DISTORTION_ANGLE = 7;

/** getPointTriples' stepLength, as passed by index.ts:164. */
export const STEP_LENGTH = 1;

export interface PipelineResult {
    totalCurveLength: number;
    pointTriples: any[];
    shootingErrors: number[];
    segments: any[];
    shots: any[];
    steps: any[];
}

export function makeCurve(kind: CurveKind, p: CaseParams) {
    const Ctor = kind === 'simple' ? SimpleCurve : StunningCurve;
    return new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
}

export function runPipeline(testCase: Case): PipelineResult {
    const curve = makeCurve(testCase.curve, testCase.params);
    const viewPoint = { x: 0, y: testCase.params.viewPointY };

    const pointTriples = getPointTriples(curve, viewPoint, STEP_LENGTH);
    const shootingErrors = getShootingErrorsForTriples(pointTriples);
    const segments = divideTriplesIntoSegmentsByErrors(pointTriples, shootingErrors);
    const shots = divideSegmentsIntoShots(segments, MAX_VIEW_ANGLE, MAX_DISTORTION_ANGLE);
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
