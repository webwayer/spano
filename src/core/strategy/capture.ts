import type { CameraProfile } from '../camera/profiles';
import { DEFAULT_ALTITUDE_CEILING } from '../camera/profiles';
import type { Curve } from '../curves/curve';
import { NodalSweepCurve } from '../curves/nodal-sweep';
import { getPointsForViewport, MIN_WAYPOINT_SPACING } from '../geo/flight-path';
import { plan, type Plan, type PlanOptions } from '../planner/plan';
import { surveySteps } from './survey';
import type { Point, Step } from '../types';

/**
 * The ways a curved panorama can be photographed, as data.
 *
 * There is exactly one defect these differ on, and it is worth stating plainly
 * because it decides everything else: an object standing above the ground is
 * imaged in two different places by two frames shot from two different
 * positions, and no amount of cropping or planar warping puts it back. The
 * strategies below trade three things against each other — how many frames the
 * flight costs, how much the ground is foreshortened, and how far objects
 * slide at the seams. None of them wins on all three.
 *
 * Shaped after CAMERA_PROFILES rather than after the curves: a list the UI
 * enumerates and a lookup by id with a fallback, so adding one is data plus a
 * build function. The curves, by contrast, are selected by a ternary repeated
 * in three files, and that is not a pattern worth spreading.
 *
 * Nothing here reimplements the planner. `plan()` has always accepted the
 * options that make `fine-strips` work; the UI simply never passed them
 * (`src/main.ts` calls `plan(curve, viewPoint)` bare). That is why adding these
 * modes cannot move the golden baselines: the incumbent path is not edited, it
 * is called with its own defaults.
 */
export type CaptureStrategyId = 'arc-strips' | 'fine-strips' | 'dense-linear' | 'nodal-sweep' | 'photogrammetry';

/**
 * How finely a strategy samples. Coarsest first; never empty.
 *
 * The numbers are measured, not guessed. On `Arc90Curve(50, 50, 50, 50)` with
 * the viewpoint at 50 m, the product of frame count and worst seam slide holds
 * near 11.8 across the whole range — slide trades against frames one for one,
 * which is the pushbroom result stated in the units a pilot cares about. Two
 * things that fall out of that measurement and are not obvious:
 *
 * - Lowering `maxDistortionAngle` alone stops working below 1 degree, because a
 *   strip cannot be narrower than one sample. `stepLength` has to come down
 *   with it or the extra frames buy nothing.
 * - The relationship is not monotone in either knob alone. `stepLength` 0.1 at
 *   the default 7 degree budget measures *worse* than the default, and on a
 *   100 m arc `{0.25, 0.25}` yields **fewer** frames than `{0.5, 0.25}`. The
 *   allocator is greedy, merges pairs of groups and overlaps by a sample.
 *
 * The ladder below therefore halves *both* knobs together at each step, which
 * is the one family that came out monotone in frames and in slide across every
 * curve it was measured on — 90 and 135 degree arcs, radii from 17 to 200 m.
 *
 * Monotone there, but not universally: a sweep of 1,152 parameter combinations
 * finds 42 where a finer step measures worse, all of them in the same corner
 * that already produces 178 degree frames and sub-ground shooting points —
 * 10 m offsets and radii under a 200 m viewpoint. That is why the ladder is
 * pinned by unit tests on named curves rather than by a property test: a rule
 * that holds 96% of the time is not a property, it is a flaky test waiting to
 * happen.
 * An earlier version picked each step by its best measurement on a single
 * curve, and shipped labels promising 4x, 8x and 16x the frames; on the form's
 * own default arc the 8x preset produced 161 frames and the 16x one 141. The
 * lesson is in the code rather than the commit message because the next person
 * to tune these will reach for the same shortcut.
 */
/**
 * Every way of turning strips into a panorama.
 *
 * All of them are offered on every capture that produces strips at all, and
 * that is deliberate: seeing a mode produce no effect is itself a finding, and
 * a picker that decides for you cannot tell you that. What each capture is
 * *suited* to is a separate question, answered by `recommendedProcessing` and
 * shown as an expectation rather than enforced as a rule.
 */
