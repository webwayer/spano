import { cutImage, generateCutPreviewImage, waitForImage } from '../adapters/imaging/images';
import { composeStack, imageDataToDataUrl } from '../adapters/imaging/compose';
import { blendAlongSeams, findSeam } from '../adapters/imaging/seam';
import { columnDisparities, morphAlongSeams, searchRangeFor, type MorphBand } from '../adapters/imaging/flow';
import { composeOrthorectified, type HeightProfile } from '../adapters/imaging/ortho';
import {
    MIN_ROWS_PER_METRE_OF_HEIGHT,
    heightsFromDisparities,
    rowsPerGroundMetre,
    summariseHeights,
} from '../core/quality/height';
import { parallaxReport } from '../core/quality/parallax';
import { warpLayer, warpPanorama, type WarpJob } from '../adapters/imaging/warp-gl';
import { downloadDataUrl } from '../adapters/download';
import { PREVIEW_CAMERA, type CameraProfile } from '../core/camera/profiles';
import {
    overlappingStrips,
    panoramaGeometryFor,
    seamBands,
    stripSampling,
    type PanoramaGeometry,
    type SeamBand,
    type StripPlacement,
} from '../core/imaging/strip-warp';
import type { Point, Step } from '../core/types';
import { clear, el, hide, input, onClick, select, setDisabled, setMessage, show } from './dom';
import { runReporting } from './errors';

const MAX_PREVIEW_WIDTH = 1000;

/**
 * Size the reprojected panorama is allowed to reach.
 *
 * The height is a cap, not a target: a curve sweeping a wide angle projects
 * arbitrarily tall, and the geometry lowers the focal length to fit rather than
 * losing one end of the picture. 1200 x 8000 is 38 MB of canvas, which a
 * browser will allocate without complaint.
 */
const PANORAMA_LIMITS = { width: 1200, maxHeight: 8000 };
const DEBUG_WIDTH = 500;
const OVERVIEW_WIDTH = 500;

/**
 * Every listener attached during a regeneration is registered against this
 * signal, so the next regeneration can drop all of them at once.
 */
let generation = new AbortController();

export function resetPreviewListeners(): AbortSignal {
    generation.abort();
    generation = new AbortController();
    return generation.signal;
}

/**
 * three.js is the large majority of the bundle, and the 3D preview is behind a
 * button many visitors never press. A dynamic import puts it in its own chunk,
 * fetched on first use, so the initial page load does not pay for it.
 *
 * Deliberately not a static import: that is the whole mechanism.
 */
async function loadRenderer(): Promise<typeof import('../adapters/scene3d/render-plan')> {
    return await import('../adapters/scene3d/render-plan');
}

/**
 * Crop each frame down to the strip the plan says to keep, and stack them.
 *
 * Prepending rather than appending builds the panorama bottom-up, matching the
 * order the aircraft flies: the first step images the ground nearest the viewer.
 */
/**
 * Read the flag without letting narrowing collapse it.
 *
 * TypeScript narrows `signal.aborted` to `false` after one check, but it is a
 * live getter that can flip across any `await` — so the second check inside the
 * loop is exactly the one that matters.
 */
function isAborted(signal: AbortSignal): boolean {
    return signal.aborted;
}

async function renderStrips(
    steps: Step[],
    images: string[],
    vFov: number,
    target: HTMLElement,
    mode: 'crop' | 'debug',
    signal: AbortSignal
): Promise<void> {
    if (images.length !== steps.length) {
        throw new Error(
            `This plan needs ${steps.length} photos, but ${images.length} were provided. ` +
                'Select exactly one photo per step, in the order they were taken.'
        );
    }

    for (let i = 0; i < steps.length; i++) {
        // Aborting removes listeners, but says nothing about a loop already
        // running. Without this check a regeneration mid-render kept appending
        // strips from the previous plan into a node the new one had cleared.
        if (isAborted(signal)) return;

        const step = steps[i];
        const image = images[i];
        if (!step || !image) continue;

        const isLast = i === steps.length - 1;
        const isFirst = i === 0;

        const dataUrl =
            mode === 'crop'
                ? await cutImage(step, image, vFov, isLast, isFirst)
                : await generateCutPreviewImage(step, image, vFov, isLast, isFirst);

        if (isAborted(signal)) return;

        const imageObject = await waitForImage(dataUrl);
        imageObject.alt =
            mode === 'crop'
                ? `Strip kept from frame ${i + 1} of ${steps.length}`
                : `Frame ${i + 1} of ${steps.length}, with the kept strip outlined`;

        if (mode === 'crop') {
            if (imageObject.width > MAX_PREVIEW_WIDTH) {
                imageObject.width = MAX_PREVIEW_WIDTH;
            }
            target.prepend(imageObject);
        } else {
            imageObject.width = DEBUG_WIDTH;
            target.append(imageObject);
        }
    }
}

