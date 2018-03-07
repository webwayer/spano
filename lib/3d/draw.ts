import * as THREE from 'three';

export async function draw3DPoint(point, color, scene) {
    const geometry = new THREE.SphereGeometry(1, 5, 5);
    const material = new THREE.MeshLambertMaterial({ color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.x = 0;
    sphere.position.y = point.y;
    sphere.position.z = point.x;
    scene.add(sphere);
}

export async function draw3DPlane(scene, texture, position) {
    const planeGeometry = new THREE.PlaneGeometry(50, 50, 1, 1);
    const planeMaterial = new THREE.MeshLambertMaterial({ map: texture });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);

    plane.rotation.x = -0.5 * Math.PI;
    plane.position.x = position.x;
    plane.position.y = position.y;
    plane.position.z = position.z;

    scene.add(plane);
}