import type { SeamBand } from '../../core/imaging/strip-warp';

/**
 * Measure how far the two layers disagree at a seam, and morph across it
 * instead of cutting.
 *
 * The warp lines the ground up exactly; what is left is the parallax of
 * everything standing above it, and at a seam that shows as an object in two
 * places at once. Choosing where to cut hides it. Measuring the displacement
 * and sliding one view onto the other removes the jump itself — the object
 * travels smoothly across the band rather than stepping. It is the technique
 * Google's Jump and Facebook's Surround 360 both settled on for the same
 * reason: the ray you want was never photographed, so interpolate towards it.
 *
 * **The flow is one-dimensional, and that is physics rather than laziness.** A
 * parallax displacement lies along the epipolar line, which is set by the
 * direction the camera moved. Here the aircraft moves along the track, and the
 * track projects into the panorama very nearly vertically — so the disagreement
 * is vertical too. Searching two dimensions would cost a hundred times more and
 * spend it looking where the answer cannot be.
 *
 * **One displacement per column, not per pixel.** A per-pixel field needs
 * regularisation to stay coherent, and without it produces a torn, shimmering
 * result that looks worse than the honest step it replaced. A column is the
 * natural unit here because the band is short and the disagreement varies
 * across the panorama, not down it.
 *
 * What this is not: a general optical flow implementation, and not view
 * synthesis of whole frames. It interpolates across a seam, which is where the
 * defect is visible, and claims nothing beyond that.
 */

/**
 * Furthest the two layers are searched apart, in panorama rows.
 *
 * Bounded by the overlap as well as by this: a disagreement larger than the
 * band cannot be seen inside it, whatever the search is willing to try. That is
 * a structural limit on how tall a thing can be measured, not a tuning choice —
 * `searchRangeFor` makes it explicit so the caller can say what the ceiling is
 * rather than quietly reporting saturated values as if they were readings.
 */
const MAX_DISPARITY = 40;

/** Rows the search may reach in a band of this height. */
export function searchRangeFor(bandHeight: number): number {
    return Math.max(1, Math.min(MAX_DISPARITY, Math.floor(bandHeight * 0.45)));
}

/** Columns either side included in a column's matching cost. */
const WINDOW = 3;

/** Columns averaged over when smoothing the result. */
const SMOOTHING = 9;

function luminance(pixels: ImageData, x: number, y: number, width: number): number {
    const index = (y * width + x) * 4;
    if ((pixels.data[index + 3] ?? 0) < 128) return -1;
    return (
        0.299 * (pixels.data[index] ?? 0) +
        0.587 * (pixels.data[index + 1] ?? 0) +
        0.114 * (pixels.data[index + 2] ?? 0)
    );
}

/**
 * For every column, how far down the lower layer's content sits relative to the
 * upper layer's.
 *
 * Zero where nothing can be matched — an empty band, or one where a layer has
 * run out of photograph. Zero is the honest answer there: it degrades to a
 * plain cross-fade rather than sliding the picture by a number invented from
 * noise.
 */