/**
 * Wire up the synthetic 3D preview for a freshly computed plan.
 *
 * Nothing is rendered — and the three.js chunk is not even fetched — until the
 * button is pressed. Rendering eagerly would defer the download by a few
 * hundred milliseconds and no more, which is not what "lazy" is for.
 */
export function setup3DPreview(steps: Step[], viewPoint: Point, signal: AbortSignal): void {
    const generateButton = el<HTMLButtonElement>('generateButton3D');
    const debugButton = el<HTMLButtonElement>('generateDebug3D');
    const scene = el('scene3D');
    const preview = el('preview3D');
    const debug = el('debug3D');

    clear(preview);
    clear(debug);
    clear(scene);
    hide(preview);
    hide(debug);
    hide(debugButton);
    setDisabled(generateButton, false);

    const saveButton = setupSaveButton('savePanorama3D', preview, signal);

    /** Rendered once per plan, then reused by the debug view. */
    let rendered: { overview: string; frames: string[] } | undefined;

    async function render(): Promise<{ overview: string; frames: string[] }> {
        if (rendered) return rendered;

        setMessage('planStatus', 'Loading the 3D renderer…');
        const { renderPlanIn3D } = await loadRenderer();

        setMessage('planStatus', `Rendering ${steps.length} synthetic frames…`);
        rendered = await renderPlanIn3D(steps, viewPoint);

        const overviewImage = await waitForImage(rendered.overview);
        overviewImage.width = OVERVIEW_WIDTH;
        overviewImage.alt = 'Overview of the synthetic scene the plan was rendered against';
        clear(scene);
        scene.append(overviewImage);

        return rendered;
    }

    /**
     * Build the synthetic panorama with whatever processing is selected.
     *
     * Re-runnable, and that is the whole point of it. The first version
     * disabled the button on the way in and re-enabled it only on failure, so
     * the preview could be built exactly once per plan — which meant comparing
     * the processing modes required regenerating the plan between each one, and
     * comparing them is what this preview exists for. The frames are cached, so
     * every run after the first costs only the processing.
     */
    async function build(): Promise<void> {
        setDisabled(generateButton, true);
        try {
            const { frames } = await render();

            // Cleared each time: every renderer appends, so without this the
            // second run stacks its panorama under the first.
            clear(preview);
            hide(saveButton);
            show(preview);
            show(debugButton);

            // PREVIEW_CAMERA is the three.js camera, and its sensorPixels match
            // the renderer's output size, so the same geometry applies unchanged.
            const mode = select('processingMode').value;
            if (mode === 'depth-warp') {
                await renderOrthorectified(steps, frames, PREVIEW_CAMERA, viewPoint, preview, signal);
            } else if (mode === 'flow-blend') {
                await renderFlowMorphed(steps, frames, PREVIEW_CAMERA, viewPoint, preview, signal);
            } else if (mode === 'seam-blend') {
                await renderSeamBlended(steps, frames, PREVIEW_CAMERA, viewPoint, preview, signal);
            } else if (mode === 'homography') {
                await renderWarped(steps, frames, PREVIEW_CAMERA, viewPoint, preview, signal);
            } else {
                await renderStrips(steps, frames, PREVIEW_CAMERA.vFov, preview, 'crop', signal);
                setMessage('planStatus', `${steps.length} shots. Fly them in order.`);
            }

            if (!isAborted(signal)) show(saveButton);
        } finally {
            setDisabled(generateButton, false);
        }
    }

    onClick(generateButton, signal, build);

    // Switching the mode rebuilds immediately, once there is something to
    // rebuild. Comparing two renderings should not require remembering which
    // button to press again.
    select('processingMode').addEventListener(
        'change',
        () => {
            if (rendered) runReporting(build);
        },
        { signal }
    );

    onClick(debugButton, signal, async () => {
        setDisabled(debugButton, true);
        const { frames } = await render();
        show(debug);
        await renderStrips(steps, frames, PREVIEW_CAMERA.vFov, debug, 'debug', signal);
    });
}

