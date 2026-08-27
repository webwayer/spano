import type { CameraProfile } from '../camera/profiles';
import { atan2, cos, radiansOf, sin, tan, toDegrees, toRadians } from '../geometry/angles';
import { quadToQuad, type Mat3, type Quad, type Vec2 } from '../geometry/homography';
import { lookAt, type Vec3 } from '../geometry/vector3';
import type { Point, Step, Triple } from '../types';
import { pinholeAt, project, rayAtAlongTrack, type Pinhole } from './pinhole';

/**
 * Where each strip belongs in the finished panorama, and how to resample it.
 *
 * The crop this replaces selects pixels; it cannot change the projection they
 * were captured under. Two neighbouring strips are shot from different places,
 * so the ground foreshortens differently in each, and they disagree wherever
 * the cut falls. Resampling through the exact projective map removes that
 * disagreement for everything lying on the ground — which is all a planar warp
 * can ever reach. Objects standing above the ground still slide; that residual
 * is what `quality/parallax.ts` measures and what only a reconstruction fixes.
 *
 * The panorama is treated as its own pinhole camera, standing at the viewer's
 * eye and looking at the virtual surface. That is not a modelling flourish, it
 * is what `flight-model.md` already says the panorama *is*: what a viewer at a
 * fixed point would see if the ground were painted onto the curve. Making it a
 * camera means a strip's destination is an ordinary projection, and the
 * composite map from captured frame to panorama is then a homography.
 *
 * The one approximation, stated plainly: the curve is replaced by the plane
 * through the strip's near and far edges. Exact on the flat legs, second-order
 * small around the arc, and it shrinks as strips get narrower — so choosing a
 * finer capture density improves this as well as the parallax.
 */
export interface PanoramaGeometry {
    readonly camera: Pinhole;
    readonly width: number;
    readonly height: number;
}

export interface StripSampling {
    /** Where this strip lands in the panorama, in panorama pixels. */
    readonly destination: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    /** Panorama pixel to source pixel. This is the inverse warp a shader wants. */
    readonly toSource: Mat3;
    /**
     * Where the aircraft was, and the ground and curve points at the strip's
     * centre.
     *
     * Carried rather than recomputed because the orthorectifying compositor
     * needs the angle from nadir per strip, and rebuilding it there would mean
     * a second copy of the convention for which end of a backwards frame is
     * near — a copy that could drift from this one without any test noticing.
     */
    readonly camera: Point;
    readonly ground: Point;
    readonly curve: Point;
}

function worldOf(point: Point, lateral = 0): Vec3 {
    return { x: lateral, y: point.y, z: point.x };
}

/** Near and far edges of a strip, in the order the aircraft sees them. */
function edgesOf(step: Step): { near: Triple; far: Triple } {
    // Mirrors getPointsForViewport: an overflown patch is imaged from the far
    // side, so the frame's near edge is the strip's last sample.
    return step.backwards
        ? { near: step.lastElement, far: step.firstElement }
        : { near: step.firstElement, far: step.lastElement };
}

/**
 * The panorama's own camera, sized to hold the whole curve.
 *
 * Focal length comes from the width and the source camera's horizontal field,
 * so the panorama samples laterally at roughly the rate the frames do. The
 * height then falls out of how much of the sky the curve sweeps, rather than
 * being chosen.
 */
export interface PanoramaLimits {
    /** Preferred width in pixels. Reduced if the curve is too tall to fit. */
    readonly width: number;
    /** Hard cap on the canvas height. */
    readonly maxHeight: number;
}

/**
 * Widest sweep a rectilinear panorama is worth attempting, degrees.
 *
 * A pinhole cannot image half a turn at all — the projection runs to infinity —
 * and it degrades long before that, because the scale grows as the tangent of
 * the angle from the axis. At 150 degrees the edges are stretched about eight
 * times harder than the centre, which is past the point of usefulness. Measured
 * over the parameter space the form can reach, 24% of shapes sweep more than
 * this; they are the extreme corners, and the honest answer for them is that
 * this projection does not apply, not a picture nobody can read.
 */
export const MAX_PANORAMA_SWEEP = 150;

/**
 * The curve doubles back through the viewer's line of sight.
 *
 * A 135 degree arc's second leg rises at 45 degrees back towards the viewer.
 * Seen from the right height that segment runs almost along the line of sight,
 * so its angular position stops climbing and reverses — two different parts of
 * the ground claim the same direction. There is no flat image of that, and
 * stacking the strips anyway would silently paint one over the other. Refusing
 * is the honest answer; the plain crop still works, because it never claimed
 * the strips were a projection of anything.
 */
export class PanoramaFolds extends RangeError {
    constructor() {
        super(
            'The curve turns back through the line of sight from this viewpoint, so two parts of it share a direction. ' +
                'Raise or lower the viewpoint, or stay with the plain crop.'
        );
        this.name = 'PanoramaFolds';
    }
}

