import type { Point } from '../../core/types';

export function drawLine(ctx: CanvasRenderingContext2D, point1: Point, point2: Point, color: string): void {
    ctx.beginPath();
    ctx.moveTo(point1.x, point1.y);
    ctx.lineTo(point2.x, point2.y);
    ctx.strokeStyle = color;
    ctx.stroke();
}

export function drawPoint(ctx: CanvasRenderingContext2D, point: Point, color: string): void {
    drawLine(ctx, point, { x: point.x + 1, y: point.y + 1 }, color);
}
