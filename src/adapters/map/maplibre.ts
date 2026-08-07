import {
    Map as MapLibreMap,
    Marker,
    NavigationControl,
    Popup,
    ScaleControl,
    setWorkerUrl,
    type GeoJSONSource,
    type LngLatLike,
    type StyleSpecification,
} from 'maplibre-gl';

// MapLibre ships its own stylesheet; without it controls and markers are
// unpositioned. Bundled by Vite, so `style-src 'self'` still holds.
import 'maplibre-gl/dist/maplibre-gl.css';

import { getGeoSteps } from '../../core/geo/flight-path';
import { planFootprints } from '../../core/geo/footprint';
import type { CameraProfile } from '../../core/camera/profiles';
import type { GeoPoint, Step } from '../../core/types';
import {
    BASE_LAYERS,
    DEFAULT_ANCHORS,
    DEFAULT_BASE_LAYER,
    type BaseLayer,
    type MapAnchors,
    type MapView,
} from './types';

// MapLibre resolves its worker relative to its own module URL, which after
// bundling points at a file that does not exist. The build publishes the
// untouched worker pair under this path — see maplibreWorkerAssets() in
// vite.config.ts, which must stay in step with the literal below.
//
// Dev needs no override: the dev server serves node_modules directly, so
// MapLibre's own resolution already works.
if (import.meta.env.PROD) {
    setWorkerUrl(`${import.meta.env.BASE_URL}assets/maplibre/maplibre-gl-worker.mjs`);
}

const FOOTPRINTS_SOURCE = 'spano-footprints';
const TRACK_SOURCE = 'spano-track';
const BASE_SOURCE = 'spano-base';
const BASE_LAYER_ID = 'spano-base-layer';

/** Matches the accent used for the plan elsewhere in the page. */
const PLAN_COLOUR = '#0b4fa8';

function styleFor(layer: BaseLayer): StyleSpecification {
    return {
        version: 8,
        sources: {
            [BASE_SOURCE]: {
                type: 'raster',
                tiles: [...layer.tiles],
                tileSize: layer.tileSize,
                maxzoom: layer.maxZoom,
                attribution: layer.attribution,
            },
        },
        layers: [{ id: BASE_LAYER_ID, type: 'raster', source: BASE_SOURCE }],
    };
}

function toLngLat(point: GeoPoint): LngLatLike {
    return [point.lon, point.lat];
}

interface FeatureCollection {
    type: 'FeatureCollection';
    features: {
        type: 'Feature';
        properties: Record<string, unknown>;
        geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'LineString'; coordinates: number[][] };
    }[];
}

/** GeoJSON polygon rings must repeat their first point at the end. */
function closeRing(ring: GeoPoint[]): GeoPoint[] {
    const first = ring[0];
    return first ? [...ring, first] : ring;
}

function emptyCollection(): FeatureCollection {
    return { type: 'FeatureCollection', features: [] };
}

/**
 * The plan on a real map, rendered with MapLibre and keyless raster tiles.
 *
 * Drag either marker to move the flight; the footprints redraw from the same
 * `getGeoSteps` the mission export would use, so what you see is what would be
 * flown.
 */
