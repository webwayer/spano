/**
 * The planner chain, isolated from the DOM.
 *
 * Since Phase 3 this is a thin wrapper: src/core/planner/plan.ts is itself the
 * DOM-free entry point, and src/core/tsconfig.json guarantees it stays that way
 * by compiling without "DOM" in lib. Before Phase 3 the chain could only be
 * reached through index.ts, which also imported jQuery and three.js.
 */

import { Arc90Curve } from '../../src/core/curves/arc-90';
import { Arc135Curve } from '../../src/core/curves/arc-135';
import {
    DEFAULT_MAX_DISTORTION_ANGLE,
    DEFAULT_MAX_VIEW_ANGLE,
    DEFAULT_STEP_LENGTH,
    plan,
    type Plan,
} from '../../src/core/planner/plan';
import type { Curve } from '../../src/core/curves/curve';
import type { Case, CaseParams, CurveKind } from './cases';

/**
 * The values that reach the planner. In the 2018 code these arrived as
 * calcModel(curve, viewPoint, 7, 20) against a signature of
 * (curve, viewPoint, maxDistortionAngle, maxViewAngle), forwarded as
 * divideSegmentsIntoShots(segments, maxViewAngle, maxDistortionAngle) — so 20
 * and 7 in that order. They are now named defaults in plan.ts; re-exported here
 * so the baseline records what it actually ran with.
 */
export const MAX_VIEW_ANGLE = DEFAULT_MAX_VIEW_ANGLE;
export const MAX_DISTORTION_ANGLE = DEFAULT_MAX_DISTORTION_ANGLE;
export const STEP_LENGTH = DEFAULT_STEP_LENGTH;

export type PipelineResult = Plan;

export function makeCurve(kind: CurveKind, p: CaseParams): Curve {
    const Ctor = kind === 'simple' ? Arc90Curve : Arc135Curve;
    return new Ctor(p.offset, p.firstLeg, p.radius, p.secondLeg);
}

export function runPipeline(testCase: Case): PipelineResult {
    const curve = makeCurve(testCase.curve, testCase.params);
    const viewPoint = { x: 0, y: testCase.params.viewPointY };

    return plan(curve, viewPoint, {
        maxViewAngle: MAX_VIEW_ANGLE,
        maxDistortionAngle: MAX_DISTORTION_ANGLE,
        stepLength: STEP_LENGTH,
    });
}
