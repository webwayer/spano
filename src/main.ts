/**
 * Composition root. Wiring only — no planning, no drawing, no DOM detail.
 *
 * The layering underneath:
 *   core/      pure planning. No DOM, no three.js. Enforced by
 *              src/core/tsconfig.json, whose `lib` omits "DOM", and by a
 *              no-restricted-imports lint rule.
 *   adapters/  everything that touches a canvas, a GPU or a file.
 *   ui/        reading the form, rendering results, wiring events.
 */

import './styles/main.css';

import { plan } from './core/planner/plan';
import { drawShots } from './adapters/canvas2d/draw-shots';
import { canvas, el, setMessage } from './ui/dom';
import { runReporting } from './ui/errors';
import { populateCameraProfiles, readParams } from './ui/controls';
import { renderStepList } from './ui/step-list';
import { resetPreviewListeners, setup3DPreview, setupRealPreview } from './ui/previews';

function generate(): void {
    const { curve, viewPoint, camera, altitudeCeiling } = readParams();

    setMessage('planStatus', 'Working out the flight…');
    const { shots, steps } = plan(curve, viewPoint);

    drawShots(shots, viewPoint, canvas('topCanvas'), canvas('bottomCanvas'));
    renderStepList(steps, altitudeCeiling);

    const signal = resetPreviewListeners();
    setupRealPreview(steps, camera, signal);
    // Registers handlers only. The three.js chunk is fetched on first press of
    // "Build panorama from preview", not now.
    setup3DPreview(steps, viewPoint, signal);
}

populateCameraProfiles();

el<HTMLFormElement>('planForm').addEventListener('submit', event => {
    event.preventDefault();
    runReporting(generate);
});

runReporting(generate);