/**
 * Resample every strip onto the viewer's curve and composite one panorama.
 *
 * The crop this replaces selects pixels but cannot change the projection they
 * were captured under, so neighbouring strips disagree wherever the cut falls.
 * Here the ground plane lines up exactly at every seam. What is left over is
 * the parallax of everything standing above the ground, which no planar warp
 * reaches — the comparison table upstairs is where that residual is quantified.
 *
 * Refusals from the geometry (a sweep too wide for a flat projection, or a
 * curve doubling back through the line of sight) travel out as errors with
 * actionable text, which is what the error region exists for.
 */
async function renderWarped(
    steps: Step[],
    images: string[],
    camera: CameraProfile,
    viewPoint: Point,
    target: HTMLElement,
    signal: AbortSignal
): Promise<void> {
    if (images.length !== steps.length) {
        throw new Error(
            `This plan needs ${steps.length} photos, but ${images.length} were provided. ` +
                'Select exactly one photo per step, in the order the steps are listed.'
        );
    }

    const panorama = panoramaGeometryFor(steps, viewPoint, camera, PANORAMA_LIMITS);

    const jobs: WarpJob[] = [];
    for (const [index, step] of steps.entries()) {
        if (isAborted(signal)) return;
        setMessage('planStatus', `Reprojecting frame ${index + 1} of ${steps.length}…`);

        const source = images[index];
        if (!source) continue;
        jobs.push({ image: await waitForImage(source), sampling: stripSampling(step, camera, panorama) });
    }

    if (isAborted(signal)) return;
    setMessage('planStatus', 'Compositing…');

    const composed = await waitForImage(warpPanorama(jobs, panorama));
    if (isAborted(signal)) return;

    composed.alt =
        `The finished panorama: ${steps.length} frames resampled onto the viewer's curve, ` +
        `${panorama.width} by ${panorama.height} pixels.`;
    target.append(composed);
    setMessage('planStatus', `Panorama built from ${steps.length} frames.`);
}

/**
 * Reproject, then choose where to cut and soften the cut.
 *
 * The warp alone lines the ground up exactly and leaves the parallax of
 * everything above it — a tree halved and offset at the seam, which is the part
 * the eye actually catches. Nothing planar removes that. Routing the cut around
 * the tree and through the grass beside it does hide it, and that is all this
 * mode claims to do.
 *
 * Two layers, not one per strip. Strips alternate between them, and because a
 * strip reaches at most 0.4 of the way into its neighbour, a layer never
 * overlaps itself. For a 161-frame plan that is two canvases instead of a
 * hundred and sixty-one.
 */
interface TwoLayers {
    readonly panorama: PanoramaGeometry;
    readonly placements: readonly StripPlacement[];
    readonly bands: readonly SeamBand[];
    readonly even: ImageData;
    readonly odd: ImageData;
}

/**
 * Everything the seam and the flow modes both need: the panorama's geometry,
 * the strips widened into each other, and the two composite layers.
 *
 * Returns undefined when the generation was abandoned part-way, which is the
 * one thing a caller must not mistake for a finished render.
 */
