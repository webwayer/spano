import { toRadians } from '../../core/geometry/angles';
import type { ShotAnchor, Step } from '../../core/types';

/** How long to wait for an image to decode before giving up, ms. */
const IMAGE_LOAD_TIMEOUT = 30_000;

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not get a 2D drawing context — the browser may be out of memory.');
    }
    return [canvas, context];
}

/**
 * Resolve once an image source has decoded.
 *
 * The 2018 version attached only an onload handler, so a missing or corrupt
 * source left the promise pending forever and the UI froze with no message.
 */
export async function waitForImage(src: string): Promise<HTMLImageElement> {
    if (!src) {
        throw new Error('No image source given.');
    }
    return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => {
            reject(new Error(`Image did not load within ${IMAGE_LOAD_TIMEOUT / 1000}s.`));
        }, IMAGE_LOAD_TIMEOUT);

        image.onload = () => {
            clearTimeout(timer);
            resolve(image);
        };
        image.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Image could not be decoded — is it a supported format?'));
        };
        image.src = src;
    });
}

/** Crop a horizontal band out of an image. */
export async function cutViewport(imageDataUrl: string, srcY: number, activeImageArea: number): Promise<string> {
    const image = await waitForImage(imageDataUrl);
    const [canvas, ctx] = createCanvas(image.width, activeImageArea);

    ctx.drawImage(image, 0, srcY, image.width, activeImageArea, 0, 0, image.width, activeImageArea);

    return canvas.toDataURL();
}

/** The same band, drawn as an outline over the full frame, for debugging. */
export async function drawViewport(imageDataUrl: string, srcY: number, activeImageArea: number): Promise<string> {
    const image = await waitForImage(imageDataUrl);
    const [canvas, ctx] = createCanvas(image.width, image.height);

    ctx.drawImage(image, 0, 0);
    ctx.strokeStyle = '#FF0000';
    ctx.strokeRect(0, srcY, image.width, activeImageArea);
    ctx.strokeStyle = '#1eff36';
    ctx.strokeRect(0, image.height / 2, image.width, 1);
    ctx.strokeRect(image.width / 2, 0, 1, image.height);

    return canvas.toDataURL();
}

/**
 * Which band of the frame to keep.
 *
 * The strip's height is the fraction of the sensor's vertical field of view the
 * shot actually covers. Where it sits vertically depends on the anchor: a
 * 'center' shot keeps the middle, 'start' the band above centre, 'end' the band
 * below. The first and last shots of the whole plan extend to the frame edge so
 * the panorama has no hard cut at either end.
 */
export function calcViewport(
    angleOfView: number,
    shotOn: ShotAnchor,
    height: number,
    vFOV: number,
    fullUp = false,
    fullDown = false
): { srcY: number; activeImageArea: number } {
    let activeImageArea = (angleOfView / vFOV) * height;

    let srcY: number;
    if (shotOn === 'start') {
        srcY = height / 2 - activeImageArea;
    } else if (shotOn === 'end') {
        srcY = height / 2;
    } else {
        srcY = (height - activeImageArea) / 2;
    }

    if (fullUp) {
        activeImageArea = srcY + activeImageArea;
        srcY = 0;
    }
    if (fullDown) {
        activeImageArea = height - srcY;
    }

    // A canvas dimension is an unsigned long: assigning 59.7 truncates to 59.
    // Flooring here just makes that explicit rather than incidental.
    //
    // The clamp to 1 is the load-bearing part. A plan can contain a shot whose
    // angle of view rounds to 0 degrees — the tail of a curve where consecutive
    // samples nearly coincide — and (0 / vFOV) * height is 0. A zero-height
    // canvas serialises to the string "data:," which no <img> can decode, so
    // the whole strip loop died with "Image could not be decoded". One pixel of
    // useless strip is a far better outcome than a broken render.
    activeImageArea = Math.max(1, Math.floor(activeImageArea));
    srcY = Math.min(Math.max(0, Math.floor(srcY)), Math.max(0, height - activeImageArea));

    return { srcY, activeImageArea };
}

/** Rotate an image 180 degrees, for frames shot facing back down the track. */
export async function updownImage(imageDataUrl: string): Promise<string> {
    const image = await waitForImage(imageDataUrl);
    const [canvas, ctx] = createCanvas(image.width, image.height);

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(toRadians(180));
    ctx.drawImage(image, -canvas.width / 2, -canvas.height / 2);

    return canvas.toDataURL();
}

async function orientForStep(step: Step, image: string): Promise<string> {
    return step.backwards ? await updownImage(image) : image;
}

/** The finished strip for one step. */
export async function cutImage(
    step: Step,
    image: string,
    vFov: number,
    doNotCutUp: boolean,
    doNotCutDown: boolean
): Promise<string> {
    const stepDataUrl = await orientForStep(step, image);
    const stepImage = await waitForImage(stepDataUrl);
    const { srcY, activeImageArea } = calcViewport(
        step.angleOfView,
        step.shotOn,
        stepImage.height,
        vFov,
        doNotCutUp,
        doNotCutDown
    );
    return await cutViewport(stepDataUrl, srcY, activeImageArea);
}

/** The same crop shown as an overlay, so you can see what was kept. */
export async function generateCutPreviewImage(
    step: Step,
    image: string,
    vFov: number,
    doNotCutUp: boolean,
    doNotCutDown: boolean
): Promise<string> {
    const stepDataUrl = await orientForStep(step, image);
    const stepImage = await waitForImage(stepDataUrl);
    const { srcY, activeImageArea } = calcViewport(
        step.angleOfView,
        step.shotOn,
        stepImage.height,
        vFov,
        doNotCutUp,
        doNotCutDown
    );
    return await drawViewport(stepDataUrl, srcY, activeImageArea);
}
