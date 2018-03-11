import { drawLine, drawPoint } from "./draw";

export function drawShots(shots, viewPoint, topCanvas, bottomCanvas) {
    const topCanvasContext = topCanvas.getContext("2d");
    const bottomCanvasContext = bottomCanvas.getContext("2d");

    topCanvasContext.clearRect(0, 0, topCanvas.width, topCanvas.height);
    bottomCanvasContext.clearRect(0, 0, bottomCanvas.width, bottomCanvas.height);

    for (const shot of shots) {
        const firstElement = shot.triples[0];
        const centerElement = shot.triples[parseInt((shot.triples.length / 2).toFixed())];
        const lastElement = shot.triples[shot.triples.length - 1];

        let shootingTriple;
        if (shot.shotOn === 'start') {
            shootingTriple = firstElement
        }
        if (shot.shotOn === 'center') {
            shootingTriple = centerElement
        }
        if (shot.shotOn === 'end') {
            shootingTriple = lastElement
        }

        for (const { pointOnTheCurve, pointOnTheGround, shootingPoint } of shot.triples) {
            drawLine(topCanvasContext, pointOnTheGround, shootingPoint, '#b6b9ff');
            drawLine(bottomCanvasContext, viewPoint, pointOnTheCurve, '#ffc2fc');
            drawPoint(bottomCanvasContext, pointOnTheCurve, '#ff00f1');
        }

        drawLine(topCanvasContext, firstElement.pointOnTheGround, shootingTriple.shootingPoint, '#3c3fff');
        drawLine(topCanvasContext, lastElement.pointOnTheGround, shootingTriple.shootingPoint, '#3c3fff');
    }
}