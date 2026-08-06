import { Arc90Curve } from '../core/curves/arc-90';
import { Arc135Curve } from '../core/curves/arc-135';
import type { Curve } from '../core/curves/curve';
import type { Point } from '../core/types';
import { numberFrom, select } from './dom';

export interface PlanParams {
    curve: Curve;
    viewPoint: Point;
}

/** Read and validate the form into the shape the planner wants. */
export function readParams(): PlanParams {
    const CurveClass = select('curveType').value === 'simpleCurve' ? Arc90Curve : Arc135Curve;

    const curve = new CurveClass(
        numberFrom('offset'),
        numberFrom('firstLineLength'),
        numberFrom('curvedLineLength'),
        numberFrom('secondLineLength')
    );

    return {
        curve,
        viewPoint: { x: 0, y: numberFrom('viewPointHeight') },
    };
}
