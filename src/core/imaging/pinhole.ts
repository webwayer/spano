import { tan, toRadians } from '../geometry/angles';
import type { Vec2 } from '../geometry/homography';
import { lookAt, rotate, scale, subtract, type Basis, type Vec3 } from '../geometry/vector3';

/**
 * A camera, as the two things a projection needs: where it is and where it
 * points.
 *
 * One focal length, not two. That is now safe to assume: `CameraProfile`
 * carries its sensor size and a unit test holds the two fields of view
 * consistent with it, so fx and fy agree. Before 2026 they did not, and a
 * single focal length here would have quietly encoded the wrong one.
 */
export interface Pinhole {
    readonly centre: Vec3;
    readonly basis: Basis;
    /** Focal length in pixels of the image this camera produces. */
    readonly focal: number;
    readonly principal: Vec2;
    readonly size: { readonly width: number; readonly height: number };
}

export function pinholeAt(
    centre: Vec3,
    target: Vec3,
    vFovDegrees: number,
    size: { width: number; height: number }
): Pinhole {
    return {
        centre,
        basis: lookAt(centre, target),
        focal: size.height / 2 / tan(toRadians(vFovDegrees / 2)),
        principal: { x: size.width / 2, y: size.height / 2 },
        size,
    };
}

/**
 * Where a world point lands in the image.
 *
 * Throws for anything at or behind the plane of the lens. That is not
 * defensive: the ground plane's vanishing line is in front of every oblique
 * camera here, and a strip asked to include the horizon would otherwise be
 * handed a plausible-looking finite pixel on the wrong side of the frame.
 */
export function project(camera: Pinhole, world: Vec3): Vec2 {
    const local = rotate(camera.basis, subtract(world, camera.centre));
    if (local.z <= 0) throw new RangeError('Point is behind the camera and has no image.');

    return {
        x: camera.principal.x + (camera.focal * local.x) / local.z,
        y: camera.principal.y + (camera.focal * local.y) / local.z,
    };
}

/** The world-space direction of the ray through an image pixel. Not normalised. */
export function rayThrough(camera: Pinhole, pixel: Vec2): Vec3 {
    const local: Vec3 = {
        x: (pixel.x - camera.principal.x) / camera.focal,
        y: (pixel.y - camera.principal.y) / camera.focal,
        z: 1,
    };
    const { right, down, forward } = camera.basis;
    // The basis rows are world axes in camera space, so the transpose takes a
    // camera-space vector back to the world.
    return {
        x: right.x * local.x + down.x * local.y + forward.x * local.z,
        y: right.y * local.x + down.y * local.y + forward.y * local.z,
        z: right.z * local.x + down.z * local.y + forward.z * local.z,
    };
}

/**
 * Where the ray through a pixel crosses the plane `z = alongTrack`, given as
 * the world point.
 *
 * The panorama's rows are lines running laterally at a fixed point of the
 * curve, and this is how a column on such a row is turned back into a place in
 * the world.
 */
export function rayAtAlongTrack(camera: Pinhole, pixel: Vec2, alongTrack: number): Vec3 {
    const direction = rayThrough(camera, pixel);
    if (direction.z === 0) throw new RangeError('Ray runs parallel to the track and never reaches that distance.');

    const t = (alongTrack - camera.centre.z) / direction.z;
    if (t <= 0) throw new RangeError('That distance lies behind the camera.');

    const offset = scale(direction, t);
    return { x: camera.centre.x + offset.x, y: camera.centre.y + offset.y, z: camera.centre.z + offset.z };
}
