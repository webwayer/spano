import * as THREE from 'three';
import type { Point } from '../../core/types';

import { PREVIEW_CAMERA } from '../../core/camera/profiles';

const RENDER_WIDTH = 1000;
const RENDER_HEIGHT = 750;

export interface Scene3D {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    dispose(): void;
}

/**
 * A renderer is a WebGL context, and browsers cap how many a page may hold at
 * once — Chrome at around 16. The 2018 code built a fresh one on every Generate
 * click and never released it, so roughly the sixteenth click killed the 3D
 * preview for the rest of the session. Reusing one renderer avoids that
 * entirely; dispose() is here for callers that would rather tear down.
 */
let sharedRenderer: THREE.WebGLRenderer | undefined;

function getRenderer(): THREE.WebGLRenderer {
    if (!sharedRenderer) {
        sharedRenderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
        sharedRenderer.setSize(RENDER_WIDTH, RENDER_HEIGHT);
    }
    return sharedRenderer;
}

export function setup3DScene(): Scene3D {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(PREVIEW_CAMERA.vFov, 4 / 3, 0.1, 1000);
    const renderer = getRenderer();

    // three.js r155+ uses physically-correct lighting and useLegacyLights was
    // removed in r165: PointLight intensity is candela and decays as 1/d², so
    // the original intensity of 1 at 500 units up gave ~4e-6 lux — a black
    // render that still compiled and still passed typecheck. decay = 0 restores
    // distance-independent falloff; these values are tuned by eye.
    const light = new THREE.PointLight(0xffffff, 2.5);
    light.decay = 0;
    light.position.set(0, 500, 0);
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 1));

    return {
        scene,
        camera,
        renderer,
        dispose() {
            disposeSceneContents(scene);
        },
    };
}

/** Release GPU memory held by everything in a scene. */
export function disposeSceneContents(scene: THREE.Scene): void {
    scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (!material) continue;
            const map = (material as THREE.MeshLambertMaterial).map;
            map?.dispose();
            material.dispose();
        }
    });
    scene.clear();
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/**
 * The plan is a 2D slice: its x is distance down the track, which is the
 * scene's z; its y is altitude, which stays y; and it has no width component,
 * so the camera sits on the centreline.
 */
export function sliceToScene(point: Point): Vec3 {
    return { x: 0, y: point.y, z: point.x };
}

/** Point the camera at a target and return the frame as a data URL. */
export function imageFrom3DScene(
    from: Vec3,
    at: Vec3,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer
): string {
    camera.position.set(from.x, from.y, from.z);
    camera.lookAt(at.x, at.y, at.z);

    renderer.render(scene, camera);

    return renderer.domElement.toDataURL();
}
