import { calculateTriangleCustom2, getTopAngle } from '../geometry/triangle';
import type { Point, Shot, Step } from '../types';

/**
 * Stage 5 — turn each shot into a pilot instruction: hover position, gimbal
 * pitch, and the angular height of the strip to keep from the frame.
 *
 * `shotOn` decides which sample supplies the hover position. A 'center' shot
 * hovers at the middle sample and aims at the point that bisects its view, so
 * the strip is centred in frame; 'start' and 'end' shots hover at an endpoint
 * and aim at that endpoint's ground patch, putting the strip against one edge.
 */
export function convertShotsIntoSteps(shots: Shot[]): Step[] {
    return shots.map(shot => {
        const firstElement = shot.triples[0];
        const centerElement = shot.triples[parseInt((shot.triples.length / 2).toFixed(), 10)];
        const lastElement = shot.triples[shot.triples.length - 1];

        let shootingPoint: Point;
        let shootedPoint: Point;
        if (shot.shotOn === 'start') {
            shootingPoint = firstElement.shootingPoint;
            shootedPoint = firstElement.pointOnTheGround;
        }
        if (shot.shotOn === 'center') {
            shootingPoint = centerElement.shootingPoint;

            const angleOfView = getTopAngle(
                shootingPoint,
                firstElement.pointOnTheGround,
                lastElement.pointOnTheGround
            );
            const triangle = calculateTriangleCustom2(
                shootingPoint,
                angleOfView / 2,
                firstElement.pointOnTheGround,
                getTopAngle(firstElement.pointOnTheGround, shootingPoint, lastElement.pointOnTheGround)
            );
            shootedPoint = triangle.B;
        }
        if (shot.shotOn === 'end') {
            shootingPoint = lastElement.shootingPoint;
            shootedPoint = lastElement.pointOnTheGround;
        }

        const angleOfView = getTopAngle(shootingPoint, firstElement.pointOnTheGround, lastElement.pointOnTheGround);

        const viewAngleToTheGround =
            getTopAngle(shootingPoint, { x: shootingPoint.x, y: 0 }, shootedPoint) - 90;

        return {
            angleOfView,
            shootingPoint,
            shootedPoint,
            firstElement,
            lastElement,
            centerElement,
            viewAngleToTheGround,
            shotOn: shot.shotOn,
            // The aircraft has overflown the ground point it is imaging, so it
            // must turn around and shoot back down the track.
            backwards: shootingPoint.x > shootedPoint.x,
        };
    });
}
