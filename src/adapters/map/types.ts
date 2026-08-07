import type { CameraProfile } from '../../core/camera/profiles';
import type { GeoPoint, Step } from '../../core/types';

/** Where the flight starts, and which way it runs. Both draggable on the map. */
export interface MapAnchors {
    start: GeoPoint;
    direction: GeoPoint;
}

/**
 * A base layer, and what it costs to use.
 *
 * `keyless` is not decoration. This project exists in its current form because
 * an API key was hard-coded and published for eight years; every layer here has
 * to be usable with no credential at all, and the flag is what makes that
 * checkable rather than assumed.
 */
export interface BaseLayer {
    id: string;
    name: string;
    keyless: true;
    tiles: string[];
    tileSize: number;
    maxZoom: number;
    attribution: string;
}

/**
 * A map, reduced to what spano needs from one.
 *
 * Deliberately narrow: two draggable anchors in, a set of ground footprints
 * out. Everything a provider does beyond that — tiles, projection, gestures —
 * stays behind this interface.
 */
export interface MapView {
    /** Draw a plan. Called again on every regeneration. */
    render(steps: Step[], camera: CameraProfile): void;

    /** Fires when the user drags either anchor. */
    onAnchorsChanged(listener: (anchors: MapAnchors) => void): void;

    anchors(): MapAnchors;

    setBaseLayer(id: string): void;

    /** Release the map, its tiles and its listeners. */
    destroy(): void;
}

/** San Francisco waterfront — the coordinates the 2018 code hard-coded. */
export const DEFAULT_ANCHORS: MapAnchors = {
    start: { lat: 37.77068, lon: -122.393042 },
    direction: { lat: 37.770501, lon: -122.396027 },
};

/**
 * Every base layer spano offers. All keyless, both by policy and by type.
 *
 * Satellite imagery was the one thing a Google key would have bought, and Esri
 * World Imagery provides it with no credential — which is why there is no key
 * field anywhere in this application.
 */
export const BASE_LAYERS: readonly BaseLayer[] = [
    {
        id: 'osm',
        name: 'Street map',
        keyless: true,
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
    },
    {
        id: 'satellite',
        name: 'Satellite',
        keyless: true,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxZoom: 19,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
];

/** The layer shown until the viewer picks another. */
export const DEFAULT_BASE_LAYER: BaseLayer = BASE_LAYERS[0] ?? {
    id: 'osm',
    name: 'Street map',
    keyless: true,
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
};

/** The hosts the base layers fetch from. Kept here so the CSP can name them. */
export const TILE_HOSTS: readonly string[] = ['https://tile.openstreetmap.org', 'https://server.arcgisonline.com'];
