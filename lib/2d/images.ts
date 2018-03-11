import { toRadians } from "../math";

export async function cutViewport(imageDataUrl, srcY, activeImageArea) {
    const image = await waitForImage(imageDataUrl);

    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d');
    canvas.height = activeImageArea;
    canvas.width = image.width;

    canvasContext.drawImage(image, 0, srcY, image.width, activeImageArea, 0, 0, image.width, activeImageArea);

    return canvas.toDataURL();
}

export async function drawViewport(imageDataUrl, srcY, activeImageArea) {
    const image = await waitForImage(imageDataUrl);

    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d');
    canvas.height = image.height;
    canvas.width = image.width;

    canvasContext.drawImage(image, 0, 0);
    canvasContext.strokeStyle = "#FF0000";
    canvasContext.strokeRect(0, srcY, image.width, activeImageArea);
    canvasContext.strokeStyle = "#1eff36";
    canvasContext.strokeRect(0, image.height / 2, image.width, 1);
    canvasContext.strokeRect(image.width / 2, 0, 1, image.height);

    return canvas.toDataURL();
}

export function calcViewport(angleOfView, shotOn, height, vFOV, fullUp = false, fullDown = false) {
    let activeImageArea = ((angleOfView / vFOV) * height);

    let srcY;
    if (shotOn === 'start') {
        srcY = (height / 2) - activeImageArea
    }
    if (shotOn === 'center') {
        srcY = (height - activeImageArea) / 2
    }
    if (shotOn === 'end') {
        srcY = (height / 2)
    }

    if (fullUp) {
        activeImageArea = srcY + activeImageArea;
        srcY = 0;
    }
    if (fullDown) {
        activeImageArea = height - srcY;
    }

    return { srcY, activeImageArea }
}

export async function waitForImage(src: string): Promise<HTMLImageElement> {
    return await new Promise<HTMLImageElement>(resolve => {
        const image = new Image();
        image.src = src;
        image.onload = () => {
            resolve(image);
        }
    })
}

export async function updownImage(imageDataUrl) {
    const image = await waitForImage(imageDataUrl);

    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d');
    canvas.height = image.height;
    canvas.width = image.width;

    canvasContext.translate(canvas.width / 2, canvas.height / 2);
    canvasContext.rotate(toRadians(180));
    canvasContext.drawImage(image, -canvas.width / 2, -canvas.height / 2);

    return canvas.toDataURL();
}

export async function cutImage(step, image, vFov, doNotCutUp, doNotCutDown) {
    const stepDataUrl = step.backwards ? (await updownImage(image)) : image;
    const stepImage = await waitForImage(stepDataUrl);
    const { srcY, activeImageArea } = calcViewport(step.angleOfView, step.shotOn, stepImage.height, vFov, doNotCutUp, doNotCutDown);
    const viewportStepDataUrl = await cutViewport(stepDataUrl, srcY, activeImageArea);

    return viewportStepDataUrl;
}

export async function generateCutPreviewImage(step, image, vFov, doNotCutUp, doNotCutDown) {
    const stepDataUrl = step.backwards ? (await updownImage(image)) : image;
    const stepImage = await waitForImage(stepDataUrl);
    const { srcY, activeImageArea } = calcViewport(step.angleOfView, step.shotOn, stepImage.height, vFov, doNotCutUp, doNotCutDown);
    const previewStepDataUrl = await drawViewport(stepDataUrl, srcY, activeImageArea);

    return previewStepDataUrl;
}