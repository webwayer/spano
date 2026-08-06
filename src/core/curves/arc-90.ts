import type { Curve } from './curve';
import type { Point } from '../types';
import {
    calculateTriangleCustom,
    calculateTriangleFromCoordinates,
    lineEquationFrom2PointsByX,
} from '../geometry/triangle';
import { cos, sin, toRadians } from '../geometry/angles';

/**
 * Flat leg, then a 90 degree arc, then a flat leg.
 *
 * Shown in the UI as "Simple Curve". The arc is a genuine quarter circle, so
 * its length is a quarter of the circumference: 2*pi*r / 4 = pi*r / 2.
 */
export class Arc90Curve implements Curve {
    /** Sweep of the curved segment, degrees. */
    static readonly ARC_DEGREES = 90;

    readonly curvedSegmentLength: number;

    constructor(
        readonly offset: number,
        readonly firstLegLength: number,
        readonly curvedSegmentRadius: number,
        readonly secondLegLength: number
    ) {
        this.curvedSegmentLength = (Math.PI * this.curvedSegmentRadius) / 2;
    }

    getTotalLength(): number {
        return this.firstLegLength + this.curvedSegmentLength + this.secondLegLength;
    }

    getPointOnTheGround(length: number): Point {
        return { x: this.offset + length, y: 0 };
    }

    getPointOnTheCurve(length: number): Point {
        if (length <= this.firstLegLength) {
            return {
                x: this.offset + length,
                y: 0,
            };
        }

        if (length > this.firstLegLength && length < this.firstLegLength + this.curvedSegmentLength) {
            const angleToCurvedSegment = 270 + (90 * (length - this.firstLegLength)) / this.curvedSegmentLength;
            const pointOnTheCurvedSegment_x =
                this.offset + this.firstLegLength + this.curvedSegmentRadius * cos(toRadians(angleToCurvedSegment));
            const pointOnTheCurvedSegment_y =
                this.curvedSegmentRadius + this.curvedSegmentRadius * sin(toRadians(angleToCurvedSegment));

            return {
                x: pointOnTheCurvedSegment_x,
                y: pointOnTheCurvedSegment_y,
            };
        }

        if (length <= this.getTotalLength()) {
            return {
                x: this.offset + this.firstLegLength + this.curvedSegmentRadius,
                y: this.curvedSegmentRadius + length - this.firstLegLength - this.curvedSegmentLength,
            };
        }

        throw new RangeError(outOfRange(length, this.getTotalLength()));
    }

    getShootingPoint(length: number, viewPoint: Point): Point {
        const pointOnTheGround = this.getPointOnTheGround(length);
        const { angle, distance } = this.getCorrectedViewAngle(length, viewPoint);

        return calculateTriangleCustom(pointOnTheGround, angle, distance).B;
    }

    private getCorrectedViewAngle(length: number, viewPoint: Point): { angle: number; distance: number } {
        const point = this.getPointOnTheCurve(length);

        if (length <= this.firstLegLength) {
            const { alpha, c } = calculateTriangleFromCoordinates(point, viewPoint, { x: 0, y: 0 });
            return { angle: alpha, distance: c };
        }

        if (length > this.firstLegLength && length < this.firstLegLength + this.curvedSegmentLength) {
            const { alpha, c } = calculateTriangleFromCoordinates(point, viewPoint, {
                x: this.offset + this.firstLegLength,
                y: this.curvedSegmentRadius,
            });

            const lineEquation_c = lineEquationFrom2PointsByX(point, viewPoint);
            const lineEquation_c_result_y = lineEquation_c(this.offset + this.firstLegLength);

            const angle = lineEquation_c_result_y <= this.curvedSegmentRadius ? 90 - alpha : 90 + alpha;

            return { angle, distance: c };
        }

        if (length <= this.getTotalLength()) {
            const { alpha, c } = calculateTriangleFromCoordinates(point, viewPoint, {
                x: this.offset + this.firstLegLength + this.curvedSegmentRadius,
                y: 0,
            });
            return { angle: alpha, distance: c };
        }

        throw new RangeError(outOfRange(length, this.getTotalLength()));
    }
}

/**
 * The piecewise branches above cover [0, totalLength]. Anything outside that is
 * a caller bug, not a curve shape — the 2018 version returned `undefined` here
 * and let it surface later as "cannot read property 'x' of undefined".
 */
function outOfRange(length: number, total: number): string {
    return `Curve length ${length} is outside the curve's domain [0, ${total}].`;
}