async function buildTwoLayers(
    steps: Step[],
    images: string[],
    camera: CameraProfile,
    viewPoint: Point,
    signal: AbortSignal
): Promise<TwoLayers | undefined> {
    if (images.length !== steps.length) {
        throw new Error(
            `This plan needs ${steps.length} photos, but ${images.length} were provided. ` +
                'Select exactly one photo per step, in the order the steps are listed.'
        );
    }

    const panorama = panoramaGeometryFor(steps, viewPoint, camera, PANORAMA_LIMITS);

    const frames: HTMLImageElement[] = [];
    for (const [index, source] of images.entries()) {
        if (isAborted(signal)) return undefined;
        setMessage('planStatus', `Reprojecting frame ${index + 1} of ${steps.length}…`);
        frames.push(await waitForImage(source));
    }

    const placements = overlappingStrips(steps.map(step => stripSampling(step, camera, panorama)));

    const layerJobs = (layer: 0 | 1): WarpJob[] =>
        placements
            .filter(placement => placement.layer === layer)
            .flatMap(placement => {
                const image = frames[placement.index];
                return image ? [{ image, sampling: placement.sampling }] : [];
            });

    setMessage('planStatus', 'Drawing the two layers…');
    const even = warpLayer(layerJobs(0), panorama);
    const odd = warpLayer(layerJobs(1), panorama);
    if (isAborted(signal)) return undefined;

    return { panorama, placements, bands: seamBands(placements), even, odd };
}

/**
 * Measure the disagreement at each seam and slide across it, rather than
 * choosing where to cut.
 *
 * A cut hides the parallax by putting the boundary somewhere unremarkable. This
 * removes the jump itself: the displacement is measured and the two views are
 * interpolated, so an object travels smoothly across the band. It is what
 * Google's Jump and Facebook's Surround 360 both do, for the same reason — the
 * ray the panorama needs was never photographed, so interpolate towards it.
 *
 * It needs consecutive frames close enough to match, which is what the dense
 * capture mode exists to provide. On a wide-strip plan the displacement runs
 * past what the search covers and the measurement quietly returns zero, at
 * which point this degrades to a plain cross-fade.
 */
async function renderFlowMorphed(
    steps: Step[],
    images: string[],
    camera: CameraProfile,
    viewPoint: Point,
    target: HTMLElement,
    signal: AbortSignal
): Promise<void> {
    const layers = await buildTwoLayers(steps, images, camera, viewPoint, signal);
    if (!layers) return;

    const { panorama, placements, bands, even, odd } = layers;

    setMessage('planStatus', `Measuring ${bands.length} seams…`);
    const morphs: MorphBand[] = bands.flatMap(band => {
        const above = placements[band.index];
        const below = placements[band.index + 1];
        if (!above || !below) return [];

        const upper = above.layer === 0 ? even : odd;
        const lower = below.layer === 0 ? even : odd;

        return [
            {
                band,
                disparities: columnDisparities(upper, lower, band, panorama.width),
                lowerIsOdd: below.layer === 1,
            },
        ];
    });

    if (isAborted(signal)) return;
    const measured = morphs.filter(morph => morph.disparities.some(value => value !== 0)).length;

    setMessage('planStatus', 'Morphing across the seams…');
    const morphed = morphAlongSeams(even, odd, morphs, panorama.width, panorama.height);

    const composed = await waitForImage(imageDataToDataUrl(morphed));
    if (isAborted(signal)) return;

    composed.alt =
        `The finished panorama: ${steps.length} frames reprojected, with ${measured} of ${bands.length} seams ` +
        `morphed across a measured displacement. ${panorama.width} by ${panorama.height} pixels.`;
    target.append(composed);
    setMessage(
        'planStatus',
        `Panorama built from ${steps.length} frames. ${measured} of ${bands.length} seams had a measurable displacement.`
    );
}

/**
 * Measure how tall things are, then put them back over their own bases.
 *
 * The only mode here that removes the defect instead of hiding it. Two frames
 * meeting at a seam are a stereo pair whose base spano knows exactly, so their
 * disagreement is a reading, not a nuisance: it gives a height in metres, and a
 * height is all that is needed to undo the relief displacement that made every
 * strip disagree about where the tree was.
 *
 * The measurement is worth having on its own. The comparison table asks how
 * tall the things on the ground are and until now the answer was a guess; this
 * answers it from the photographs.
 */
