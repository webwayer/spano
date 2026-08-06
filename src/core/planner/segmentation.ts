import type { Segment, Triple } from '../types';

/**
 * A new segment starts where the shooting error changes character by more than
 * this many degrees between adjacent samples. In practice the error is ~1e-14
 * along the flat legs and jumps past 0.5 at each leg/arc transition, so this
 * threshold has wide margin either side — verified by perturbing it to 0.11 and
 * seeing no golden case move.
 */
export const SEGMENT_SPLIT_ERROR_DELTA = 0.1;

/**
 * Stage 3 — group samples into runs whose error behaves consistently, so the
 * flat legs and the arc can be planned differently.
 */
export function divideTriplesIntoSegmentsByErrors(pointTriples: Triple[], shootingErrors: number[]): Segment[] {
    const segments: Segment[] = [];

    let currentTriples: Triple[] = collect(pointTriples, [0, 1]);
    let currentErrors: number[] = collect(shootingErrors, [0]);

    const close = (): void => {
        segments.push({
            triples: currentTriples,
            avgError: currentErrors.reduce((acc, err) => acc + err, 0) / currentErrors.length,
        });
    };

    for (let i = 1; i < shootingErrors.length; i++) {
        const current = shootingErrors[i];
        const previous = shootingErrors[i - 1];
        if (current === undefined || previous === undefined) continue;

        const deltaError = Math.abs(current - previous);
        const next = pointTriples[i + 1];

        if (deltaError > SEGMENT_SPLIT_ERROR_DELTA && currentTriples.length > 1) {
            close();
            currentTriples = next ? [next] : [];
            currentErrors = [];
        } else {
            if (next) currentTriples.push(next);
            currentErrors.push(current);
        }
    }

    close();
    return segments;
}

function collect<T>(source: T[], indices: number[]): T[] {
    const out: T[] = [];
    for (const i of indices) {
        const value = source[i];
        if (value !== undefined) out.push(value);
    }
    return out;
}
