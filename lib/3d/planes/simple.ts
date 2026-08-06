import * as THREE from 'three';
import { draw3DPlane } from "../draw";

export async function simple(scene) {
    const texture = await new Promise<any>((resolve, reject) => {
        // A bare relative path resolves against the page URL and breaks under
        // Vite's base: '/spano/'. BASE_URL is rewritten at build time.
        // The fourth argument is onError — without it a failed load left this
        // promise pending forever.
        new THREE.TextureLoader().load(
            `${import.meta.env.BASE_URL}textures/road.jpg`,
            resolve,
            undefined,
            reject
        );
    });
    // r152 turned on the linear colour workflow by default; without this the
    // texture renders washed out.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 5);

    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 400 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 450 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 500 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 550 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 600 });

    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 400 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 450 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 500 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 550 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 600 });

    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 400 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 450 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 500 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 550 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 600 });

    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 400 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 450 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 500 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 550 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 600 });

    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 400 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 450 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 500 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 550 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 600 });
}