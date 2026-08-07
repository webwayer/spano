import type { Segment, Triple } from '../types';

/**
 * A new segment starts where the shooting error changes character by more than
 * this many degrees between adjacent samples.
 *
 * Measured over the golden corpus (10,985 deltas): 10,891 sit at or below the
 * threshold, 94 above it, and the nearest neighbours either side are 0.0685 and
 * 0.1877. So there is real margin — but roughly 0.07 to 0.19, not the orders of
 * magnitude an earlier version of this comment claimed. Moving the threshold to
 * 0.11 moves no case; moving it to 0.49 breaks three golden files.
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
