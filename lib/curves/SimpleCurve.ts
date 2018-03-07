import {Curve} from "./Curve";
import {
    calculateTriangleCustom,
    calculateTriangleFromCoordinates,
    lineEquationFrom2PointsByX,
    Point,
    toRadians
} from "../math";

export class SimpleCurve implements Curve {
    public curvedSegmentLength: number;

    constructor(public offset: number, public firstLegLength: number, public curvedSegmentRadius: number, public secondLegLength: number) {
        this.curvedSegmentLength = (Math.PI * this.curvedSegmentRadius) / 2;
    }

    getTotalLength() {
        return this.firstLegLength + this.curvedSegmentLength + this.secondLegLength;
    }

    getPointOnTheGround(length: number) {
        return {x: this.offset + length, y: 0};
    }

    getPointOnTheCurve(length: number) {
        if (length <= this.firstLegLength) {
            return {
                x: this.offset + length,
                y: 0
            }
        }

        if (length > this.firstLegLength && length < this.firstLegLength + this.curvedSegmentLength) {
            const angleToCurvedSegment = 270 + (90 * (length - this.firstLegLength)) / this.curvedSegmentLength;
            const pointOnTheCurvedSegment_x = (this.offset + this.firstLegLength) + this.curvedSegmentRadius * Math.cos(toRadians(angleToCurvedSegment));
            const pointOnTheCurvedSegment_y = (this.curvedSegmentRadius) + this.curvedSegmentRadius * Math.sin(toRadians(angleToCurvedSegment));

            return {
                x: pointOnTheCurvedSegment_x,
                y: pointOnTheCurvedSegment_y
            }
        }

        if (length <= this.firstLegLength + this.curvedSegmentLength + this.secondLegLength) {
            return {
                x: this.offset + this.firstLegLength + this.curvedSegmentRadius,
                y: this.curvedSegmentRadius + length - this.firstLegLength - this.curvedSegmentLength
            }
        }
    }

    getShootingPoint(length: number, viewPoint: Point): Point {
        const pointOnTheGround = this.getPointOnTheGround(length);
        const {angle, distance} = this.getCorrectedViewAngle(length, viewPoint);
        const shootingPoint = SimpleCurve.viewPointFromGroundAngleDistance(pointOnTheGround, angle, distance);

        return shootingPoint;
    }

    private static viewPointFromGroundAngleDistance(point: Point, angle: number, distance: number): Point {
        const {B} = calculateTriangleCustom(point, angle, distance);

        return B;
    }

    private getCorrectedViewAngle(length: number, viewPoint: Point): { angle: number, distance: number } {
        const point = this.getPointOnTheCurve(length);

        if (length <= this.firstLegLength) {
            const {alpha, c} = calculateTriangleFromCoordinates(point, viewPoint, {x: 0, y: 0});
            return {angle: alpha, distance: c};
        }

        if (length > this.firstLegLength && length < this.firstLegLength + this.curvedSegmentLength) {
            const {alpha, c} = calculateTriangleFromCoordinates(point, viewPoint, {
                x: this.offset + this.firstLegLength,
                y: this.curvedSegmentRadius
            });

            const lineEquation_c = lineEquationFrom2PointsByX(point, viewPoint);
            const lineEquation_c_result_y = lineEquation_c(this.offset + this.firstLegLength);

            const angle = lineEquation_c_result_y <= this.curvedSegmentRadius ? 90 - alpha : 90 + alpha;

            return {angle, distance: c};
        }

        if (length <= this.firstLegLength + this.curvedSegmentLength + this.secondLegLength) {
            const {alpha, c} = calculateTriangleFromCoordinates(point, viewPoint, {
                x: this.offset + this.firstLegLength + this.curvedSegmentRadius,
                y: 0
            });
            return {angle: alpha, distance: c};
        }
    }
}