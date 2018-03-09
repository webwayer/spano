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

    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(0, 500, 0);
    scene.add(light);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

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