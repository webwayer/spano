import { simple } from "./planes/simple";
import { draw3DPoint } from "./draw";
import { imageFrom3DScene, setup3DScene } from "./scene";
import { addShapes } from "./worlds/shapes";

async function drawControlPointsOn3DScene(steps, viewPoint, scene) {
    await draw3DPoint({ x: viewPoint.x, y: 0 }, 0x00ffff, scene);
    for (const step of steps) {
        await draw3DPoint(step.firstElement.pointOnTheGround, 0xff0000, scene);
        await draw3DPoint(step.lastElement.pointOnTheGround, 0xff0000, scene);
        await draw3DPoint(step.shootedPoint, 0xffff00, scene);
    }
}

export async function ShitIn3D(steps, viewPoint) {
    const { scene, camera, renderer } = await setup3DScene();
    await simple(scene);
    await addShapes(scene);
    await drawControlPointsOn3DScene(steps, viewPoint, scene);

    const overviewImage = await imageFrom3DScene({
        x: -100, y: 200, z: 200
    }, {
        x: 200, y: 0, z: 0
    }, false, scene, camera, renderer);

    const shots = [];
    for (const step of steps) {
        shots.push(await imageFrom3DScene(step.shootingPoint, step.shootedPoint, step.backwards, scene, camera, renderer));
    }

    return [overviewImage, shots]
}