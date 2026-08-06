import { calculateTriangleCustom2, getTopAngle } from '../geometry/triangle';
import type { Point, Shot, Step, Triple } from '../types';

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
    return shots.map(toStep);
}

function toStep(shot: Shot): Step {
    const firstElement = at(shot.triples, 0, shot);
    const centerElement = at(shot.triples, parseInt((shot.triples.length / 2).toFixed(), 10), shot);
    const lastElement = at(shot.triples, shot.triples.length - 1, shot);

    const { shootingPoint, shootedPoint } = anchor(shot.shotOn, firstElement, centerElement, lastElement);

    const angleOfView = getTopAngle(shootingPoint, firstElement.pointOnTheGround, lastElement.pointOnTheGround);

    // getTopAngle measures from straight down, so subtracting 90 gives pitch
    // relative to horizontal: negative points the gimbal down.
    const viewAngleToTheGround = getTopAngle(shootingPoint, { x: shootingPoint.x, y: 0 }, shootedPoint) - 90;

    return {
        angleOfView,
        shootingPoint,
        shootedPoint,
        firstElement,
        lastElement,
        centerElement,
        viewAngleToTheGround,
        shotOn: shot.shotOn,
        // The aircraft has overflown the ground point it is imaging, so it must
        // turn around and shoot back down the track.
        backwards: shootingPoint.x > shootedPoint.x,
    };
}

/**
 * A switch rather than three independent `if`s.
 *
 * The 2018 version assigned shootingPoint inside three separate ifs with no
 * else, so an unrecognised anchor left both variables undefined and the failure
 * surfaced several frames later. Exhaustiveness is now checked at compile time.
 */
function anchor(
    shotOn: Shot['shotOn'],
    first: Triple,
    center: Triple,
    last: Triple
): { shootingPoint: Point; shootedPoint: Point } {
    switch (shotOn) {
        case 'start':
            return { shootingPoint: first.shootingPoint, shootedPoint: first.pointOnTheGround };

        case 'end':
            return { shootingPoint: last.shootingPoint, shootedPoint: last.pointOnTheGround };

        case 'center': {
            const shootingPoint = center.shootingPoint;
            const angleOfView = getTopAngle(shootingPoint, first.pointOnTheGround, last.pointOnTheGround);
            const triangle = calculateTriangleCustom2(
                shootingPoint,
                angleOfView / 2,
                first.pointOnTheGround,
                getTopAngle(first.pointOnTheGround, shootingPoint, last.pointOnTheGround)
            );
            return { shootingPoint, shootedPoint: triangle.B };
        }

        default: {
            const unreachable: never = shotOn;
            throw new Error(`Unknown shot anchor: ${String(unreachable)}`);
        }
    }
}

/**
 * Indexed access that says what went wrong.
 *
 * Under noUncheckedIndexedAccess every triples[i] is possibly undefined. It
 * genuinely can be — see the allocation defect this phase fixes — and the old
 * symptom was "Cannot read properties of undefined (reading 'pointOnTheGround')"
 * four stack frames from the cause.
 */
function at(triples: Triple[], index: number, shot: Shot): Triple {
    const triple = triples[index];
    if (!triple) {
        throw new Error(
            `Shot anchored on "${shot.shotOn}" has no sample at index ${index} ` +
                `(it holds ${triples.length}). This is a planner bug, not bad input.`
        );
    }
    return triple;
}
