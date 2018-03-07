import { Point } from "../math";

export function drawLine(ctx, point1: Point, point2: Point, color: string) {
    ctx.beginPath();
    ctx.moveTo(point1.x, point1.y);
    ctx.lineTo(point2.x, point2.y);
    ctx.strokeStyle = color;
    ctx.stroke();
}

export function drawPoint(ctx, point: Point, color: string) {
    drawLine(ctx, point, { x: point.x + 1, y: point.y + 1 }, color)
}