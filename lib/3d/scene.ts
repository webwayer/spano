import * as THREE from 'three';
import { draw3DPlane } from "./draw";

export async function setup3DScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45
        , 4 / 3
        , 0.1, 1000);
    const renderer = new THREE.WebGLRenderer(
        { preserveDrawingBuffer: true }
    );
    renderer.setSize(1000, 750);

    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(0, 500, 0);
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

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
    await draw3DPlane(scene, texture, { x: 0, y: -10, z: 150 });
    await draw3DPlane(scene, texture, { x: 0, y: -10, z: 200 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 250 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 300 });
    await draw3DPlane(scene, texture, { x: 0, y: 10, z: 350 });
    await draw3DPlane(scene, texture, { x: 0, y: 0, z: 400 });

    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 0 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 50 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 100 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 150 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 200 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 250 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 300 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 350 });
    await draw3DPlane(scene, texture, { x: 50, y: 10, z: 400 });

    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 0 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 50 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 100 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 150 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 200 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 250 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 300 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 350 });
    await draw3DPlane(scene, texture, { x: -50, y: -20, z: 400 });

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

    return { scene, camera, renderer }
}

export async function imageFrom3DScene(shootingPoint, shootedPoint, scene, camera, renderer) {
    camera.position.x = shootingPoint.z || 0;
    camera.position.y = shootingPoint.y;
    camera.position.z = shootingPoint.x;

    camera.lookAt(shootedPoint.z || 0, shootedPoint.y, shootedPoint.x);

    renderer.render(scene, camera);

    return renderer.domElement.toDataURL();
}