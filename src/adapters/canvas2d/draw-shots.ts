import { drawLine, drawPoint } from './draw';
import type { Point, Shot } from '../../core/types';

/**
 * Top canvas: each shot's sight lines from its hover position down to the
 * ground, with the frame edges picked out.
 * Bottom canvas: the viewer's sight lines onto the panorama surface.
 *
 * Both canvases are in world units with no transform, so the caller flips the
 * top one in CSS to put +y upward.
 */
export function drawShots(
    shots: Shot[],
    viewPoint: Point,
    topCanvas: HTMLCanvasElement,
    bottomCanvas: HTMLCanvasElement
): void {
    const topCanvasContext = topCanvas.getContext('2d');
    const bottomCanvasContext = bottomCanvas.getContext('2d');
    if (!topCanvasContext || !bottomCanvasContext) {
        throw new Error('Could not get a 2D drawing context — the browser may be out of memory.');
    }

    topCanvasContext.clearRect(0, 0, topCanvas.width, topCanvas.height);
    bottomCanvasContext.clearRect(0, 0, bottomCanvas.width, bottomCanvas.height);

    for (const shot of shots) {
        const firstElement = shot.triples[0];
        const centerElement = shot.triples[parseInt((shot.triples.length / 2).toFixed(), 10)];
        const lastElement = shot.triples[shot.triples.length - 1];

        const shootingTriple =
            shot.shotOn === 'start' ? firstElement : shot.shotOn === 'end' ? lastElement : centerElement;

        for (const { pointOnTheCurve, pointOnTheGround, shootingPoint } of shot.triples) {
            drawLine(topCanvasContext, pointOnTheGround, shootingPoint, '#b6b9ff');
            drawLine(bottomCanvasContext, viewPoint, pointOnTheCurve, '#ffc2fc');
            drawPoint(bottomCanvasContext, pointOnTheCurve, '#ff00f1');
        }

        drawLine(topCanvasContext, firstElement.pointOnTheGround, shootingTriple.shootingPoint, '#3c3fff');
        drawLine(topCanvasContext, lastElement.pointOnTheGround, shootingTriple.shootingPoint, '#3c3fff');
    }
}
