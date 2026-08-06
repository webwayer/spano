/**
 * Composition root. Wiring only — no planning, no drawing, no DOM detail.
 *
 * The layering this file sits on top of:
 *   core/      pure planning. No DOM, no three.js. Enforced by
 *              src/core/tsconfig.json, whose `lib` omits "DOM".
 *   adapters/  everything that touches a canvas, a GPU or a file.
 *   ui/        reading the form, rendering results, wiring events.
 */

import { plan } from './core/planner/plan';
import { drawShots } from './adapters/canvas2d/draw-shots';
import { canvas, el } from './ui/dom';
import { reportError } from './ui/errors';
import { readParams } from './ui/controls';
import { renderStepList } from './ui/step-list';
import { resetPreviewListeners, setup3DPreview, setupRealPreview } from './ui/previews';

async function generate(): Promise<void> {
    const { curve, viewPoint } = readParams();
    const { shots, steps } = plan(curve, viewPoint);

    drawShots(shots, viewPoint, canvas('topCanvas'), canvas('bottomCanvas'));
    renderStepList(steps);

    const signal = resetPreviewListeners();
    await setup3DPreview(steps, viewPoint, signal);
    setupRealPreview(steps, signal);
}

const generateButton = el('generateButton');
generateButton.addEventListener('click', () => {
    generate().catch(reportError);
});

generate().catch(reportError);
