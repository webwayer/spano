import { reliefRows, tangentFromNadir } from '../../core/quality/height';
import type { StripPlacement } from '../../core/imaging/strip-warp';

/**
 * Put every raised object back over its own base.
 *
 * This is the true-orthophoto correction, and it is the only mode here that
 * *removes* the defect rather than hiding it. An aerial frame draws an object
 * of height `h` as though it stood at `h·tanθ` from its real position — the
 * relief displacement that leans buildings outward in an ordinary orthophoto,
 * and the exact reason two strips disagree about a tree. Measure `h` and the
 * displacement can be subtracted, at which point every strip agrees about
 * where the tree is because all of them are drawing it over its footprint.
 *
 * What it costs, stated plainly: an object moved back over its base leaves a
 * hole behind it, because the ground it was covering was never photographed
 * from that angle. True-orthophoto pipelines fill those from a neighbouring
 * frame that did see them; here the neighbouring strip is already in the other
 * layer, so the hole is filled from there when it can be.
 *
 * And what it cannot do: the height is measured at the seams, because that is
 * where two frames overlap. Between seams it is interpolated, so a tree that
 * begins and ends inside one strip is invisible to it. Denser capture shortens
 * the gaps, which is one more thing the dense pass buys.
 */

export interface HeightProfile {
    /** Panorama row the profile was measured at. */
    readonly row: number;
    /** Metres above the ground, per panorama column. */
    readonly heights: Float64Array;
}

/** Height at a column and row, interpolated between the seams that bracket it. */
function heightAt(profiles: readonly HeightProfile[], column: number, row: number): number {
    if (profiles.length === 0) return 0;

    const first = profiles[0];
    const last = profiles[profiles.length - 1];
    if (!first || !last) return 0;
    if (row <= first.row) return first.heights[column] ?? 0;
    if (row >= last.row) return last.heights[column] ?? 0;

    for (let index = 1; index < profiles.length; index++) {
        const above = profiles[index - 1];
        const below = profiles[index];
        if (!above || !below || row > below.row) continue;

        const span = below.row - above.row;
        const t = span > 0 ? (row - above.row) / span : 0;
        return (above.heights[column] ?? 0) * (1 - t) + (below.heights[column] ?? 0) * t;
    }

    return 0;
}

export interface OrthoOptions {
    readonly placements: readonly StripPlacement[];
    readonly profiles: readonly HeightProfile[];
    /** Signed panorama rows per ground metre. */
    readonly rowsPerMetre: number;
    readonly width: number;
    readonly height: number;
}

/**
 * Compose the two layers with each pixel moved back over its base.
 *
 * The correction is a vertical resample, so the layers are read at a shifted
 * row rather than written to one: writing would leave gaps wherever the shift
 * expands, and reading fills them by construction.
 */
export function composeOrthorectified(even: ImageData, odd: ImageData, options: OrthoOptions): ImageData {
    const { placements, profiles, rowsPerMetre, width, height } = options;
    const out = new ImageData(width, height);

    const ordered = [...placements].sort((a, b) => a.nominal.y - b.nominal.y);

    for (let row = 0; row < height; row++) {
        // Which strip owns this row, by its nominal (non-overlapping) extent.
        let owner = ordered.findIndex(placement => row < placement.nominal.y + placement.nominal.height);
        if (owner < 0) owner = ordered.length - 1;

        const placement = ordered[owner];
        if (!placement) continue;

        const step = placement.sampling;
        const primary = placement.layer === 0 ? even : odd;
        const secondary = placement.layer === 0 ? odd : even;

        // The strip's own angle from nadir at the ground it is looking at,
        // which is what sets how far it threw the object.
        const tangent = tangentFromNadir(step.camera, step.ground);

        for (let column = 0; column < width; column++) {
            const objectHeight = heightAt(profiles, column, row);
            const shift = reliefRows(objectHeight, tangent, rowsPerMetre);

            const source = Math.min(height - 1, Math.max(0, Math.round(row + shift)));
            const target = (row * width + column) * 4;
            const from = (source * width + column) * 4;

            const layer = (primary.data[from + 3] ?? 0) >= 128 ? primary : secondary;
            for (let channel = 0; channel < 4; channel++) {
                out.data[target + channel] = layer.data[from + channel] ?? 0;
            }
        }
    }

    return out;
}
