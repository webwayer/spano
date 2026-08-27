import type { Point } from '../types';
import type { Curve } from './curve';

/**
 * Any curve, shot from a single hovering position.
 *
 * The aircraft does not move: it holds the viewer's own point and sweeps the
 * gimbal across the ground. That makes the parallax of objects standing above
 * the ground exactly zero, because parallax needs two viewpoints and there is
 * only one. It is the only mode in this project for which that is a theorem
 * rather than a measurement.
 *
 * What it costs is the reason the rest of the project exists: ground far down
 * the curve is seen at a glancing angle, so it is foreshortened and coarse. The
 * whole point of flying the arc is to photograph distant ground more nearly
 * face-on, and that is precisely what introduces the second viewpoint.
 *
 * Implemented as a decorator rather than a planner because nothing else has to
 * change. `getShootingPoint` is the only place the five stages ask where the
 * aircraft is, so overriding it alone propagates correctly:
 *
 * - `error-model.ts` compares the angle to a ground patch from this shooting
 *   point against the angle from the previous one. Both are now the same point,
 *   so it compares an expression against itself: every shooting error is
 *   **exactly** zero, not nearly.
 * - `segmentation.ts` never splits, because the delta is always 0 <= 0.1.
 * - `allocation.ts` takes the flat branch, since avgError 0 is below any flatness threshold,
 *   and divides the sweep by field of view alone.
 * - `steps.ts` gives `backwards: false` throughout: the hover sits at x = 0 and
 *   every ground patch is further along than that.
 *
 * One caller-side hazard is *not* handled here, because it lives downstream:
 * `getGeoSteps` pushes coincident waypoints apart by `MIN_WAYPOINT_SPACING`, and
 * for a sweep every waypoint is coincident. Left alone it would spread the hover
 * across metres of track and quietly reintroduce the parallax this class exists
 * to remove, while the plan on screen still read zero. Mission export for this
 * strategy must pass `minSpacing: 0`.
 */
export class NodalSweepCurve implements Curve {
    constructor(private readonly inner: Curve) {
        // getTopAngle divides by the distance from the origin to the ground
        // point, so a curve starting at the origin would produce NaN two stages
        // later. Every built-in curve starts at `offset` with a form minimum of
        // 10 m, so this is unreachable from the UI — but the decorator accepts
        // any Curve, and inheriting an undocumented precondition is how the
        // triangle solvers earned their own guards.
        const start = inner.getPointOnTheGround(0);
        if (start.x === 0 && start.y === 0) {
            throw new RangeError('A nodal sweep needs ground offset from the viewer: its curve starts at the origin.');
        }
    }

    getTotalLength(): number {
        return this.inner.getTotalLength();
    }

    getPointOnTheGround(length: number): Point {
        return this.inner.getPointOnTheGround(length);
    }

    getPointOnTheCurve(length: number): Point {
        return this.inner.getPointOnTheCurve(length);
    }

    /** The aircraft never moves. This is the entire strategy. */
    getShootingPoint(_length: number, viewPoint: Point): Point {
        return viewPoint;
    }
}