const ALL_PROCESSING = ['crop', 'homography', 'seam-blend', 'depth-warp', 'flow-blend'] as const;

/** Ways of turning stacked strips into a panorama that need no baseline. */
const STRIP_PROCESSING = ['crop', 'homography', 'seam-blend'] as const;

/**
 * The same, plus the mode that measures how tall things are.
 *
 * Offered on the *wide* plan and withheld from the dense one, which is the
 * reverse of every other rule here and is not a mistake. Height comes from the
 * parallax between two frames, and narrowing the strips exists precisely to
 * make that parallax small: on the default curve a row of measured disparity
 * means 0.36 m of height at wide strips and 18 m at the dense pass. The mode
 * that removes the defect is the one that needs the defect to be large.
 */
const STRIP_PROCESSING_WITH_DEPTH = [...STRIP_PROCESSING, 'depth-warp'] as const;

/**
 * The same, plus the mode that measures the disagreement at a seam.
 *
 * Withheld from the wide-strip plan on purpose: at fifteen degrees between
 * frames the ground moves further than any sensible search covers, so the
 * measurement would return nothing and the mode would quietly become an
 * ordinary cross-fade under a name promising otherwise. Withheld from the
 * single hover for the opposite reason — one viewpoint has no parallax to
 * measure, so there is nothing for it to do.
 */
const STRIP_PROCESSING_WITH_FLOW = [...STRIP_PROCESSING, 'flow-blend'] as const;

export interface CaptureDensity {
    readonly id: string;
    readonly label: string;
    readonly options: PlanOptions;
}

export interface CaptureStrategy {
    readonly id: CaptureStrategyId;
    readonly name: string;
    /** One sentence, shown under the picker. */
    readonly summary: string;
    readonly densities: readonly CaptureDensity[];
    /**
     * Spacing to hand `getGeoSteps` when exporting a mission.
     *
     * Coincident waypoints normally get pushed apart, because a flight
     * controller cannot resolve them. A nodal sweep is the case where they
     * coincide *on purpose*, and nudging them would spread the hover across
     * metres of track — reintroducing exactly the parallax the strategy exists
     * to remove, while the plan on screen still read zero.
     */
    readonly minWaypointSpacing: number;
    /**
     * False for a flight that photographs the ground rather than the panorama.
     *
     * The seam-slide figure is the whole basis of the comparison, and it means
     * nothing where consecutive frames share no edge. Saying so lets the table
     * print "not applicable" instead of a number computed from nothing, which
     * would be the more confident and the more wrong of the two.
     */
    readonly hasSeams: boolean;
    /**
     * Processing modes this flight can be turned into a panorama by at all.
     *
     * A survey grid has no one-to-one mapping from frames to panorama bands —
     * it flies several lines over the same ground, so several frames claim the
     * same rows — and the reprojection has nothing to reproject onto. That is a
     * property of the flight, not a judgement about it.
     */
    readonly processingModes: readonly string[];
    /**
     * Modes expected to do something useful on this capture.
     *
     * Everything in `processingModes` can be selected; this is what the note
     * under the picker warns about. The two advanced modes want opposite
     * things — the morph needs frames close enough to match, the height
     * measurement needs them far enough apart to disagree — so a capture that
     * suits one usually does not suit the other.
     */
    readonly recommendedProcessing: readonly string[];
    /**
     * Why the unsuited modes are unsuited *here*, when the generic reason is
     * wrong.
     *
     * The single hover is the case that needs it: the generic warning says the
     * frames are too far apart to match, and here they are not far apart at
     * all — they are in the same place, which is a different fact with the same
     * consequence, and telling someone the wrong reason is worse than telling
     * them nothing.
     */
    readonly processingCaveat?: string;
    build(curve: Curve, viewPoint: Point, camera: CameraProfile, density?: CaptureDensity): Plan;
}

/** The density a strategy uses when the caller does not choose one. */
export function defaultDensity(strategy: CaptureStrategy): CaptureDensity {
    const first = strategy.densities[0];
    if (!first) throw new Error(`Capture strategy ${strategy.id} declares no densities.`);
    return first;
}

const AS_PLANNED: CaptureDensity = { id: 'as-planned', label: 'As planned', options: {} };

