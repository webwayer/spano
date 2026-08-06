import * as THREE from 'three';
import { draw3DPlane } from './primitives';

const TILE_SIZE = 50;
/** Tile centres across the track: -100 .. 100 */
const X_TILES = [-2, -1, 0, 1, 2];
/** Tile centres along the track: 0 .. 600 */
const Z_TILE_COUNT = 13;

/**
 * A flat, textured ground plane for the synthetic preview.
 *
 * The 2018 version spelled out all 65 tiles as individual calls.
 */
export async function addGround(scene: THREE.Scene): Promise<void> {
    const texture = await loadRoadTexture();

    for (const xTile of X_TILES) {
        for (let zTile = 0; zTile < Z_TILE_COUNT; zTile++) {
            draw3DPlane(scene, texture, { x: xTile * TILE_SIZE, y: 0, z: zTile * TILE_SIZE });
        }
    }
}

async function loadRoadTexture(): Promise<THREE.Texture> {
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        // A bare relative path resolves against the page URL and breaks under
        // Vite's base. The fourth argument is onError — without it a failed load
        // left this promise pending forever.
        new THREE.TextureLoader().load(
            `${import.meta.env.BASE_URL}textures/road.jpg`,
            resolve,
            undefined,
            () => reject(new Error('Could not load the ground texture.'))
        );
    });

    // r152 turned on the linear colour workflow by default; without this the
    // texture renders washed out.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 5);

    return texture;
}
