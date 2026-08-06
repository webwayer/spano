import { getTopAngle } from '../geometry/triangle';
import type { Segment, Shot, ShotAnchor, Triple } from '../types';

/** A segment whose average error is below this is treated as flat. */
export const FLAT_SEGMENT_ERROR = 0.01;

/**
 * Below this many sub-groups, the start / centre-pairs / end layout cannot be
 * built without indexing past the end of the array.
 *
 * The 2018 code had no such guard. With one or two groups, `restShots.slice(1)`
 * is empty, so the `length === 1` test fell through to
 * `[].concat(restShots[1], restShots[2])` and produced `[undefined, undefined]`.
 * The unshift below then masked the first undefined but not the last, and the
 * failure surfaced in convertShotsIntoSteps as "Cannot read properties of
 * undefined (reading 'pointOnTheGround')". Three groups is already safe.
 */
const MIN_GROUPS_FOR_ANCHORED_LAYOUT = 3;

/**
 * Stage 4 — decide how many photographs cover each segment, and where within
 * its sample range each one is anchored.
 *
 * Flat segments just get split so no frame exceeds the sensor's usable angle.
 * Curved segments additionally cap the distortion accumulated across a frame,
 * and are laid out start / centre-pairs / end so the seams fall where the
 * mismatch between adjacent frames is smallest.
 */
export function divideSegmentsIntoShots(segments: Segment[], maxViewAngle: number, maxDistortionAngle: number): Shot[] {
    const shots: Shot[] = [];

    for (const segment of segments) {
        if (segment.avgError < FLAT_SEGMENT_ERROR) {
            shots.push(...planFlatSegment(segment, maxViewAngle));
        } else {
            shots.push(...planCurvedSegment(segment, maxViewAngle, maxDistortionAngle));
        }
    }

    // Consecutive shots deliberately overlap by one sample, so the seam between
    // two frames has a shared reference point.
    for (let i = 1; i < shots.length; i++) {
        const previous = shots[i - 1];
        const current = shots[i];
        if (!previous || !current) continue;
        const handover = previous.triples[previous.triples.length - 1];
        if (handover) {
            current.triples.unshift(handover);
        }
    }

    return shots;
}

function planFlatSegment(segment: Segment, maxViewAngle: number): Shot[] {
    const groups = splitBy(segment.triples, group => viewAngleOf(group) <= maxViewAngle);
    return groups.map(triples => ({ shotOn: 'center' as const, triples }));
}

function planCurvedSegment(segment: Segment, maxViewAngle: number, maxDistortionAngle: number): Shot[] {
    const groups = splitBy(segment.triples, group => {
        if (viewAngleOf(group) > maxViewAngle) return false;
        return segment.avgError * (group.length - 1) <= maxDistortionAngle;
    });

    if (groups.length === 0) return [];

    // Too few groups for the anchored layout: give each group its own frame,
    // anchoring the outer ones at the segment's ends so the seams still land
    // where the mismatch is smallest.
    if (groups.length < MIN_GROUPS_FOR_ANCHORED_LAYOUT) {
        return groups.map((triples, i) => ({
            shotOn: anchorFor(i, groups.length),
            triples,
        }));
    }

    const shots: Shot[] = [];
    const tailStart = groups.length % 2 ? groups.length - 2 : groups.length - 3;

    shots.push({ shotOn: 'start', triples: required(groups, 0) });

    const middleGroups = groups.slice(1, tailStart);
    for (let i = 0; i < middleGroups.length; i += 2) {
        const a = middleGroups[i];
        const b = middleGroups[i + 1];
        if (!a) continue;
        shots.push({ shotOn: 'center', triples: b ? [...a, ...b] : [...a] });
    }

    const tail = groups.slice(tailStart);
    shots.push({ shotOn: 'end', triples: required(tail, 0) });

    // The final group is split in half so the segment ends on a matched pair.
    const remaining = tail.slice(1);
    const lastShotTriples = remaining.length === 1 ? required(remaining, 0) : remaining.flat();
    const half = parseInt((lastShotTriples.length / 2).toFixed(), 10);
    shots.push({ shotOn: 'start', triples: lastShotTriples.slice(0, half) });
    shots.push({ shotOn: 'end', triples: lastShotTriples.slice(half) });

    return shots;
}

function anchorFor(index: number, total: number): ShotAnchor {
    if (total === 1) return 'center';
    if (index === 0) return 'start';
    if (index === total - 1) return 'end';
    return 'center';
}

/** Angular height of ground covered by a group, as seen from its first sample. */
function viewAngleOf(group: Triple[]): number {
    const first = required(group, 0);
    const last = required(group, group.length - 1);
    return getTopAngle(first.shootingPoint, first.pointOnTheGround, last.pointOnTheGround);
}

function required<T>(array: T[], index: number): T {
    const value = array[index];
    if (value === undefined) {
        throw new Error(`Planner bug: expected an element at index ${index} of ${array.length}.`);
    }
    return value;
}

/**
 * Greedily accumulate items into groups, closing one off whenever adding the
 * next item would make the group fail `isGood`.
 */
function splitBy<T>(array: T[], isGood: (candidate: T[]) => boolean): T[][] {
    const groups: T[][] = [];

    let current: T[] = [];
    for (let i = 0; i < array.length; i++) {
        const item = array[i];
        if (item === undefined) continue;

        if (current.length === 0) {
            current.push(item);
            continue;
        }

        if (item === array[array.length - 1]) {
            current.push(item);
            groups.push(current);
            return groups;
        }

        if (isGood([...current, item])) {
            current.push(item);
        } else {
            groups.push(current);
            current = [item];
        }
    }

    return groups;
}
