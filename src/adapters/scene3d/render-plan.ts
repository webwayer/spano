import { addGround } from './ground';
import { addShapes } from './shapes';
import { draw3DPoint } from './primitives';
import { imageFrom3DScene, setup3DScene, sliceToScene, type Vec3 } from './scene';
import type { Point, Step } from '../../core/types';
import type * as THREE from 'three';

const CYAN = 0x00ffff;
const RED = 0xff0000;
const YELLOW = 0xffff00;

/**
 * The overview is the one shot that is not on the centreline — it stands off to
 * the side so the whole track is visible. These are scene coordinates, matching
 * what the 2018 code produced once its {x,y,z}-through-a-2D-Point indirection
 * is unwound.
 */
const OVERVIEW_FROM: Vec3 = { x: 200, y: 200, z: -100 };
const OVERVIEW_AT: Vec3 = { x: 0, y: 0, z: 200 };

function drawControlPoints(steps: Step[], viewPoint: Point, scene: THREE.Scene): void {
    draw3DPoint({ x: viewPoint.x, y: 0 }, CYAN, scene);
    for (const step of steps) {
        draw3DPoint(step.firstElement.pointOnTheGround, RED, scene);
        draw3DPoint(step.lastElement.pointOnTheGround, RED, scene);
        draw3DPoint(step.shootedPoint, YELLOW, scene);
    }
}

export interface RenderedPlan {
    /** A wide shot of the whole scene, for orientation. */
    overview: string;
    /** One synthetic frame per step, in step order. */
    frames: string[];
}

/**
 * Render the plan against a synthetic scene, so the framing can be checked
 * without flying anything.
 *
 * Was `ShitIn3D` until Phase 3.
 */
export async function renderPlanIn3D(steps: Step[], viewPoint: Point): Promise<RenderedPlan> {
    const { scene, camera, renderer, dispose } = setup3DScene();
    try {
        await addGround(scene);
        addShapes(scene);
        drawControlPoints(steps, viewPoint, scene);

        const overview = imageFrom3DScene(OVERVIEW_FROM, OVERVIEW_AT, scene, camera, renderer);
        const frames = steps.map(step =>
            imageFrom3DScene(
                // A survey grid flies lines either side of the centreline, so
                // the preview has to place the camera there too — otherwise
                // every line renders the same view and the mode looks broken.
                sliceToScene(step.shootingPoint, step.lateralOffset),
                sliceToScene(step.shootedPoint, step.lateralOffset),
                scene,
                camera,
                renderer
            )
        );

        return { overview, frames };
    } finally {
        // Release GPU memory for this scene's geometry and textures. The
        // renderer itself is shared and deliberately kept alive.
        dispose();
    }
}
