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
    const centerElement = at(shot.triples, centerIndex(shot.triples.length), shot);
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
 * The middle sample of a shot.
 *
 * Rounding up means a 1-sample shot would index past the end, which threw and
 * denied the user a plan entirely — even for `start` and `end` anchors that
 * never read this value. The 2018 code left it `undefined` and worked, because
 * nothing downstream touches it for those anchors.
 *
 * Clamping is a no-op for every shot the planner produces today (the golden
 * corpus confirms it), and turns a crash into the obviously-correct answer for
 * a one-sample shot: the middle of one thing is that thing.
 */
function centerIndex(length: number): number {
    return Math.min(Math.round(length / 2), Math.max(0, length - 1));
}

/**
 * Indexed access that says what went wrong.
 *
 * Under noUncheckedIndexedAccess every triples[i] is possibly undefined. It
 * genuinely can be — see the allocation defect Phase 4 fixed — and the old
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