export const ARC_STRIPS: CaptureStrategy = {
    id: 'arc-strips',
    name: 'Wide strips',
    summary: 'The original plan: about 20 degrees of ground per frame. Fewest frames, most seam slide.',
    densities: [AS_PLANNED],
    minWaypointSpacing: MIN_WAYPOINT_SPACING,
    hasSeams: true,
    processingModes: ALL_PROCESSING,
    recommendedProcessing: STRIP_PROCESSING_WITH_DEPTH,
    build: (curve, viewPoint) => plan(curve, viewPoint),
};

export const FINE_STRIPS: CaptureStrategy = {
    id: 'fine-strips',
    name: 'Fine strips',
    summary: 'Narrower strips from the same flight path. Seam slide falls in proportion to the frames added.',
    densities: [
        { id: 'fine', label: '1° per frame', options: { maxDistortionAngle: 1, stepLength: 1 } },
        { id: 'finer', label: '0.5° per frame', options: { maxDistortionAngle: 0.5, stepLength: 0.5 } },
        { id: 'finest', label: '0.25° per frame', options: { maxDistortionAngle: 0.25, stepLength: 0.25 } },
    ],
    minWaypointSpacing: MIN_WAYPOINT_SPACING,
    hasSeams: true,
    processingModes: ALL_PROCESSING,
    recommendedProcessing: [...STRIP_PROCESSING_WITH_FLOW, 'depth-warp'],
    build: (curve, viewPoint, _camera, density = defaultDensity(FINE_STRIPS)) =>
        plan(curve, viewPoint, density.options),
};

/**
 * The same flight again, sampled hard enough for optical flow to work on.
 *
 * Flow needs consecutive frames to be *similar*, not merely overlapping: it
 * matches a patch by searching a neighbourhood, and a wide baseline moves the
 * ground further than the search covers. `fine-strips` narrows the strips to
 * shrink the seam disagreement directly; this narrows them until the
 * disagreement is small enough to be *measured*, which is a stricter thing to
 * ask and costs correspondingly more frames.
 *
 * The distinction matters because the two modes look identical in the
 * comparison table — same path, same altitudes, fewer metres of slide. What
 * separates them is which downstream processing becomes possible.
 */
export const DENSE_LINEAR: CaptureStrategy = {
    id: 'dense-linear',
    name: 'Dense pass',
    summary: 'Fine strips taken further, so consecutive frames are close enough for optical flow to match them.',
    densities: [
        { id: 'dense', label: '0.1° per frame', options: { maxDistortionAngle: 0.1, stepLength: 0.1 } },
        { id: 'denser', label: '0.05° per frame', options: { maxDistortionAngle: 0.05, stepLength: 0.05 } },
    ],
    minWaypointSpacing: MIN_WAYPOINT_SPACING,
    hasSeams: true,
    processingModes: ALL_PROCESSING,
    recommendedProcessing: STRIP_PROCESSING_WITH_FLOW,
    build: (curve, viewPoint, _camera, density = defaultDensity(DENSE_LINEAR)) =>
        plan(curve, viewPoint, density.options),
};

export const NODAL_SWEEP: CaptureStrategy = {
    id: 'nodal-sweep',
    name: 'Single hover',
    summary: 'Hold one position and sweep the gimbal. No parallax at all, at the cost of foreshortened distance.',
    densities: [
        { id: 'wide', label: 'Wide frames', options: {} },
        { id: 'medium', label: 'Medium frames', options: { maxViewAngle: 10 } },
        { id: 'narrow', label: 'Narrow frames', options: { maxViewAngle: 5 } },
    ],
    // Every waypoint is the same waypoint. See minWaypointSpacing above.
    minWaypointSpacing: 0,
    processingCaveat:
        'there is only one viewpoint here, so there is no parallax to measure and no disagreement to morph — ' +
        'these modes have nothing to work on, which is the whole point of this capture',
    hasSeams: true,
    processingModes: ALL_PROCESSING,
    recommendedProcessing: STRIP_PROCESSING,
    build: (curve, viewPoint, _camera, density = defaultDensity(NODAL_SWEEP)) =>
        plan(new NodalSweepCurve(curve), viewPoint, density.options),
};

