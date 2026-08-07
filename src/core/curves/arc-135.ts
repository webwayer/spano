import type { Curve } from './curve';
import type { Point } from '../types';
import {
    calculateTriangleCustom,
    calculateTriangleFromCoordinates,
    lineEquationFrom2PointsByX,
} from '../geometry/triangle';
import { cos, sin, toRadians } from '../geometry/angles';

/**
 * Flat leg, then a 135 degree arc, then a leg rising at 45 degrees.
 *
 * Shown in the UI as "More Curved Curve". 135 degrees is three eighths of a
 * circle, so the arc length is 3/8 of the circumference: 2*pi*r * 3/8 =
 * 3*pi*r / 4. (The README claimed 120 degrees until Phase 0; it was never that.)
 */
export class Arc135Curve implements Curve {
    /** Sweep of the curved segment, degrees. */
    static readonly ARC_DEGREES = 135;

    /** Where the arc ends, measured on the circle, degrees. */
    private static readonly ARC_END_ANGLE = 45;

    readonly curvedSegmentLength: number;

    constructor(
        readonly offset: number,
        readonly firstLegLength: number,
        readonly curvedSegmentRadius: number,
        readonly secondLegLength: number
    ) {
        this.curvedSegmentLength = (Math.PI * this.curvedSegmentRadius * 3) / 4;
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
            const angleToCurvedSegment = 270 + (135 * (length - this.firstLegLength)) / this.curvedSegmentLength;
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
            const { x: arcEndX, y: arcEndY } = this.arcEndPoint();

            // The trailing leg leaves the arc tangentially at 45 degrees, so it
            // advances by l/sqrt(2) in each of -x and +y.
            const lastLegActiveLength = length - this.firstLegLength - this.curvedSegmentLength;
            const lastLegOffset = Math.sqrt(Math.pow(lastLegActiveLength, 2) / 2);

            return {
                x: arcEndX - lastLegOffset,
                y: arcEndY + lastLegOffset,
            };
        }

        throw new RangeError(outOfRange(length, this.getTotalLength()));
    }

    getShootingPoint(length: number, viewPoint: Point): Point {
        const pointOnTheGround = this.getPointOnTheGround(length);
        const { angle, distance } = this.getCorrectedViewAngle(length, viewPoint);

        return calculateTriangleCustom(pointOnTheGround, angle, distance).B;
    }

    private arcEndPoint(): Point {
        const angle = Arc135Curve.ARC_END_ANGLE;
        return {
            x: this.offset + this.firstLegLength + this.curvedSegmentRadius * cos(toRadians(angle)),
            y: this.curvedSegmentRadius + this.curvedSegmentRadius * sin(toRadians(angle)),
        };
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
            const { alpha, c } = calculateTriangleFromCoordinates(point, viewPoint, this.arcEndPoint());
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
