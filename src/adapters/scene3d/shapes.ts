import * as THREE from 'three';

/**
 * Synthetic landmarks either side of the track.
 *
 * These exist purely to give the preview something with height and parallax, so
 * you can judge whether the planned frames actually tile the scene.
 */
interface Row {
    /** Offset across the track, metres. */
    x: number;
    geometry: THREE.BufferGeometry;
    color: number;
    count: number;
    /** Spacing along the track, metres. */
    spacing: number;
    /** Distance the row starts beyond its first spacing interval, metres. */
    offset?: number;
}

export function addShapes(scene: THREE.Scene): void {
    // CubeGeometry was removed from three.js in r125; BoxGeometry replaces it.
    const smallCube = new THREE.BoxGeometry(5, 10, 5);
    const cube = new THREE.BoxGeometry(10, 20, 10);
    const bigCube = new THREE.BoxGeometry(20, 80, 10);
    const hugeCube = new THREE.BoxGeometry(30, 100, 30);
    const tallCube = new THREE.BoxGeometry(10, 120, 10);
    const sphere = new THREE.SphereGeometry(10);

    const RED = 0xff0000;
    const GREEN = 0x00ff00;
    const BLUE = 0x0000ff;
    const MAGENTA = 0xff00ff;

    const rows: Row[] = [
        { x: 10, geometry: sphere, color: RED, count: 10, spacing: 40 },
        { x: 30, geometry: smallCube, color: GREEN, count: 50, spacing: 10, offset: 30 },
        { x: 50, geometry: tallCube, color: BLUE, count: 10, spacing: 40 },
        { x: 70, geometry: cube, color: MAGENTA, count: 10, spacing: 40 },
        { x: -20, geometry: bigCube, color: MAGENTA, count: 10, spacing: 50 },
        { x: -60, geometry: hugeCube, color: BLUE, count: 10, spacing: 50 },
        { x: -100, geometry: bigCube, color: GREEN, count: 10, spacing: 50 },
    ];

    for (const row of rows) {
        const material = new THREE.MeshLambertMaterial({ color: row.color });
        for (let i = 1; i <= row.count; i++) {
            const mesh = new THREE.Mesh(row.geometry, material);
            mesh.position.set(row.x, 0, i * row.spacing + (row.offset ?? 0));
            scene.add(mesh);
        }
    }
}
