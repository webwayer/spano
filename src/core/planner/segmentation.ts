import type { Segment, Triple } from '../types';

/**
 * A new segment starts where the shooting error changes character by more than
 * this many degrees between adjacent samples. In practice the error is ~1e-14
 * along the flat legs and jumps past 0.5 at each leg/arc transition, so this
 * threshold has a wide margin either side.
 */
export const SEGMENT_SPLIT_ERROR_DELTA = 0.1;

/**
 * Stage 3 — group samples into runs whose error behaves consistently, so the
 * flat legs and the arc can be planned differently.
 */
export function divideTriplesIntoSegmentsByErrors(pointTriples: Triple[], shootingErrors: number[]): Segment[] {
    const segments: Segment[] = [];
    let currentSegment = { triples: [pointTriples[0], pointTriples[1]], errors: [shootingErrors[0]] };
    for (let i = 1; i < shootingErrors.length; i++) {
        const deltaError = Math.abs(shootingErrors[i] - shootingErrors[i - 1]);
        if (deltaError > SEGMENT_SPLIT_ERROR_DELTA && currentSegment.triples.length > 1) {
            segments.push({
                triples: currentSegment.triples,
                avgError: currentSegment.errors.reduce((acc, err) => acc + err, 0) / currentSegment.errors.length,
            });
            currentSegment = { triples: [pointTriples[i + 1]], errors: [] };
        } else {
            currentSegment.triples.push(pointTriples[i + 1]);
            currentSegment.errors.push(shootingErrors[i]);
        }
    }
    segments.push({
        triples: currentSegment.triples,
        avgError: currentSegment.errors.reduce((acc, err) => acc + err, 0) / currentSegment.errors.length,
    });
    return segments;
}
