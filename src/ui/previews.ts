import { cutImage, generateCutPreviewImage, waitForImage } from '../adapters/imaging/images';
import { PREVIEW_CAMERA, type CameraProfile } from '../core/camera/profiles';
import type { Point, Step } from '../core/types';
import { clear, el, hide, input, onClick, setDisabled, setMessage, show } from './dom';

const MAX_PREVIEW_WIDTH = 1000;
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

    onClick(generateButton, signal, async () => {
        setDisabled(generateButton, true);
        try {
            const { frames } = await render();
            show(preview);
            show(debugButton);
            await renderStrips(steps, frames, PREVIEW_CAMERA.vFov, preview, 'crop', signal);
            setMessage('planStatus', `${steps.length} shots. Fly them in order.`);
        } catch (error) {
            setDisabled(generateButton, false);
            throw error;
        }
    });

    onClick(debugButton, signal, async () => {
        setDisabled(debugButton, true);
        const { frames } = await render();
        show(debug);
        await renderStrips(steps, frames, PREVIEW_CAMERA.vFov, debug, 'debug', signal);
    });
}

/** Wire up the real-photo pipeline for a freshly computed plan. */
export function setupRealPreview(steps: Step[], camera: CameraProfile, signal: AbortSignal): void {
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

    onClick(generateButton, signal, async () => {
        clear(preview);
        clear(debug);
        setDisabled(debugButton, false);
        show(preview);
        show(debugButton);
        await renderStrips(steps, await readSelectedImages(), camera.vFov, preview, 'crop', signal);
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
