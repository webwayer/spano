/**
 * Flatten what is on screen into one image.
 *
 * The plain crop mode has never produced a panorama as a *file*: it produces a
 * column of `<img>` elements that CSS stacks edge to edge, and the panorama
 * exists only as an arrangement in the document. That is fine to look at and
 * impossible to keep.
 *
 * Composing from the rendered elements rather than from the data behind them is
 * deliberate. It means the download is the thing the user is looking at, in the
 * order they are looking at it, without this module having to know that
 * `renderStrips` prepends and therefore builds the picture bottom-up. One fewer
 * place for the ordering to be got wrong.
 */

/**
 * Largest composite worth attempting, in pixels.
 *
 * Browsers cap canvas area, and the limit is neither documented nor consistent —
 * Safari has historically been the tightest. A dense plan of full-resolution
 * frames goes past any of them: 161 strips of 4000-pixel-wide photographs is
 * well over a gigapixel. Scaling down beats a canvas that silently returns
 * blank pixels, which is what an over-large one does.
 */
const MAX_COMPOSITE_PIXELS = 60_000_000;

export interface Composed {
    readonly dataUrl: string;
    readonly width: number;
    readonly height: number;
    /** 1 when nothing had to be given up to fit. */
    readonly scale: number;
}

export function composeStack(images: readonly HTMLImageElement[]): Composed {
    if (images.length === 0) throw new Error('There is no panorama to save yet. Build one first.');

    const fullWidth = Math.max(...images.map(image => image.naturalWidth));
    const fullHeight = images.reduce((total, image) => total + image.naturalHeight, 0);
    if (fullWidth === 0 || fullHeight === 0) throw new Error('The panorama has no pixels yet.');

    const scale = Math.min(1, Math.sqrt(MAX_COMPOSITE_PIXELS / (fullWidth * fullHeight)));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(fullWidth * scale));
    canvas.height = Math.max(1, Math.round(fullHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser would not give us a canvas to compose on.');

    let y = 0;
    for (const image of images) {
        const height = image.naturalHeight * scale;
        // Centred, because a strip narrower than the widest one would otherwise
        // sit against the left edge and read as a step in the panorama.
        const width = image.naturalWidth * scale;
        context.drawImage(image, (canvas.width - width) / 2, y, width, height);
        y += height;
    }

    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, scale };
}

/** Put pixels back on a canvas so they can leave as an image. */
export function imageDataToDataUrl(pixels: ImageData): string {
    const canvas = document.createElement('canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser would not give us a canvas to write the panorama to.');

    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL();
}