/**
 * How wide, how high and how far the survey has to reach.
 *
 * Taken from the panorama it is meant to serve rather than from a form field:
 * the survey covers exactly the ground the strips would have imaged, and flies
 * at about the height they would have flown, so its ground resolution is
 * comparable. Clamped to something legal at the top, because a plan that climbs
 * to 200 m is a plan nobody may fly.
 */
function areaFor(
    curve: Curve,
    viewPoint: Point,
    camera: CameraProfile
): {
    from: number;
    to: number;
    halfWidth: number;
    altitude: number;
} {
    const { steps } = plan(curve, viewPoint);
    const altitudes = steps.map(step => step.shootingPoint.y).filter(altitude => altitude > 0);
    const mean = altitudes.length > 0 ? altitudes.reduce((a, b) => a + b, 0) / altitudes.length : 60;

    const halfWidths = steps.map(step => getPointsForViewport(step, camera.hFov).topViewportOffset);

    return {
        from: curve.getPointOnTheGround(0).x,
        to: curve.getPointOnTheGround(curve.getTotalLength()).x,
        halfWidth: Math.max(10, ...halfWidths.filter(Number.isFinite)),
        altitude: Math.min(DEFAULT_ALTITUDE_CEILING, Math.max(30, mean)),
    };
}

/**
 * A survey produces no panorama on its own, and that is not a shortcoming.
 *
 * Everything else here trades seam slide against frame count and never reaches
 * zero, because a crop and a planar warp cannot invent the ray the panorama
 * needs. This flight is the input to something that can: reconstruct the scene
 * from overlapping coverage, then render the ray. The page exports the poses
 * for it.
 */
export const PHOTOGRAMMETRY: CaptureStrategy = {
    id: 'photogrammetry',
    name: 'Survey grid',
    summary:
        'Not a panorama: overlapping coverage for an offline reconstruction, which the panorama is then rendered from.',
    densities: [
        { id: 'nadir', label: 'Straight down, 80/70 overlap', options: {} },
        { id: 'oblique', label: 'Straight down and 45° forward', options: {} },
    ],
    minWaypointSpacing: MIN_WAYPOINT_SPACING,
    hasSeams: false,
    // Nothing, and this one really is nothing rather than a discouragement:
    // several lines cover the same ground, so several frames claim the same
    // panorama rows and there is no strip to reproject.
    processingModes: [],
    recommendedProcessing: [],
    build: (curve, viewPoint, camera, density = { id: 'nadir', label: '', options: {} }) => {
        const area = areaFor(curve, viewPoint, camera);
        const steps: Step[] = surveySteps(area, camera, {
            altitude: area.altitude,
            frontOverlap: 0.8,
            sideOverlap: 0.7,
            ...(density.id === 'oblique' ? { obliquePitch: -45 } : {}),
        });

        // A survey has no curve samples, segments or shots to speak of. Filling
        // the Plan with empty arrays rather than inventing them keeps anything
        // that reads them honest.
        return {
            totalCurveLength: curve.getTotalLength(),
            pointTriples: [],
            shootingErrors: [],
            segments: [],
            shots: [],
            steps,
        };
    },
};

export const CAPTURE_STRATEGIES: readonly CaptureStrategy[] = [
    ARC_STRIPS,
    FINE_STRIPS,
    DENSE_LINEAR,
    NODAL_SWEEP,
    PHOTOGRAMMETRY,
];

/** What the page shows before anyone chooses. Keeps the incumbent plan on screen. */
export const DEFAULT_CAPTURE_STRATEGY: CaptureStrategy = ARC_STRIPS;

/** Lookup with a fallback, matching how a camera profile is resolved from the form. */
export function captureStrategyById(id: string): CaptureStrategy {
    return CAPTURE_STRATEGIES.find(strategy => strategy.id === id) ?? DEFAULT_CAPTURE_STRATEGY;
}

/** Density lookup within a strategy, with the same fallback discipline. */
export function densityById(strategy: CaptureStrategy, id: string): CaptureDensity {
    return strategy.densities.find(density => density.id === id) ?? defaultDensity(strategy);
}
