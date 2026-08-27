/**
 * Angle units, made non-interchangeable.
 *
 * This codebase mixes degrees and radians constantly: the domain speaks degrees
 * (gimbal pitch, field of view, bearings) while Math speaks radians. The old
 * code guarded that only by remembering to write toRadians() at each call site.
 *
 * Branding alone would not help — `Math.cos` takes a plain `number`, so a
 * branded Degrees would sail straight into it. What closes the hole is routing
 * trig through wrappers that accept *only* Radians. `cos(someDegrees)` is now a
 * compile error, and the sole way to obtain a Radians is toRadians().
 *
 * The brands cost nothing at runtime: they are erased types over number.
 */

declare const radiansBrand: unique symbol;

/** An angle in radians. Only obtainable via toRadians() or an inverse trig fn. */
export type Radians = number & { readonly [radiansBrand]: true };

/**
 * Angles in degrees stay plain `number`.
 *
 * Branding them too was considered and dropped: it would ripple through every
 * public interface (Step.angleOfView, viewAngleToTheGround, field-of-view
 * constants, the golden harness) for protection the wrappers below already
 * provide at the only place the confusion actually occurs.
 */
export function toRadians(angle: number): Radians {
    return (angle * (Math.PI / 180)) as Radians;
}

/**
 * Assert that a number already is radians.
 *
 * Needed where arithmetic legitimately produces an angle without going through
 * toRadians — summing two radian values, or dividing an arc length by a radius.
 * Adding two Radians yields a plain number, which is the type system doing its
 * job: it makes each such spot an explicit, greppable claim.
 */
export function radiansOf(value: number): Radians {
    return value as Radians;
}

export function toDegrees(angle: Radians): number {
    return angle * (180 / Math.PI);
}

export function sin(angle: Radians): number {
    return Math.sin(angle);
}

export function cos(angle: Radians): number {
    return Math.cos(angle);
}

export function acos(ratio: number): Radians {
    return Math.acos(ratio) as Radians;
}

export function asin(ratio: number): Radians {
    return Math.asin(ratio) as Radians;
}

export function atan2(y: number, x: number): Radians {
    return Math.atan2(y, x) as Radians;
}

/**
 * Only needed where a ratio of distances is wanted rather than a projection —
 * a field of view converted to a ground width, say. Most of the codebase gets
 * by on sin and cos because it solves triangles from sides, not from slopes.
 */
export function tan(angle: Radians): number {
    return Math.tan(angle);
}
