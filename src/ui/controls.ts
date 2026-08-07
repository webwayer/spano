import { Arc90Curve } from '../core/curves/arc-90';
import { Arc135Curve } from '../core/curves/arc-135';
import type { Curve } from '../core/curves/curve';
import type { CameraProfile } from '../core/camera/profiles';
import { CAMERA_PROFILES, DEFAULT_ALTITUDE_CEILING, MAVIC_PRO } from '../core/camera/profiles';
import type { Point } from '../core/types';
import { numberFrom, readFieldBounds, select } from './dom';
import { decodePlan, encodePlan, type SharedPlan } from './share';

export interface PlanParams {
    curve: Curve;
    viewPoint: Point;
    camera: CameraProfile;
    altitudeCeiling: number;
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

    return {
        curve,
        viewPoint: { x: 0, y: numberFrom('viewPointHeight') },
        camera,
        altitudeCeiling: numberFrom('altitudeCeiling', DEFAULT_ALTITUDE_CEILING),
    };
}

/** The form's current state, in the shape the URL encoder wants. */
export function readSharedPlan(): SharedPlan {
    return {
        curveType: select('curveType').value,
        cameraProfile: select('cameraProfile').value,
        offset: numberFrom('offset'),
        firstLineLength: numberFrom('firstLineLength'),
        curvedLineLength: numberFrom('curvedLineLength'),
        secondLineLength: numberFrom('secondLineLength'),
        viewPointHeight: numberFrom('viewPointHeight'),
        altitudeCeiling: numberFrom('altitudeCeiling', DEFAULT_ALTITUDE_CEILING),
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

    for (const [key, value] of Object.entries(shared)) {
        const field = document.getElementById(key);
        if (field instanceof HTMLSelectElement) {
            // Ignore an option this build does not have.
            if ([...field.options].some(o => o.value === value)) field.value = String(value);
        } else if (field instanceof HTMLInputElement) {
            field.value = String(value);
        }
    }
    return true;
}

/** A link that reproduces the current form. */
export function shareUrl(): string {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}#${encodePlan(readSharedPlan())}`;
}