export class PanoramaTooWide extends RangeError {
    constructor(readonly sweepDegrees: number) {
        super(
            `The curve sweeps ${sweepDegrees.toFixed(0)}° as seen from the viewpoint, past the ${String(MAX_PANORAMA_SWEEP)}° a flat projection can carry. ` +
                'Lower the viewpoint, shorten the second leg, or stay with the plain crop.'
        );
        this.name = 'PanoramaTooWide';
    }
}

/**
 * The panorama's own camera, sized to hold the whole curve.
 *
 * The axis points at the curve's **angular** bisector rather than at the
 * midpoint of its chord. Those are not the same ray, and the difference is not
 * cosmetic: aiming at the chord's midpoint left parts of a strongly bent curve
 * behind the plane of the lens, which failed on an eighth of the parameter
 * space for no reason other than a badly chosen axis.
 *
 * Focal length is then whatever fits. It would ideally come from the width and
 * the source camera's horizontal field, so the panorama samples laterally at
 * about the rate the frames do — but a wide sweep makes that arbitrarily tall,
 * and a 27,000 pixel canvas is not a picture. When the height would exceed its
 * cap the focal length is reduced instead, which keeps the whole curve in frame
 * at lower resolution rather than silently cropping one end of it.
 */
export function panoramaGeometryFor(
    steps: readonly Step[],
    viewPoint: Point,
    source: CameraProfile,
    limits: PanoramaLimits
): PanoramaGeometry {
    if (steps.length === 0) throw new RangeError('A panorama needs at least one frame.');

    const centre = worldOf(viewPoint);
    const curvePoints = steps.flatMap(step => [step.firstElement.pointOnTheCurve, step.lastElement.pointOnTheCurve]);

    const angles = curvePoints.map(point => atan2(point.y - viewPoint.y, point.x - viewPoint.x));
    const lowest = Math.min(...angles);
    const highest = Math.max(...angles);

    const sweep = toDegrees(radiansOf(highest - lowest));
    if (sweep > MAX_PANORAMA_SWEEP) throw new PanoramaTooWide(sweep);

    const bisector = radiansOf((lowest + highest) / 2);
    const basis = lookAt(centre, {
        x: 0,
        y: viewPoint.y + sin(bisector),
        z: viewPoint.x + cos(bisector),
    });

    // Rows at unit focal length, so the scale can be chosen after the extent is
    // known rather than guessed before it.
    const unit: Pinhole = {
        centre,
        basis,
        focal: 1,
        principal: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
    };
    const unitRows = curvePoints.map(point => project(unit, worldOf(point)).y);

    // Rows must run one way along the curve. Where they turn around, the strips
    // overlap instead of tiling and the picture means nothing.
    const rising = (unitRows[unitRows.length - 1] ?? 0) >= (unitRows[0] ?? 0);
    for (let i = 1; i < unitRows.length; i++) {
        const previous = unitRows[i - 1] ?? 0;
        const current = unitRows[i] ?? 0;
        if (rising ? current < previous : current > previous) throw new PanoramaFolds();
    }

    const unitSpan = Math.max(...unitRows) - Math.min(...unitRows);

    const preferred = limits.width / 2 / tan(toRadians(source.hFov / 2));
    const focal = unitSpan > 0 ? Math.min(preferred, limits.maxHeight / unitSpan) : preferred;

    const width = Math.max(1, Math.round(2 * focal * tan(toRadians(source.hFov / 2))));
    const height = Math.max(1, Math.ceil(unitSpan * focal));
    const top = Math.min(...unitRows) * focal;

    return {
        camera: {
            centre,
            basis,
            focal,
            principal: { x: width / 2, y: -top },
            size: { width, height },
        },
        width,
        height,
    };
}

/** The row a lateral line of the curve occupies. Constant along the line. */
function rowOf(panorama: PanoramaGeometry, curvePoint: Point): number {
    return project(panorama.camera, worldOf(curvePoint)).y;
}

/**
 * Resample one strip instead of cutting it.
 *
 * The four corners are exact correspondences: a panorama corner is unprojected
 * onto its curve line to recover how far sideways it sits, that lateral offset
 * is carried down to the ground line the curve line depicts, and the ground
 * point is projected into the frame that photographed it. A homography through
 * four exact points is then exact everywhere the plane approximation holds.
 */
export function stripSampling(step: Step, source: CameraProfile, panorama: PanoramaGeometry): StripSampling {
    const { near, far } = edgesOf(step);

    const nearRow = rowOf(panorama, near.pointOnTheCurve);
    const farRow = rowOf(panorama, far.pointOnTheCurve);

    const top = Math.min(nearRow, farRow);
    const bottom = Math.max(nearRow, farRow);
    // Whichever edge is uppermost in the panorama supplies the top two corners.
    const upper = farRow <= nearRow ? far : near;
    const lower = upper === far ? near : far;

    const camera = pinholeForStep(step, source);

    const corners: [Vec2, Triple][] = [
        [{ x: 0, y: top }, upper],
        [{ x: panorama.width, y: top }, upper],
        [{ x: panorama.width, y: bottom }, lower],
        [{ x: 0, y: bottom }, lower],
    ];

    const destination = corners.map(([pixel]) => pixel) as unknown as Quad;

    const sourceQuad = corners.map(([pixel, triple]) => {
        // How far sideways this corner sits, recovered on the curve line it
        // belongs to, then carried down to the ground line that line depicts.
        const onCurve = rayAtAlongTrack(panorama.camera, pixel, triple.pointOnTheCurve.x);
        return project(camera, worldOf(triple.pointOnTheGround, onCurve.x));
    }) as unknown as Quad;

    return {
        destination: { x: 0, y: top, width: panorama.width, height: bottom - top },
        toSource: quadToQuad(destination, sourceQuad),
        camera: step.shootingPoint,
        ground: step.centerElement.pointOnTheGround,
        curve: step.centerElement.pointOnTheCurve,
    };
}

