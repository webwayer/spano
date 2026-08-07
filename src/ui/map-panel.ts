import type { CameraProfile } from '../core/camera/profiles';
import type { Step } from '../core/types';
import { BASE_LAYERS, type MapView } from '../adapters/map/types';
import { clear, el, onClick, select, setMessage } from './dom';

/**
 * MapLibre and its tiles are a second large dependency, and the map is behind a
 * button — so it loads the same way the 3D preview does: not until asked.
 */
async function loadMap(): Promise<typeof import('../adapters/map/maplibre')> {
    return await import('../adapters/map/maplibre');
}

let view: MapView | undefined;
let current: { steps: Step[]; camera: CameraProfile } | undefined;

/** Populate the base-layer picker from the layer list. */
export function populateBaseLayers(): void {
    const picker = select('baseLayer');
    picker.replaceChildren(
        ...BASE_LAYERS.map(layer => {
            const option = document.createElement('option');
            option.value = layer.id;
            option.textContent = layer.name;
            return option;
        })
    );
}

/**
 * Wire the map section to a freshly computed plan.
 *
 * The map is optional in the strongest sense: nothing else on the page depends
 * on it, it is never fetched unless asked for, and it needs no credential of
 * any kind. Satellite imagery — the one thing a Google key would have bought —
 * comes from Esri's keyless service.
 */
export function setupMap(steps: Step[], camera: CameraProfile, signal: AbortSignal): void {
    current = { steps, camera };

    const showButton = el<HTMLButtonElement>('showMapButton');
    const picker = select('baseLayer');
    const container = el('map');

    // An existing map just gets the new plan.
    if (view) {
        view.render(steps, camera);
        return;
    }

    onClick(showButton, signal, async () => {
        if (view) return;

        showButton.disabled = true;
        setMessage('mapStatus', 'Loading the map…');

        try {
            const { createMapLibreView } = await loadMap();
            clear(container);
            container.hidden = false;

            view = createMapLibreView(container, picker.value);
            view.onAnchorsChanged(anchors => {
                setMessage(
                    'mapStatus',
                    `Start ${anchors.start.lat.toFixed(5)}, ${anchors.start.lon.toFixed(5)} — ` +
                        'drag either marker to move the flight.'
                );
            });

            if (current) view.render(current.steps, current.camera);

            showButton.hidden = true;
            el('baseLayerField').hidden = false;
            setMessage('mapStatus', 'Drag either marker to move the flight.');
        } catch (error) {
            showButton.disabled = false;
            setMessage('mapStatus', '');
            throw error;
        }
    });

    picker.addEventListener(
        'change',
        () => {
            view?.setBaseLayer(picker.value);
        },
        { signal }
    );
}
