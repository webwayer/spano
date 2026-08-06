import { Arc90Curve } from '../core/curves/arc-90';
import { Arc135Curve } from '../core/curves/arc-135';
import type { Curve } from '../core/curves/curve';
import type { CameraProfile } from '../core/camera/profiles';
import { CAMERA_PROFILES, DEFAULT_ALTITUDE_CEILING, MAVIC_PRO } from '../core/camera/profiles';
import type { Point } from '../core/types';
import { numberFrom, select } from './dom';

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