/** The camera that took a given frame. */
export function pinholeForStep(step: Step, source: CameraProfile): Pinhole {
    return pinholeAt(worldOf(step.shootingPoint), worldOf(step.shootedPoint), source.vFov, source.sensorPixels);
}

/**
 * Give neighbouring strips something to overlap in, so a seam can be chosen.
 *
 * After the warp the strips abut exactly — that is the whole point of it — and
 * abutting leaves nowhere to put a seam. The imagery for an overlap exists
 * already: a frame covers the sensor's full 46.8 degrees while its strip is
 * allotted about twenty, so most of every photograph is discarded. A projective
 * map does not stop at the corners it was built from, so simply asking for rows
 * beyond the nominal range returns the neighbouring ground, and the renderer
 * discards whatever falls outside the photograph.
 *
 * Strips alternate between two layers so that a layer never overlaps itself.
 * With the overshoot at 0.4 of the smaller neighbour, strip i reaches at most
 * 0.4 of the way into strip i+1, while strip i+2 reaches back at most 0.4 from
 * the far side — 0.4 against 0.6, so the two never meet. That is what lets the
 * whole panorama be composited from exactly two layers instead of one per
 * strip, which for a 161-frame plan is the difference between two canvases and
 * a hundred and sixty-one.
 */
export interface StripPlacement {
    /** Index into the array handed in, so the caller can still find its frame. */
    readonly index: number;
    /** The sampling, with its destination widened into the neighbours. */
    readonly sampling: StripSampling;
    /** Where the strip would end if it did not overlap. */
    readonly nominal: { readonly y: number; readonly height: number };
    /** Which of the two composite layers this strip draws into. */
    readonly layer: 0 | 1;
}

/** The band two neighbouring strips share, and in which their seam may run. */
export interface SeamBand {
    /** Between `strips[index]` and `strips[index + 1]`, once sorted down the panorama. */
    readonly index: number;
    readonly y: number;
    readonly height: number;
}

export const DEFAULT_OVERLAP_FRACTION = 0.4;

export function overlappingStrips(
    samplings: readonly StripSampling[],
    overlapFraction: number = DEFAULT_OVERLAP_FRACTION
): StripPlacement[] {
    if (overlapFraction <= 0 || overlapFraction >= 0.5) {
        // At a half the two layers would touch, and the second layer would then
        // overlap itself — which is exactly the case this scheme exists to
        // avoid.
        throw new RangeError('Overlap must be between 0 and 0.5 of the smaller neighbouring strip.');
    }

    // Sorted down the panorama, but each keeps the index it arrived with: the
    // caller still has to pair a strip with the photograph it came from, and
    // plan order is not panorama order.
    const ordered = samplings
        .map((sampling, index) => ({ sampling, index }))
        .sort((a, b) => a.sampling.destination.y - b.sampling.destination.y);

    return ordered.map(({ sampling, index: original }, index) => {
        const previous = ordered[index - 1]?.sampling;
        const next = ordered[index + 1]?.sampling;
        const height = sampling.destination.height;

        const up = previous ? overlapFraction * Math.min(previous.destination.height, height) : 0;
        const down = next ? overlapFraction * Math.min(next.destination.height, height) : 0;

        return {
            index: original,
            sampling: {
                ...sampling,
                destination: {
                    ...sampling.destination,
                    y: sampling.destination.y - up,
                    height: height + up + down,
                },
            },
            nominal: { y: sampling.destination.y, height },
            layer: (index % 2) as 0 | 1,
        };
    });
}

/** Where each seam may be routed. One per gap between strips. */
export function seamBands(placements: readonly StripPlacement[]): SeamBand[] {
    const bands: SeamBand[] = [];

    for (let index = 0; index + 1 < placements.length; index++) {
        const above = placements[index];
        const below = placements[index + 1];
        if (!above || !below) continue;

        const top = below.sampling.destination.y;
        const bottom = above.sampling.destination.y + above.sampling.destination.height;

        // Always one band per gap, even where the strips failed to overlap.
        // A band of no height simply means the seam has nowhere to go and the
        // cut stays on the nominal boundary — which is what the plain warp
        // already does, so the composite degrades rather than breaking.
        bands.push(
            bottom > top
                ? { index, y: top, height: bottom - top }
                : { index, y: above.nominal.y + above.nominal.height, height: 0 }
        );
    }

    return bands;
}
