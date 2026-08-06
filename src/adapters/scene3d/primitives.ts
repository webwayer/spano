import * as THREE from 'three';
import type { Point } from '../../core/types';

const PLANE_SIZE = 50;

/** A marker sphere at a point in the flight-plan slice. */
export function draw3DPoint(point: Point, color: number, scene: THREE.Scene): void {
    const geometry = new THREE.SphereGeometry(1, 5, 5);
    const material = new THREE.MeshLambertMaterial({ color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(0, point.y, point.x);
    scene.add(sphere);
}

/** One tile of textured ground, laid flat. */
export function draw3DPlane(
    scene: THREE.Scene,
    texture: THREE.Texture,
    position: { x: number; y: number; z: number }
): void {
    const planeGeometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);
    const planeMaterial = new THREE.MeshLambertMaterial({ map: texture });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);

    plane.rotation.x = -0.5 * Math.PI;
    plane.position.set(position.x, position.y, position.z);

    scene.add(plane);
}
