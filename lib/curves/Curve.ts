import {Point} from "../math";

export interface Curve {
    getPointOnTheCurve(length: number): Point;

    getPointOnTheGround(length: number): Point;

    getShootingPoint(length: number, viewPoint): Point;

    getTotalLength(): number;
}