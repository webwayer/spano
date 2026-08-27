/**
 * Shared value types for the planning core.
 *
 * All coordinates are in metres. The plane is a vertical slice through the
 * flight path: x runs away from the start point along the ground, y is
 * altitude. Angles are in degrees unless a name says otherwise.
 */

/** A point in the vertical slice. x = ground distance, y = altitude, both metres. */
export interface Point {
    x: number;
    y: number;
}

/** WGS-84 position in decimal degrees. */
export interface GeoPoint {
    lat: number;
    lon: number;
}

/**
 * One sample along the curve.
 *
 * `pointOnTheGround` is the patch of ground being imaged, `pointOnTheCurve` is
 * where that patch must appear on the virtual panorama surface, and
 * `shootingPoint` is where the camera has to be for the two to line up.
 */
export interface Triple {
    pointOnTheCurve: Point;
    pointOnTheGround: Point;
    shootingPoint: Point;
}

/** A run of samples whose shooting error has roughly constant character. */
export interface Segment {
    triples: Triple[];
    avgError: number;
}

/** Where within its sample range a shot is actually taken from. */
export type ShotAnchor = 'start' | 'center' | 'end';

/** A group of samples that one photograph covers. */
export interface Shot {
    shotOn: ShotAnchor;
    triples: Triple[];
}

/** One instruction for the pilot: hover here, at this altitude, at this gimbal angle. */
export interface Step {
    shotOn: ShotAnchor;
    /** Where the aircraft hovers. */
    shootingPoint: Point;
    /** The ground point at the centre of frame. */
    shootedPoint: Point;
    /** Angular height of the ground strip this frame covers, degrees. */
    angleOfView: number;
    /** Gimbal pitch relative to horizontal; negative points down. */
    viewAngleToTheGround: number;
    /** True when the aircraft faces back toward the start point. */
    backwards: boolean;
    /**
     * Sideways offset from the centreline, metres. Absent for every strip plan.
     *
     * The whole model is a vertical slice — x along the ground, y altitude —
     * and that has served since 2018 because a panorama is photographed along
     * one line. A photogrammetric survey is not: it flies a grid, and a grid
     * needs an axis the slice does not have.
     *
     * Optional rather than required, and read through `?? 0`, so every existing
     * plan produces the identical numbers it always did. `tests/golden/` proves
     * that rather than asserting it: the recorders project a fixed list of
     * fields, so a new one is simply never written, and `flight-path.json` did
     * not move when this arrived.
     */
    lateralOffset?: number;
    firstElement: Triple;
    centerElement: Triple;
    lastElement: Triple;
}

/** A step placed on the map, ready for a mission export. */
export interface GeoStep {
    geoPoint: GeoPoint;
    heading: number;
    shootingPoint: Point;
    viewAngleToTheGround: number;
}