async function renderOrthorectified(
    steps: Step[],
    images: string[],
    camera: CameraProfile,
    viewPoint: Point,
    target: HTMLElement,
    signal: AbortSignal
): Promise<void> {
    const layers = await buildTwoLayers(steps, images, camera, viewPoint, signal);
    if (!layers) return;

    const { panorama, placements, bands, even, odd } = layers;
    const seams = parallaxReport(steps).seams;

    setMessage('planStatus', `Measuring heights at ${bands.length} seams…`);

    const profiles: HeightProfile[] = [];
    let scale = 0;
    // The tallest thing each usable overlap could possibly reveal. Collected
    // rather than reduced on the fly: a seam with no parallax has an effectively
    // infinite ceiling and would win any maximum, which is how this first
    // reported eight quadrillion metres.
    const ceilings: number[] = [];

    for (const band of bands) {
        const above = placements[band.index];
        const below = placements[band.index + 1];
        if (!above || !below) continue;

        // The seams from the parallax report are in plan order; the placements
        // are in panorama order. The strip below the band owns the shared
        // sample, so its index into the plan is the seam's.
        const seam = seams[Math.min(seams.length - 1, Math.max(0, below.index - 1))];
        if (!seam) continue;

        const rows = rowsPerGroundMetre(panorama, below.sampling.curve);
        if (scale === 0) scale = rows;

        const disparities = columnDisparities(
            above.layer === 0 ? even : odd,
            below.layer === 0 ? even : odd,
            band,
            panorama.width
        );

        const perMetre = seam.slidePerMetre * Math.abs(rows);
        if (perMetre >= MIN_ROWS_PER_METRE_OF_HEIGHT) {
            ceilings.push(searchRangeFor(Math.floor(band.height)) / perMetre);
        }

        profiles.push({
            row: band.y + band.height / 2,
            heights: heightsFromDisparities(seam, disparities, rows),
        });
    }

    if (isAborted(signal)) return;

    const summary = summariseHeights(profiles.map(profile => profile.heights));

    setMessage('planStatus', 'Putting raised objects back over their bases…');
    const corrected = composeOrthorectified(even, odd, {
        placements,
        profiles,
        rowsPerMetre: scale,
        width: panorama.width,
        height: panorama.height,
    });

    const composed = await waitForImage(imageDataToDataUrl(corrected));
    if (isAborted(signal)) return;

    ceilings.sort((a, b) => a - b);
    const ceiling = ceilings[Math.floor(ceilings.length / 2)];

    const measured = !Number.isFinite(summary.tallest)
        ? 'No seam had enough parallax to measure a height from. Try the wide-strip capture: this is the one mode that needs a wide baseline.'
        : `Tallest thing measured: ${summary.tallest.toFixed(1)} m, median ${summary.median.toFixed(1)} m` +
          (ceiling === undefined
              ? '.'
              : `, and anything above about ${ceiling.toFixed(0)} m is beyond what these overlaps can see.`);

    composed.alt =
        `The finished panorama: ${steps.length} frames reprojected and orthorectified from measured heights. ` +
        `${panorama.width} by ${panorama.height} pixels.`;
    target.append(composed);
    setMessage('planStatus', `Panorama built from ${steps.length} frames. ${measured}`);
}

async function renderSeamBlended(
    steps: Step[],
    images: string[],
    camera: CameraProfile,
    viewPoint: Point,
    target: HTMLElement,
    signal: AbortSignal
): Promise<void> {
    const layers = await buildTwoLayers(steps, images, camera, viewPoint, signal);
    if (!layers) return;

    const { panorama, placements, bands, even, odd } = layers;

    setMessage('planStatus', `Choosing ${bands.length} seams…`);
    const switchRows = bands.flatMap(band => {
        const above = placements[band.index];
        const below = placements[band.index + 1];
        if (!above || !below) return [];

        return [
            {
                rows: findSeam(above.layer === 0 ? even : odd, below.layer === 0 ? even : odd, band, panorama.width),
                lowerIsOdd: below.layer === 1,
            },
        ];
    });

    if (isAborted(signal)) return;
    setMessage('planStatus', 'Blending…');
    const blended = blendAlongSeams(even, odd, switchRows, panorama.width, panorama.height);

    const composed = await waitForImage(imageDataToDataUrl(blended));
    if (isAborted(signal)) return;

    composed.alt =
        `The finished panorama: ${steps.length} frames reprojected, with ${bands.length} seams routed ` +
        `around what stands above the ground. ${panorama.width} by ${panorama.height} pixels.`;
    target.append(composed);
    setMessage('planStatus', `Panorama built from ${steps.length} frames, ${bands.length} seams blended.`);
}

