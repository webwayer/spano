import * as THREE from 'three';

export async function addShapes(scene) {
    const smallCubeGeometry = new THREE.CubeGeometry(5, 10, 5);
    const cubeGeometry = new THREE.CubeGeometry(10, 20, 10);
    const bigCubeGeometry = new THREE.CubeGeometry(20, 80, 10);
    const bigbigCubeGeometry = new THREE.CubeGeometry(30, 100, 30);
    const tallCubeGeometry = new THREE.CubeGeometry(10, 120, 10);
    const sphereGeometry = new THREE.SphereGeometry(10);

    const materialRed = new THREE.MeshLambertMaterial(
        { color: 0xff0000 });
    const materialGreen = new THREE.MeshLambertMaterial(
        { color: 0x00ff00 });
    const materialBlue = new THREE.MeshLambertMaterial(
        { color: 0x0000ff });
    const materialX = new THREE.MeshLambertMaterial(
        { color: 0xff00ff });

    for (let i = 1; i <= 10; i++) {
        const cube = new THREE.Mesh(sphereGeometry, materialRed);
        cube.position.x = 10;
        cube.position.y = 0;
        cube.position.z = i * 40;
        scene.add(cube);
    }

    for (let i = 1; i <= 50; i++) {
        const cube = new THREE.Mesh(smallCubeGeometry, materialGreen);
        cube.position.x = 30;
        cube.position.y = 0;
        cube.position.z = (i * 10) + 30;
        scene.add(cube);
    }

    for (let i = 1; i <= 10; i++) {
        const cube = new THREE.Mesh(tallCubeGeometry, materialBlue);
        cube.position.x = 50;
        cube.position.y = 0;
        cube.position.z = i * 40;
        scene.add(cube);
    }

    for (let i = 1; i <= 10; i++) {
        const cube = new THREE.Mesh(cubeGeometry, materialX);
        cube.position.x = 70;
        cube.position.y = 0;
        cube.position.z = i * 40;
        scene.add(cube);
    }

    for (let i = 1; i <= 10; i++) {
        const cube = new THREE.Mesh(bigCubeGeometry, materialX);
        cube.position.x = -20;
        cube.position.y = 0;
        cube.position.z = i * 50;
        scene.add(cube);
    }

    for (let i = 1; i <= 10; i++) {
        const cube = new THREE.Mesh(bigbigCubeGeometry, materialBlue);
        cube.position.x = -60;
        cube.position.y = 0;
        cube.position.z = i * 50;
        scene.add(cube);
    }

    for (let i = 1; i <= 10; i++) {
        const cube = new THREE.Mesh(bigCubeGeometry, materialGreen);
        cube.position.x = -100;
        cube.position.y = 0;
        cube.position.z = i * 50;
        scene.add(cube);
    }
}