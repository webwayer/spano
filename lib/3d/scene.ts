import * as THREE from 'three';

export async function setup3DScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45
        , 4 / 3
        , 0.1, 1000);
    const renderer = new THREE.WebGLRenderer(
        { preserveDrawingBuffer: true }
    );
    renderer.setSize(1000, 750);

    // three.js r155+ uses physically-correct lighting and useLegacyLights was
    // removed entirely in r165. PointLight intensity is now candela and decays
    // as 1/d², so the original intensity of 1 at 500 units up would give roughly
    // 4e-6 lux — a black render that still compiles and still passes typecheck.
    // decay = 0 restores distance-independent falloff; the values below are
    // retuned by eye for this synthetic scene rather than matched to the 2018
    // output.
    const light = new THREE.PointLight(0xffffff, 2.5);
    light.decay = 0;
    light.position.set(0, 500, 0);
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 1));

    return { scene, camera, renderer }
}

export async function imageFrom3DScene(shootingPoint, shootedPoint, backwards, scene, camera, renderer) {
    camera.position.x = shootingPoint.z || 0;
    camera.position.y = shootingPoint.y;
    camera.position.z = shootingPoint.x;

    camera.lookAt(shootedPoint.z || 0, shootedPoint.y, shootedPoint.x);

    renderer.render(scene, camera);

    return renderer.domElement.toDataURL();
}