import type { SeamBand } from '../../core/imaging/strip-warp';

/**
 * Choose where neighbouring strips should be cut, and hide the cut.
 *
 * The warp lines the ground up exactly, so what remains at a seam is the
 * parallax of everything standing above it — a tree cut in half and offset,
 * which is what the eye actually notices. Nothing planar can fix that. What can
 * be done is to route the cut *around* the tree and through the flat grass
 * beside it, and then soften what is left.
 *
 * The seam is found by dynamic programming rather than by a graph cut, and that
 * is a considered choice, not a shortcut. Graph cuts earn their cost when the
 * overlap is a two-dimensional region and the boundary may take any shape.
 * Here the overlap is a horizontal band and the cut has to cross it left to
 * right exactly once, so the optimal path is a shortest path through a grid —
 * which dynamic programming solves exactly, in O(width x height), in about
 * twenty lines, and without needing a worker to stay off the main thread.
 *
 * What this is not: multi-band blending. The feather below hides a cut in
 * detail; it does not hide a difference in exposure between two photographs
 * taken minutes apart, because that lives at a spatial scale far wider than the
 * feather. Laplacian pyramids are the answer to that, and they are the next
 * thing to build here.
 */

/** Rows either side of the seam over which the two strips are mixed. */
const FEATHER = 6;

/** Cost charged where only one of the two layers has any pixel at all. */
const MISSING_PENALTY = 1e6;

function difference(a: ImageData, b: ImageData, index: number): number {
    const alphaA = a.data[index + 3] ?? 0;
    const alphaB = b.data[index + 3] ?? 0;
    // Near a frame's edge one layer runs out. Cutting there would leave a hole,
    // so the path is pushed away rather than forbidden outright — forbidding it
    // can make a band with a ragged edge unsolvable.
    if (alphaA < 128 || alphaB < 128) return MISSING_PENALTY;

    return (
        Math.abs((a.data[index] ?? 0) - (b.data[index] ?? 0)) +
        Math.abs((a.data[index + 1] ?? 0) - (b.data[index + 1] ?? 0)) +
        Math.abs((a.data[index + 2] ?? 0) - (b.data[index + 2] ?? 0))
    );
}

/**
 * The row at which to switch layers, for every column of a band.
 *
 * Returns absolute panorama rows. The path moves by at most one row per column,
 * which keeps the cut from zig-zagging into something that reads as a tear.
 */
export function findSeam(above: ImageData, below: ImageData, band: SeamBand, width: number): Int32Array {
    const top = Math.max(0, Math.floor(band.y));
    const rows = Math.max(1, Math.min(Math.ceil(band.height), above.height - top));

    const cost = new Float64Array(width * rows);
    const from = new Int32Array(width * rows);

    for (let row = 0; row < rows; row++) {
        cost[row] = difference(above, below, ((top + row) * width + 0) * 4);
    }

    for (let column = 1; column < width; column++) {
        for (let row = 0; row < rows; row++) {
            let best = cost[(column - 1) * rows + row] ?? Infinity;
            let bestRow = row;

            for (const candidate of [row - 1, row + 1]) {
                if (candidate < 0 || candidate >= rows) continue;
                const value = cost[(column - 1) * rows + candidate] ?? Infinity;
                if (value < best) {
                    best = value;
                    bestRow = candidate;
                }
            }

            cost[column * rows + row] = best + difference(above, below, ((top + row) * width + column) * 4);
            from[column * rows + row] = bestRow;
        }
    }

    let end = 0;
    for (let row = 1; row < rows; row++) {
        if ((cost[(width - 1) * rows + row] ?? Infinity) < (cost[(width - 1) * rows + end] ?? Infinity)) end = row;
    }

    const seam = new Int32Array(width);
    let row = end;
    for (let column = width - 1; column >= 0; column--) {
        seam[column] = top + row;
        row = from[column * rows + row] ?? row;
    }
    return seam;
}

export interface SeamedLayer {
    readonly pixels: ImageData;
    /** Panorama rows this layer owns before any seam is considered. */
    readonly ownsFrom: Float64Array;
}

/**
 * Mix two layers along the chosen seams.
 *
 * `switchRow` holds, for every column, the row at or below which the lower
 * layer takes over. Outside the bands the boundaries are the strips' nominal
 * edges, so a plan whose seams could not be optimised still composites
 * correctly — it simply cuts straight, exactly as before.
 */
export function blendAlongSeams(
    even: ImageData,
    odd: ImageData,
    switchRows: readonly { readonly rows: Int32Array; readonly lowerIsOdd: boolean }[],
    width: number,
    height: number
): ImageData {
    const out = new ImageData(width, height);

    // Per column, the boundaries in order, so a row can be assigned by counting
    // how many it has passed.
    for (let column = 0; column < width; column++) {
        let boundary = 0;
        // Layer that owns the very top of the panorama.
        let oddOnTop = switchRows[0] ? !switchRows[0].lowerIsOdd : false;

        for (let row = 0; row < height; row++) {
            while (boundary < switchRows.length && row >= (switchRows[boundary]?.rows[column] ?? Infinity)) {
                oddOnTop = switchRows[boundary]?.lowerIsOdd ?? oddOnTop;
                boundary++;
            }

            const index = (row * width + column) * 4;
            const primary = oddOnTop ? odd : even;
            const secondary = oddOnTop ? even : odd;

            // Feather across the nearest boundary, so the cut stops being a line.
            const next = switchRows[boundary]?.rows[column];
            const previous = boundary > 0 ? switchRows[boundary - 1]?.rows[column] : undefined;
            const distance = Math.min(
                next === undefined ? Infinity : Math.abs(next - row),
                previous === undefined ? Infinity : Math.abs(row - previous)
            );

            let mix = distance >= FEATHER ? 1 : 0.5 + (0.5 * distance) / FEATHER;
            if ((primary.data[index + 3] ?? 0) < 128) mix = 0;
            else if ((secondary.data[index + 3] ?? 0) < 128) mix = 1;

            for (let channel = 0; channel < 4; channel++) {
                out.data[index + channel] =
                    (primary.data[index + channel] ?? 0) * mix + (secondary.data[index + channel] ?? 0) * (1 - mix);
            }
        }
    }

    return out;
}
