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
import { applySharedPlanFromUrl, populateCameraProfiles, readParams, shareUrl } from './ui/controls';
import { renderStepList } from './ui/step-list';
import { resetPreviewListeners, setup3DPreview, setupRealPreview } from './ui/previews';
import { populateBaseLayers, setupMap } from './ui/map-panel';
import { setupThemeSwitch } from './ui/theme';

function generate(): void {
    const { curve, viewPoint, camera, altitudeCeiling } = readParams();

    setMessage('planStatus', 'Working out the flight…');
    const { shots, steps } = plan(curve, viewPoint);

    drawShots(shots, viewPoint, canvas('topCanvas'), canvas('bottomCanvas'));
    renderStepList(steps, camera, altitudeCeiling);

    // Keep the address bar in step, so the page is shareable and reloadable
    // without a server. replaceState, not pushState: regenerating is not
    // navigation and should not fill the back button.
    window.history.replaceState(null, '', shareUrl());

    const signal = resetPreviewListeners();
    setupRealPreview(steps, camera, signal);
    // Registers handlers only. The three.js chunk is fetched on first press of
    // "Build panorama from preview", not now.
    setup3DPreview(steps, viewPoint, signal);
    setupMap(steps, camera, signal);
}

setupThemeSwitch();
populateCameraProfiles();
populateBaseLayers();
applySharedPlanFromUrl(window.location.hash);

el<HTMLFormElement>('planForm').addEventListener('submit', event => {
    event.preventDefault();
    runReporting(generate);
});

runReporting(generate);