export function columnDisparities(above: ImageData, below: ImageData, band: SeamBand, width: number): Int32Array {
    const disparities = new Int32Array(width);

    const top = Math.max(0, Math.floor(band.y));
    const rows = Math.floor(band.height);
    if (rows < 3) return disparities;

    const range = searchRangeFor(rows);
    const bestCost = new Float64Array(width).fill(Infinity);
    const raw = new Int32Array(width);

    const columnCost = new Float64Array(width);
    const columnCount = new Int32Array(width);
    const smoothed = new Float64Array(width);

    // One pass over the band per candidate shift, rather than one per column
    // per shift. The horizontal window is then a box filter over the finished
    // column costs instead of a nested loop inside them, which is the same
    // number and about seven times less work — on a plan with forty seams that
    // is the difference between a wait and a hang.
    for (let shift = -range; shift <= range; shift++) {
        columnCost.fill(0);
        columnCount.fill(0);

        for (let row = 0; row < rows; row++) {
            const y = top + row;
            const shifted = y + shift;
            if (shifted < 0 || shifted >= below.height) continue;

            for (let x = 0; x < width; x++) {
                const a = luminance(above, x, y, width);
                if (a < 0) continue;
                const b = luminance(below, x, shifted, width);
                if (b < 0) continue;

                columnCost[x] = (columnCost[x] ?? 0) + Math.abs(a - b);
                columnCount[x] = (columnCount[x] ?? 0) + 1;
            }
        }

        // Running sums, so the window costs two array reads per column rather
        // than fifteen.
        let windowCost = 0;
        let windowCount = 0;
        for (let x = 0; x <= Math.min(width - 1, WINDOW); x++) {
            windowCost += columnCost[x] ?? 0;
            windowCount += columnCount[x] ?? 0;
        }

        for (let x = 0; x < width; x++) {
            smoothed[x] = windowCount > 0 ? windowCost / windowCount : Infinity;

            const leaving = x - WINDOW;
            const entering = x + WINDOW + 1;
            if (leaving >= 0) {
                windowCost -= columnCost[leaving] ?? 0;
                windowCount -= columnCount[leaving] ?? 0;
            }
            if (entering < width) {
                windowCost += columnCost[entering] ?? 0;
                windowCount += columnCount[entering] ?? 0;
            }
        }

        for (let x = 0; x < width; x++) {
            const cost = smoothed[x] ?? Infinity;
            if (cost < (bestCost[x] ?? Infinity)) {
                bestCost[x] = cost;
                raw[x] = shift;
            }
        }
    }

    // Smoothed across columns. A neighbouring pair disagreeing by ten rows is a
    // matching failure, not a feature of the scene, and left alone it tears the
    // morph.
    let total = 0;
    let counted = 0;
    for (let x = 0; x <= Math.min(width - 1, SMOOTHING); x++) {
        total += raw[x] ?? 0;
        counted++;
    }
    for (let x = 0; x < width; x++) {
        disparities[x] = Math.round(total / Math.max(1, counted));

        const leaving = x - SMOOTHING;
        const entering = x + SMOOTHING + 1;
        if (leaving >= 0) {
            total -= raw[leaving] ?? 0;
            counted--;
        }
        if (entering < width) {
            total += raw[entering] ?? 0;
            counted++;
        }
    }

    return disparities;
}

function sample(pixels: ImageData, x: number, y: number, width: number, height: number, out: Float64Array): boolean {
    const clamped = Math.min(height - 1, Math.max(0, Math.round(y)));
    const index = (clamped * width + x) * 4;
    if ((pixels.data[index + 3] ?? 0) < 128) return false;

    out[0] = pixels.data[index] ?? 0;
    out[1] = pixels.data[index + 1] ?? 0;
    out[2] = pixels.data[index + 2] ?? 0;
    out[3] = pixels.data[index + 3] ?? 0;
    return true;
}

export interface MorphBand {
    readonly band: SeamBand;
    readonly disparities: Int32Array;
    /** True when the layer below the band is the odd one. */
    readonly lowerIsOdd: boolean;
}

/**
 * Cross the seams by sliding rather than cutting.
 *
 * Within a band the mixing fraction runs from nothing to everything, and each
 * layer is read from where its own content has to come from for the object to
 * land at the interpolated position. Outside the bands the owning layer is used
 * directly.
 */
export function morphAlongSeams(
    even: ImageData,
    odd: ImageData,
    bands: readonly MorphBand[],
    width: number,
    height: number
): ImageData {
    const out = new ImageData(width, height);
    const fromAbove = new Float64Array(4);
    const fromBelow = new Float64Array(4);

    // Which layer owns the very top: whatever is not below the first band.
    const oddOnTopInitially = bands[0] ? !bands[0].lowerIsOdd : false;

    for (let row = 0; row < height; row++) {
        let index = bands.findIndex(entry => row < entry.band.y + entry.band.height);
        if (index < 0) index = bands.length;

        const active = bands[index];
        const inBand = active !== undefined && active.band.height > 0 && row >= active.band.y;

        let oddOnTop = oddOnTopInitially;
        for (let passed = 0; passed < index; passed++) oddOnTop = bands[passed]?.lowerIsOdd ?? oddOnTop;

        for (let column = 0; column < width; column++) {
            const target = (row * width + column) * 4;

            if (!inBand) {
                const layer = oddOnTop ? odd : even;
                for (let channel = 0; channel < 4; channel++) {
                    out.data[target + channel] = layer.data[target + channel] ?? 0;
                }
                continue;
            }

            const t = Math.min(1, Math.max(0, (row - active.band.y) / active.band.height));
            const disparity = active.disparities[column] ?? 0;

            const above = oddOnTop ? odd : even;
            const below = oddOnTop ? even : odd;

            const hasAbove = sample(above, column, row - t * disparity, width, height, fromAbove);
            const hasBelow = sample(below, column, row + (1 - t) * disparity, width, height, fromBelow);

            const weight = !hasBelow ? 1 : !hasAbove ? 0 : 1 - t;
            for (let channel = 0; channel < 4; channel++) {
                out.data[target + channel] =
                    (fromAbove[channel] ?? 0) * weight + (fromBelow[channel] ?? 0) * (1 - weight);
            }
        }
    }

    return out;
}
