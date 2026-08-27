import { downloadText } from '../adapters/download';
import type { CameraProfile } from '../core/camera/profiles';
import { makeColmapModel } from '../core/export/colmap';
import type { Step } from '../core/types';
import { onClick, setMessage } from './dom';

/**
 * Three buttons rather than one.
 *
 * A COLMAP text model is three files that must keep their names, and browsers
 * treat several downloads from one gesture as something to warn about. Three
 * explicit buttons are duller and they work everywhere.
 */
const FILES = [
    { id: 'downloadCameras', name: 'cameras.txt', of: 'cameras' },
    { id: 'downloadImages', name: 'images.txt', of: 'images' },
    { id: 'downloadPoints', name: 'points3D.txt', of: 'points3D' },
] as const;

export function setupPoseExport(steps: Step[], camera: CameraProfile, signal: AbortSignal): void {
    for (const file of FILES) {
        onClick(document.getElementById(file.id) as HTMLButtonElement, signal, () => {
            const model = makeColmapModel(steps, camera);
            downloadText(file.name, model[file.of]);
            setMessage(
                'posesStatus',
                `Saved ${file.name} for ${String(steps.length)} planned frames. Put all three in sparse/0/.`
            );
        });
    }
}
