import { Arc90Curve } from '../core/curves/arc-90';
import { Arc135Curve } from '../core/curves/arc-135';
import type { Curve } from '../core/curves/curve';
import type { CameraProfile } from '../core/camera/profiles';
import { CAMERA_PROFILES, DEFAULT_ALTITUDE_CEILING, MAVIC_PRO } from '../core/camera/profiles';
import type { CaptureDensity, CaptureStrategy } from '../core/strategy/capture';
import {
    CAPTURE_STRATEGIES,
    DEFAULT_CAPTURE_STRATEGY,
    captureStrategyById,
    densityById,
} from '../core/strategy/capture';
import type { Point } from '../core/types';
import { el, hide, numberFrom, readFieldBounds, select, setMessage, show } from './dom';
import { decodePlan, encodePlan, type SharedPlan } from './share';

export interface PlanParams {
    curve: Curve;
    viewPoint: Point;
    camera: CameraProfile;
    altitudeCeiling: number;
    strategy: CaptureStrategy;
    density: CaptureDensity;
    /** Height of the objects the comparison is measured against, metres. */
    objectHeight: number;
}

/** Fill the camera picker from the profile list, so adding one is data-only. */
export function populateCameraProfiles(): void {
    const picker = select('cameraProfile');
    picker.replaceChildren(
        ...CAMERA_PROFILES.map(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = `${profile.name} — ${profile.vFov}° vertical FOV`;
            return option;
        })
    );
}

/** Fill the capture picker from the registry, on the same data-only terms. */
export function populateCaptureStrategies(): void {
    const picker = select('captureStrategy');
    picker.replaceChildren(
        ...CAPTURE_STRATEGIES.map(strategy => {
            const option = document.createElement('option');
            option.value = strategy.id;
            option.textContent = strategy.name;
            return option;
        })
    );
    picker.value = DEFAULT_CAPTURE_STRATEGY.id;
}

/**
 * Fill the density picker for whichever capture mode is selected.
 *
 * The list depends on the mode, so this has to run again whenever the mode
 * changes — and, less obviously, after a shared link is applied, because the
 * link names a density that only exists once its own mode is in place.
 *
 * A mode offering one density hides the control rather than showing a picker
 * with nothing to pick. The <select> keeps its value either way, so reading the
 * form does not have to know which case it is in.
 */
export function populateCaptureDensities(): void {
    const strategy = captureStrategyById(select('captureStrategy').value);
    const picker = select('captureDensity');

    picker.replaceChildren(
        ...strategy.densities.map(density => {
            const option = document.createElement('option');
            option.value = density.id;
            option.textContent = density.label;
            return option;
        })
    );

    const field = el('captureDensityField');
    if (strategy.densities.length > 1) show(field);
    else hide(field);

    setMessage('captureSummary', strategy.summary);
    applyProcessingCompatibility(strategy);
}

/**
 * What to expect from a mode that this capture does not suit.
 *
 * Deliberately an expectation and not a prohibition. A mode that produces no
 * visible change on a given flight is telling you something true about that
 * flight, and a picker that refuses to run it cannot tell you that. What the
 * note buys is that "nothing happened" is read as the answer rather than as a
 * fault.
 */
const EXPECTATIONS: Record<string, string> = {
    'flow-blend':
        'the frames here are too far apart for the search to find a match, so it will likely measure nothing and fall back to a plain cross-fade',
    'depth-warp':
        'the parallax here is too small to measure a height from, so the reading will be dominated by its own quantisation',
};

/**
 * Offer every mode this capture can physically feed, and say what to expect.
 *
 * A survey grid feeds none: it flies several lines over the same ground, so
 * several frames claim the same panorama rows and there is no strip to
 * reproject. That is a property of the flight rather than a judgement about it,
 * and it is the one case where the control goes down.
 */
function applyProcessingCompatibility(strategy: CaptureStrategy): void {
    const picker = select('processingMode');

    for (const option of picker.options) {
        option.disabled = !strategy.processingModes.includes(option.value);
    }

    const firstAllowed = [...picker.options].find(option => !option.disabled)?.value;

    if (firstAllowed === undefined) {
        picker.disabled = true;
        setMessage(
            'processingNote',
            `${strategy.name} photographs the ground, not the panorama: several lines cover the same ground, so ` +
                'several frames claim the same rows and there is no strip to reproject. Reconstruct the scene from ' +
                'these frames instead — the camera poses below are the input for that.'
        );
        return;
    }

    picker.disabled = false;
    if (!strategy.processingModes.includes(picker.value)) picker.value = firstAllowed;
    describeExpectation(strategy);
}