/**
 * A button that saves whatever panorama is currently on screen.
 *
 * It reads the rendered elements, so it saves the picture the user is looking
 * at — one composited image in the reprojected mode, a stack of strips in the
 * plain one — without needing to know which mode produced it.
 */
function setupSaveButton(buttonId: string, container: HTMLElement, signal: AbortSignal): HTMLButtonElement {
    const button = el<HTMLButtonElement>(buttonId);
    hide(button);

    onClick(button, signal, () => {
        const composed = composeStack([...container.querySelectorAll('img')]);
        downloadDataUrl('panorama.png', composed.dataUrl);

        const size = `${composed.width} by ${composed.height}`;
        setMessage(
            'planStatus',
            composed.scale < 1
                ? `Saved panorama.png at ${size}, scaled to ${String(Math.round(composed.scale * 100))}% of full size to stay within the browser's canvas limit.`
                : `Saved panorama.png at ${size}.`
        );
    });

    return button;
}

/** Wire up the real-photo pipeline for a freshly computed plan. */
export function setupRealPreview(steps: Step[], camera: CameraProfile, viewPoint: Point, signal: AbortSignal): void {
    const generateButton = el<HTMLButtonElement>('generateButtonReal');
    const debugButton = el<HTMLButtonElement>('generateDebugReal');
    const preview = el('previewReal');
    const debug = el('debugReal');

    clear(preview);
    clear(debug);
    hide(preview);
    hide(debug);
    hide(debugButton);
    setDisabled(debugButton, false);

    const saveButton = setupSaveButton('savePanoramaReal', preview, signal);

    onClick(generateButton, signal, async () => {
        clear(preview);
        clear(debug);
        hide(saveButton);
        setDisabled(debugButton, false);
        show(preview);
        show(debugButton);

        const images = await readSelectedImages();
        const mode = select('processingMode').value;
        if (mode === 'depth-warp') await renderOrthorectified(steps, images, camera, viewPoint, preview, signal);
        else if (mode === 'flow-blend') await renderFlowMorphed(steps, images, camera, viewPoint, preview, signal);
        else if (mode === 'seam-blend') await renderSeamBlended(steps, images, camera, viewPoint, preview, signal);
        else if (mode === 'homography') await renderWarped(steps, images, camera, viewPoint, preview, signal);
        else await renderStrips(steps, images, camera.vFov, preview, 'crop', signal);

        if (!isAborted(signal)) show(saveButton);
    });

    onClick(debugButton, signal, async () => {
        setDisabled(debugButton, true);
        show(debug);
        await renderStrips(steps, await readSelectedImages(), camera.vFov, debug, 'debug', signal);
    });
}

/** Read the chosen photos as data URLs. Nothing leaves the browser. */
async function readSelectedImages(): Promise<string[]> {
    const files = input('filesReal').files;
    if (!files || files.length === 0) {
        throw new Error('Choose the photos from your flight first.');
    }

    const imageDataUrls: string[] = [];
    const all = Array.from(files);
    for (const [i, file] of all.entries()) {
        setMessage('planStatus', `Reading photo ${i + 1} of ${all.length}…`);
        imageDataUrls.push(await readAsDataUrl(file));
    }
    setMessage('planStatus', `${all.length} photos read.`);
    return imageDataUrls;
}

function readAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            // readAsDataURL always yields a string; the union covers the other
            // read modes.
            const result = reader.result;
            if (typeof result === 'string') {
                resolve(result);
            } else {
                reject(new Error(`Could not read ${file.name}.`));
            }
        });
        reader.addEventListener('error', () => {
            reject(new Error(`Could not read ${file.name}.`));
        });
        reader.readAsDataURL(file);
    });
}
