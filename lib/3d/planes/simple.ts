import * as THREE from 'three';
import { draw3DPlane } from "../draw";

export async function simple(scene) {
    const texture = await new Promise<any>((resolve, reject) => {
        new THREE.TextureLoader().load("resources/road.jpg", function (texture) {
            resolve(texture)
        });
    });
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

    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: 50, y: 0, z: 400 });

    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: -50, y: 0, z: 400 });

    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: 100, y: 0, z: 400 });

    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 0 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 50 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 100 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 150 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 200 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 350 });
    await draw3DPlane(scene, texture, { x: -100, y: 0, z: 400 });
}