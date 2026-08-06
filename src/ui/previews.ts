import { cutImage, generateCutPreviewImage, waitForImage } from '../adapters/imaging/images';
import { PREVIEW_VFOV } from '../adapters/scene3d/scene';
import { renderPlanIn3D } from '../adapters/scene3d/render-plan';
import type { Point, Step } from '../core/types';
import { clear, el, hide, input, onClick, setDisabled, show } from './dom';

/** DJI Mavic Pro vertical field of view, degrees. Phase 6 makes this selectable. */
export const MAVIC_PRO_VFOV = 46.8;

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
 * Crop each frame down to the strip the plan says to keep, and stack them.
 *
 * Prepending rather than appending builds the panorama bottom-up, matching the
 * order the aircraft flies: the first step images the ground nearest the viewer.
 */
async function renderStrips(
    steps: Step[],
    images: string[],
    vFov: number,
    target: HTMLElement,
    mode: 'crop' | 'debug'
): Promise<void> {
    if (images.length !== steps.length) {
        throw new Error(
            `This plan needs ${steps.length} photos, but ${images.length} were provided. ` +
                'Select exactly one photo per step, in the order they were taken.'
        );
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const image = images[i];
        const isLast = i === steps.length - 1;
        const isFirst = i === 0;

        const dataUrl =
            mode === 'crop'
                ? await cutImage(step, image, vFov, isLast, isFirst)
                : await generateCutPreviewImage(step, image, vFov, isLast, isFirst);

        const imageObject = await waitForImage(dataUrl);
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

/** Wire up the synthetic 3D preview for a freshly computed plan. */
export async function setup3DPreview(steps: Step[], viewPoint: Point, signal: AbortSignal): Promise<void> {
    const generateButton = el<HTMLButtonElement>('generateButton3D');
    const debugButton = el<HTMLButtonElement>('generateDebug3D');
    const scene = el('scene3D');
    const preview = el('preview3D');
    const debug = el('debug3D');

    const { overview, frames } = await renderPlanIn3D(steps, viewPoint);

    clear(preview);
    clear(debug);
    clear(scene);
    hide(preview);
    hide(debug);
    hide(debugButton);
    setDisabled(generateButton, false);
    setDisabled(debugButton, false);

    const overviewImage = await waitForImage(overview);
    overviewImage.width = OVERVIEW_WIDTH;
    overviewImage.alt = 'Overview of the synthetic scene the plan was rendered against';
    scene.append(overviewImage);

    onClick(generateButton, signal, async () => {
        setDisabled(generateButton, true);
        show(preview);
        show(debugButton);
        await renderStrips(steps, frames, PREVIEW_VFOV, preview, 'crop');
    });

    onClick(debugButton, signal, async () => {
        setDisabled(debugButton, true);
        show(debug);
        await renderStrips(steps, frames, PREVIEW_VFOV, debug, 'debug');
    });
}

/** Wire up the real-photo pipeline for a freshly computed plan. */
export function setupRealPreview(steps: Step[], signal: AbortSignal): void {
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
        await renderStrips(steps, await readSelectedImages(), MAVIC_PRO_VFOV, preview, 'crop');
    });

    onClick(debugButton, signal, async () => {
        setDisabled(debugButton, true);
        show(debug);
        await renderStrips(steps, await readSelectedImages(), MAVIC_PRO_VFOV, debug, 'debug');
    });
}

/** Read the chosen photos as data URLs. Nothing leaves the browser. */
async function readSelectedImages(): Promise<string[]> {
    const files = input('filesReal').files;
    if (!files || files.length === 0) {
        throw new Error('Choose the photos from your flight first.');
    }

    const imageDataUrls: string[] = [];
    for (const file of Array.from(files)) {
        imageDataUrls.push(await readAsDataUrl(file));
    }
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
        reader.addEventListener('error', () => reject(new Error(`Could not read ${file.name}.`)));
        reader.readAsDataURL(file);
    });
}