export function createMapLibreView(
    container: HTMLElement,
    initialLayerId = DEFAULT_BASE_LAYER.id,
    onError?: (message: string) => void
): MapView {
    let anchors: MapAnchors = { ...DEFAULT_ANCHORS };
    let listener: ((anchors: MapAnchors) => void) | undefined;
    let lastPlan: { steps: Step[]; camera: CameraProfile } | undefined;

    const map = new MapLibreMap({
        container,
        style: styleFor(BASE_LAYERS.find(l => l.id === initialLayerId) ?? DEFAULT_BASE_LAYER),
        center: toLngLat(anchors.start),
        zoom: 15,
        // Keyboard panning and zooming are on by default; keep them, the map is
        // a focusable widget in a page that has to stay operable without a mouse.
        attributionControl: { compact: false },
    });

    map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }));

    const startMarker = new Marker({ draggable: true, color: PLAN_COLOUR })
        .setLngLat(toLngLat(anchors.start))
        .setPopup(new Popup({ closeButton: false }).setText('Start point — where the flight begins'))
        .addTo(map);

    const directionMarker = new Marker({ draggable: true, color: '#8A5A12' })
        .setLngLat(toLngLat(anchors.direction))
        .setPopup(new Popup({ closeButton: false }).setText('Direction point — which way the flight runs'))
        .addTo(map);

    function readAnchors(): MapAnchors {
        const start = startMarker.getLngLat();
        const direction = directionMarker.getLngLat();
        return {
            start: { lat: start.lat, lon: start.lng },
            direction: { lat: direction.lat, lon: direction.lng },
        };
    }

    function onDragEnd(): void {
        anchors = readAnchors();
        redraw();
        listener?.(anchors);
    }

    startMarker.on('dragend', onDragEnd);
    directionMarker.on('dragend', onDragEnd);

    /** Add the plan's sources and layers. Re-run whenever the style is swapped. */
    function installPlanLayers(): void {
        if (!map.getSource(FOOTPRINTS_SOURCE)) {
            map.addSource(FOOTPRINTS_SOURCE, { type: 'geojson', data: emptyCollection() });
            map.addLayer({
                id: `${FOOTPRINTS_SOURCE}-fill`,
                type: 'fill',
                source: FOOTPRINTS_SOURCE,
                paint: { 'fill-color': PLAN_COLOUR, 'fill-opacity': 0.18 },
            });
            map.addLayer({
                id: `${FOOTPRINTS_SOURCE}-line`,
                type: 'line',
                source: FOOTPRINTS_SOURCE,
                paint: { 'line-color': PLAN_COLOUR, 'line-width': 1.5 },
            });
        }

        if (!map.getSource(TRACK_SOURCE)) {
            map.addSource(TRACK_SOURCE, { type: 'geojson', data: emptyCollection() });
            map.addLayer({
                id: `${TRACK_SOURCE}-line`,
                type: 'line',
                source: TRACK_SOURCE,
                paint: { 'line-color': PLAN_COLOUR, 'line-width': 3, 'line-dasharray': [2, 1.5] },
            });
        }
    }

    function redraw(): void {
        if (!lastPlan || !map.isStyleLoaded()) return;
        installPlanLayers();

        const { steps, camera } = lastPlan;
        const geoSteps = getGeoSteps(anchors.start, anchors.direction, steps);
        const footprints = planFootprints(
            steps,
            geoSteps.map(g => g.heading),
            anchors.start,
            camera.hFov
        );

        const footprintCollection: FeatureCollection = {
            type: 'FeatureCollection',
            features: footprints.map((ring, i) => ({
                type: 'Feature',
                properties: { step: i + 1 },
                geometry: {
                    type: 'Polygon',
                    coordinates: [closeRing(ring).map(p => [p.lon, p.lat])],
                },
            })),
        };
        // setData resolves once the worker has parsed the data; the redraw does
        // not depend on that, and a rejection surfaces through map.on('error').
        void map.getSource<GeoJSONSource>(FOOTPRINTS_SOURCE)?.setData(footprintCollection);

        const trackCollection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: geoSteps.map(g => [g.geoPoint.lon, g.geoPoint.lat]),
                    },
                },
            ],
        };
        void map.getSource<GeoJSONSource>(TRACK_SOURCE)?.setData(trackCollection);
    }

    // MapLibre reports tile, style and worker failures through this event and
    // nowhere else. Without a listener the map simply stays blank — which is
    // exactly how a broken worker URL presented: no error, no tiles, no clue.
    map.on('error', event => {
        const reason = event.error instanceof Error ? event.error.message : String(event.error);
        console.error('[spano] map error:', event.error);
        onError?.(reason);
    });

    map.on('load', redraw);
    // A style swap discards every source and layer, so they must be re-added.
    map.on('styledata', redraw);

    return {
        render(steps, camera) {
            lastPlan = { steps, camera };
            redraw();
        },
        onAnchorsChanged(next) {
            listener = next;
        },
        anchors() {
            return anchors;
        },
        setBaseLayer(id) {
            const layer = BASE_LAYERS.find(l => l.id === id);
            if (!layer) return;
            map.setStyle(styleFor(layer));
        },
        destroy() {
            startMarker.remove();
            directionMarker.remove();
            map.remove();
        },
    };
}