/** Warn when the selected mode is one this capture is not suited to. */
export function describeExpectation(strategy: CaptureStrategy): void {
    const mode = select('processingMode').value;

    if (strategy.recommendedProcessing.includes(mode)) {
        setMessage('processingNote', '');
        return;
    }

    const suited = CAPTURE_STRATEGIES.filter(other => other.recommendedProcessing.includes(mode)).map(
        other => other.name
    );

    const expectation = strategy.processingCaveat ?? EXPECTATIONS[mode] ?? 'this capture is not suited to it';
    const alternative = suited.length > 0 ? ` It is at its best with ${suited.join(' or ')}.` : '';

    setMessage('processingNote', `Worth trying, but expect little: ${expectation}.${alternative}`);
}

/**
 * Keep the density list and the expectation note in step with the form.
 *
 * Registered once at startup rather than per generation: both belong to the
 * form, not to a plan, and they must keep working while the previous plan's
 * listeners are being torn down.
 */
export function setupCaptureStrategySwitch(): void {
    select('captureStrategy').addEventListener('change', () => {
        populateCaptureDensities();
    });

    // The note describes the *pair*, so it has to follow either half of it.
    select('processingMode').addEventListener('change', () => {
        describeExpectation(captureStrategyById(select('captureStrategy').value));
    });
}

/** Read and validate the form into the shape the planner wants. */
export function readParams(): PlanParams {
    const CurveClass = select('curveType').value === 'simpleCurve' ? Arc90Curve : Arc135Curve;

    const curve = new CurveClass(
        numberFrom('offset'),
        numberFrom('firstLineLength'),
        numberFrom('curvedLineLength'),
        numberFrom('secondLineLength')
    );

    const selectedId = select('cameraProfile').value;
    const camera = CAMERA_PROFILES.find(p => p.id === selectedId) ?? MAVIC_PRO;

    const strategy = captureStrategyById(select('captureStrategy').value);

    return {
        curve,
        viewPoint: { x: 0, y: numberFrom('viewPointHeight') },
        camera,
        altitudeCeiling: numberFrom('altitudeCeiling', DEFAULT_ALTITUDE_CEILING),
        strategy,
        density: densityById(strategy, select('captureDensity').value),
        objectHeight: numberFrom('objectHeight'),
    };
}

/** The form's current state, in the shape the URL encoder wants. */
export function readSharedPlan(): SharedPlan {
    return {
        curveType: select('curveType').value,
        cameraProfile: select('cameraProfile').value,
        captureStrategy: select('captureStrategy').value,
        captureDensity: select('captureDensity').value,
        processingMode: select('processingMode').value,
        offset: numberFrom('offset'),
        firstLineLength: numberFrom('firstLineLength'),
        curvedLineLength: numberFrom('curvedLineLength'),
        secondLineLength: numberFrom('secondLineLength'),
        viewPointHeight: numberFrom('viewPointHeight'),
        altitudeCeiling: numberFrom('altitudeCeiling', DEFAULT_ALTITUDE_CEILING),
        objectHeight: numberFrom('objectHeight'),
    };
}

/**
 * Apply a plan from the URL fragment to the form, if there is one.
 *
 * Call after populateCameraProfiles(), so the camera <select> already has its
 * options — assigning an unknown value to a <select> silently does nothing.
 */
export function applySharedPlanFromUrl(fragment: string): boolean {
    // Bounds come from the form, so a link can only carry what a user could type.
    const shared = decodePlan(fragment, readFieldBounds());
    if (Object.keys(shared).length === 0) return false;

    applyFields(shared);
    // The density options belong to the capture mode that was just applied, so
    // the first pass had nothing to assign the density to. Rebuild the list,
    // then apply again — the second pass is idempotent for every other field.
    populateCaptureDensities();
    applyFields(shared);

    return true;
}

function applyFields(shared: Partial<SharedPlan>): void {
    for (const [key, value] of Object.entries(shared)) {
        const field = document.getElementById(key);
        if (field instanceof HTMLSelectElement) {
            // Ignore an option this build does not have.
            if ([...field.options].some(o => o.value === value)) field.value = String(value);
        } else if (field instanceof HTMLInputElement) {
            field.value = String(value);
        }
    }
}

/** A link that reproduces the current form. */
export function shareUrl(): string {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}#${encodePlan(readSharedPlan())}`;
}
