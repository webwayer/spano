import { getTopAngle } from '../geometry/triangle';
import type { Segment, Shot, Triple } from '../types';

/** A segment whose average error is below this is treated as flat. */
export const FLAT_SEGMENT_ERROR = 0.01;

/**
 * Stage 4 — decide how many photographs cover each segment, and where within
 * its sample range each one is anchored.
 *
 * Flat segments just get split so no frame exceeds the sensor's usable angle.
 * Curved segments additionally cap the distortion accumulated across a frame,
 * and are laid out start / centre-pairs / end so the seams fall where the
 * mismatch is smallest.
 *
 * KNOWN DEFECT (recorded in tests/golden/README.md): when a curved segment is
 * short enough that splitBy yields a single sub-array, restShots[1] and
 * restShots[2] are undefined and undefined triples reach convertShotsIntoSteps.
 * Preserved deliberately in Phase 3 so the golden baselines stay meaningful;
 * fixed in Phase 4.
 */
export function divideSegmentsIntoShots(segments: Segment[], maxViewAngle: number, maxDistortionAngle: number): Shot[] {
    const shots: Shot[] = [];
    for (const segment of segments) {
        if (segment.avgError < FLAT_SEGMENT_ERROR) {
            const flatShots = splitBy(segment.triples, triplesForShot => {
                const firstElement = triplesForShot[0];
                const lastElement = triplesForShot[triplesForShot.length - 1];

                const currentShotViewAngle = getTopAngle(
                    firstElement.shootingPoint,
                    firstElement.pointOnTheGround,
                    lastElement.pointOnTheGround
                );
                return currentShotViewAngle <= maxViewAngle;
            });

            for (const flatShot of flatShots) {
                shots.push({
                    shotOn: 'center',
                    triples: flatShot,
                });
            }
        } else {
            const curvedShots = splitBy(segment.triples, triplesForShot => {
                const firstElement = triplesForShot[0];
                const lastElement = triplesForShot[triplesForShot.length - 1];

                const currentShotViewAngle = getTopAngle(
                    firstElement.shootingPoint,
                    firstElement.pointOnTheGround,
                    lastElement.pointOnTheGround
                );
                if (currentShotViewAngle > maxViewAngle) {
                    return false;
                }

                return segment.avgError * (triplesForShot.length - 1) <= maxDistortionAngle;
            });

            shots.push({
                shotOn: 'start',
                triples: curvedShots[0],
            });

            const middleShots = curvedShots.slice(
                1,
                curvedShots.length % 2 ? curvedShots.length - 2 : curvedShots.length - 3
            );
            for (let i = 0; i < middleShots.length; i += 2) {
                shots.push({
                    shotOn: 'center',
                    triples: ([] as Triple[]).concat(middleShots[i], middleShots[i + 1]),
                });
            }

            const restShots = curvedShots.slice(curvedShots.length % 2 ? curvedShots.length - 2 : curvedShots.length - 3);
            shots.push({
                shotOn: 'end',
                triples: restShots[0],
            });

            const lastShotTriples =
                restShots.slice(1).length === 1
                    ? restShots[1]
                    : ([] as Triple[]).concat(restShots[1], restShots[2]);
            shots.push({
                shotOn: 'start',
                triples: lastShotTriples.slice(0, parseInt((lastShotTriples.length / 2).toFixed(), 10)),
            });
            shots.push({
                shotOn: 'end',
                triples: lastShotTriples.slice(parseInt((lastShotTriples.length / 2).toFixed(), 10)),
            });
        }
    }

    // Consecutive shots deliberately overlap by one sample so the seam between
    // two frames has a shared reference point.
    for (let i = 1; i < shots.length; i++) {
        shots[i].triples.unshift(shots[i - 1].triples[shots[i - 1].triples.length - 1]);
    }

    return shots;
}

/**
 * Greedily accumulate items into sub-arrays, closing one off whenever adding the
 * next item would make the group fail `isGood`.
 */
function splitBy<T>(array: T[], isGood: (candidate: T[], index: number) => boolean): T[][] {
    const subArrays: T[][] = [];

    let currentSubArray: T[] = [];
    for (let i = 0; i < array.length; i++) {
        const item = array[i];

        if (!currentSubArray[0]) {
            currentSubArray.push(item);
            continue;
        }

        if (item === array[array.length - 1]) {
            currentSubArray.push(item);
            subArrays.push(currentSubArray);
            break;
        }

        const currentSubArrayTry = ([] as T[]).concat(currentSubArray, [item]);
        if (isGood(currentSubArrayTry, i)) {
            currentSubArray.push(item);
        } else {
            subArrays.push(currentSubArray);
            currentSubArray = [];
            currentSubArray.push(item);
        }
    }

    return subArrays;
}
