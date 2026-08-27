import type { CameraProfile } from '../camera/profiles';
import { tan, toRadians } from '../geometry/angles';
import { lookAt, quaternionFrom, rotate, scale, type Vec3 } from '../geometry/vector3';
import type { Point, Step } from '../types';

/**
 * The plan as a COLMAP text model.
 *
 * What this is for, precisely, because it is easy to overclaim. A crop cannot
 * remove the parallax of objects standing above the ground: the ray the
 * panorama needs exists in no photograph, so the only complete fix is to
 * reconstruct the scene and *render* that ray. Reconstruction wants camera
 * poses, and spano computes poses — that is the whole connection.
 *
 * Two honest cautions, both of which matter more than the format details:
 *
 * 1. **These poses are planned, not measured.** The aircraft will hover near
 *    them, not on them, and wind, GPS drift and gimbal slop are all larger than
 *    the tolerances a reconstruction cares about. Feeding them to COLMAP as
 *    ground truth would produce a confident, wrong reconstruction. They are a
 *    prior and a scene skeleton: run ordinary structure-from-motion on the real
 *    photographs, then use this model to align its result to the plan's frame.
 *
 * 2. **The valuable half is the render path, not the capture path.** Once a
 *    reconstruction exists, the poses in `images.txt` are exactly the virtual
 *    cameras the panorama is composed from — and rendering a virtual camera is
 *    free. The frame count stops being a flying cost, so the finest capture
 *    density becomes available from a coarse flight. That is the one route by
 *    which this project's central defect actually goes to zero rather than
 *    merely getting smaller.
 *
 * Frames are described as they come off the card, before the 180 degree
 * rotation `cutImage` applies to a backwards step. The rotation is spano's way
 * of getting a strip the right way up in the panorama; the camera itself was
 * level, yawed around, and that is what `lookAt` reproduces.
 */
export interface ColmapModel {
    /** Contents of `cameras.txt`. */
    readonly cameras: string;
    /** Contents of `images.txt`. */
    readonly images: string;
    /** Contents of `points3D.txt`. Empty, but the model will not load without it. */
    readonly points3D: string;
}

export interface ColmapOptions {
    /**
     * Prefix for the image file names, which must match the photographs after
     * the pilot renames them. The drone names files its own way and spano
     * cannot know what it chose.
     */
    readonly namePrefix?: string;
    readonly nameExtension?: string;
}

const CAMERA_ID = 1;

/**
 * Slice coordinates into the export's world frame.
 *
 * X across the track, Y up, Z along it. The slice has no lateral axis, so X is
 * zero for every strip strategy; it exists because a survey grid will need it.
 */
function worldFromSlice(point: Point, across = 0): Vec3 {
    return { x: across, y: point.y, z: point.x };
}

/**
 * `cameras.txt` for the one physical camera every frame was taken with.
 *
 * PINHOLE rather than SIMPLE_PINHOLE because the two fields of view are given
 * separately and need not agree; PINHOLE takes fx and fy. No distortion terms:
 * spano's whole model is an ideal pinhole, and inventing plausible-looking
 * coefficients would be worse than declaring none.
 */
function camerasText(camera: CameraProfile): string {
    const { width, height } = camera.sensorPixels;
    const fx = width / 2 / tan(toRadians(camera.hFov / 2));
    const fy = height / 2 / tan(toRadians(camera.vFov / 2));

    return [
        '# Camera list with one line of data per camera:',
        '#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]',
        '# Number of cameras: 1',
        `${String(CAMERA_ID)} PINHOLE ${String(width)} ${String(height)} ${round(fx)} ${round(fy)} ${round(width / 2)} ${round(height / 2)}`,
        '',
    ].join('\n');
}

/** Six decimals: below a micrometre at these distances, and it keeps files diffable. */
function round(value: number): string {
    return value.toFixed(6);
}

function imagesText(steps: readonly Step[], options: Required<ColmapOptions>): string {
    const lines = [
        '# Image list with two lines of data per image:',
        '#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME',
        '#   POINTS2D[] as (X, Y, POINT3D_ID)',
        `# Number of images: ${String(steps.length)}, mean observations per image: 0`,
        '# PLANNED poses, not measured ones. See src/core/export/colmap.ts.',
    ];

    steps.forEach((step, index) => {
        const centre = worldFromSlice(step.shootingPoint);
        const basis = lookAt(centre, worldFromSlice(step.shootedPoint));
        const q = quaternionFrom(basis);

        // COLMAP stores world-to-camera: X_cam = R * X_world + T, so the
        // translation is not the camera position but -R times it. Writing the
        // position here is the single most common way to produce a pose file
        // that loads cleanly and reconstructs into nonsense.
        const translation = scale(rotate(basis, centre), -1);

        const name = `${options.namePrefix}${String(index + 1).padStart(4, '0')}${options.nameExtension}`;

        lines.push(
            [
                index + 1,
                round(q.w),
                round(q.x),
                round(q.y),
                round(q.z),
                round(translation.x),
                round(translation.y),
                round(translation.z),
                CAMERA_ID,
                name,
            ].join(' ')
        );
        // COLMAP expects a second line per image for its 2D points. It is empty
        // here — there are no observations in a plan — but it must be present,
        // and a missing one shifts every subsequent image by a line.
        lines.push('');
    });

    // No trailing newline added: the array already ends with the blank
    // observation line of the last image, so joining leaves the file ending in
    // exactly one newline. Appending another gave a stray blank line at EOF.
    return lines.join('\n');
}

function pointsText(): string {
    return [
        '# 3D point list with one line of data per point:',
        '#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)',
        '# Number of points: 0, mean track length: 0',
        '',
    ].join('\n');
}

export function makeColmapModel(
    steps: readonly Step[],
    camera: CameraProfile,
    options: ColmapOptions = {}
): ColmapModel {
    const resolved: Required<ColmapOptions> = {
        namePrefix: options.namePrefix ?? 'frame_',
        nameExtension: options.nameExtension ?? '.jpg',
    };

    return {
        cameras: camerasText(camera),
        images: imagesText(steps, resolved),
        points3D: pointsText(),
    };
}
